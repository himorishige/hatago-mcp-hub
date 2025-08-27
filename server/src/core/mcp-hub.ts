import type { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { Server as McpServer } from '@modelcontextprotocol/sdk/server/index.js';
import {
  type CallToolRequest,
  CallToolRequestSchema,
  type CallToolResult,
  type ListResourcesRequest,
  ListResourcesRequestSchema,
  type ListResourcesResult,
  ListToolsRequestSchema,
  type ReadResourceRequest,
  ReadResourceRequestSchema,
  type ReadResourceResult,
  type Resource,
} from '@modelcontextprotocol/sdk/types.js';
import type {
  HatagoConfig,
  NpxServerConfig,
  RemoteServerConfig,
  ServerConfig,
} from '../config/types.js';
import type { StreamableHTTPTransport } from '../hono-mcp/index.js';
import type { CustomStdioTransport as StdioTransport } from '../servers/custom-stdio-transport.js';
import { NpxMcpServer } from '../servers/npx-mcp-server.js';
import { RemoteMcpServer } from '../servers/remote-mcp-server.js';
import { ServerRegistry } from '../servers/server-registry.js';
import type { RegistryStorage } from '../storage/registry-storage.js';
import { ErrorHelpers } from '../utils/errors.js';
import type { Logger } from '../utils/logger.js';
import { logger } from '../utils/logger.js';
import { createMutex } from '../utils/mutex.js';
import { McpHubPromptManager } from './mcp-hub-prompts.js';
import { McpHubResourceManager } from './mcp-hub-resources.js';
import { McpHubToolManager } from './mcp-hub-tools.js';
import {
  createPromptRegistry,
  type PromptRegistry,
} from './prompt-registry.js';
import {
  createResourceRegistry,
  type ResourceRegistry,
} from './resource-registry.js';
import { SessionManager } from './session-manager.js';
import { ToolRegistry } from './tool-registry.js';

// MCP server connection information
export interface McpConnection {
  serverId: string;
  client?: Client; // For local servers
  transport?: StdioTransport; // For local servers
  npxServer?: NpxMcpServer; // For NPX servers
  remoteServer?: RemoteMcpServer; // For remote servers
  connected: boolean;
  capabilities?: unknown;
  type: 'local' | 'remote' | 'npx';
}

// MCP Hub options
export interface McpHubOptions {
  config: HatagoConfig;
}

/**
 * MCP Hub - Manages multiple MCP servers in a unified way
 */
export class McpHub {
  private server: McpServer;
  private registry: ToolRegistry;
  private resourceRegistry: ResourceRegistry;
  private promptRegistry: PromptRegistry;
  private connections = new Map<string, McpConnection>();
  private config: HatagoConfig;
  private initialized = false;
  private serverRegistry?: ServerRegistry;
  private registeredTools = new Set<string>(); // Track registered tools to avoid duplicates
  private toolRegistrationMutex = createMutex(); // Mutex for tool registration
  private sessionManager: SessionManager;
  private logger: Logger;
  private transport?: StreamableHTTPTransport; // Store transport for progress notifications
  private toolManager?: McpHubToolManager;
  private resourceManager?: McpHubResourceManager;
  private promptManager?: McpHubPromptManager;

  constructor(options: McpHubOptions) {
    this.config = options.config;

    // Create logger for McpHub
    this.logger = logger;

    // Create MCP server
    this.server = new McpServer({
      name: 'hatago-hub',
      version: '0.0.2',
    });

    // Initialize tool registry
    this.registry = new ToolRegistry({
      namingConfig: this.config.toolNaming,
    });

    // Initialize resource registry
    this.resourceRegistry = createResourceRegistry({
      namingConfig: this.config.toolNaming, // Use same naming strategy for resources
    });

    // Initialize prompt registry
    this.promptRegistry = createPromptRegistry();

    // Initialize session manager
    const sessionTtl = this.config.session?.ttlSeconds ?? 3600;
    this.sessionManager = new SessionManager(sessionTtl);

    // Initialize prompt registry
    // Register tools, resources, and prompt features (must be done before connecting to transport)
    this.server.registerCapabilities({
      tools: {
        listChanged: false, // Tool list change notification is not supported
      },
      resources: {
        listChanged: true,
      },
      prompts: {
        listChanged: true,
      },
    });

    // Set tool handlers on MCP server
    this.setupToolHandlers();
  }

  /**
   * Set up tool-related handlers
   */
  private setupToolHandlers(): void {
    // Note: shutdown handler is handled internally by MCP SDK
    // We don't need to explicitly register it

    // tools/list handler
    this.server.setRequestHandler(ListToolsRequestSchema, async () => {
      const tools = this.registry.getAllTools();
      const result = {
        tools: tools.map((tool) => {
          // Sanitize inputSchema (for MCP Inspector compatibility)
          let sanitizedSchema = tool.inputSchema;

          if (sanitizedSchema && typeof sanitizedSchema === 'object') {
            // Add type: "object" if missing
            if (!sanitizedSchema.type) {
              sanitizedSchema = {
                ...sanitizedSchema,
                type: 'object',
              };
            }
            // Set empty object only if properties is undefined and no other schema definitions exist
            if (
              !sanitizedSchema.properties &&
              !sanitizedSchema.$ref &&
              !sanitizedSchema.allOf &&
              !sanitizedSchema.oneOf &&
              !sanitizedSchema.anyOf
            ) {
              sanitizedSchema.properties = {};
            }
          } else if (!sanitizedSchema) {
            // Default when inputSchema is missing
            sanitizedSchema = {
              type: 'object',
              properties: {},
              additionalProperties: false,
            };
          }

          return {
            name: tool.name,
            description: tool.description,
            inputSchema: sanitizedSchema,
          };
        }),
      };

      return result;
    });

    // Explicitly set tools/call handler
    this.server.setRequestHandler(
      CallToolRequestSchema,
      async (
        request: CallToolRequest,
        extra?: { requestId?: string | number },
      ) => {
        // Request structure debug log removed

        // Use request.params or request directly
        const params = request.params || request;
        const progressToken = params._meta?.progressToken;

        // Set interval for sending progress notifications
        let progressInterval: NodeJS.Timeout | undefined;
        let progressCount = 0; // Progress counter
        if (
          progressToken &&
          this.transport &&
          'sendProgressNotification' in this.transport
        ) {
          // Get requestId from extra or request id
          const requestId =
            extra?.requestId ||
            (request as CallToolRequest & { id?: string | number }).id;

          progressInterval = setInterval(() => {
            try {
              // Send progress notification via transport
              if (
                this.transport &&
                'sendProgressNotification' in this.transport
              ) {
                this.transport.sendProgressNotification(
                  requestId || 0,
                  progressToken,
                  progressCount++, // Send incrementing number
                  // total is omitted (when unknown)
                );
              }
            } catch (_e) {}
          }, 1000); // Send every second
        } else {
        }

        try {
          const result = await this.callTool(
            { params, method: 'tools/call' },
            extra?.requestId,
          );
          // Stop progress notifications
          if (progressInterval) {
            clearInterval(progressInterval);
          }

          // Always return a response
          return result || { content: [], isError: false };
        } catch (error) {
          // Stop progress notifications
          if (progressInterval) {
            clearInterval(progressInterval);
          }

          // Always return a response even on error
          return {
            content: [
              {
                type: 'text',
                text: error instanceof Error ? error.message : 'Unknown error',
              },
            ],
            isError: true,
          };
        }
      },
    );
  }

  /**
   * Set up resource-related handlers
   */
  private setupResourceHandlers(): void {
    // Set resources/list handler
    this.server.setRequestHandler(
      ListResourcesRequestSchema,
      async (_request: ListResourcesRequest): Promise<ListResourcesResult> => {
        const allResources = this.resourceRegistry.getAllResources();

        // TODO: Add pagination support (cursor parameter)
        return {
          resources: allResources,
        };
      },
    );

    // Set resources/read handler
    this.server.setRequestHandler(
      ReadResourceRequestSchema,
      async (request: ReadResourceRequest): Promise<ReadResourceResult> => {
        const { uri } = request.params;

        // Resolve resource
        const resolved = this.resourceRegistry.resolveResource(uri);
        if (!resolved) {
          throw ErrorHelpers.resourceNotFound(uri);
        }

        const { serverId, originalUri } = resolved;

        // Get server connection
        const connection = this.connections.get(serverId);
        if (!connection?.connected) {
          throw ErrorHelpers.serverNotConnected(serverId);
        }

        // Read resource based on connection type
        if (connection.type === 'local' && connection.npxServer) {
          // For local server (actually uses NpxMcpServer)
          const result = await connection.npxServer.readResource(originalUri);
          return result as ReadResourceResult;
        } else if (connection.type === 'npx' && connection.npxServer) {
          // For NPX server
          const result = await connection.npxServer.readResource(originalUri);
          return result as ReadResourceResult;
        } else if (connection.type === 'remote' && connection.remoteServer) {
          // For remote server
          const result =
            await connection.remoteServer.readResource(originalUri);
          return result as ReadResourceResult;
        } else {
          throw ErrorHelpers.unsupportedConnectionType(connection.type);
        }
      },
    );

    // Set resources/templates/list handler (future support)
    // this.server.setRequestHandler('resources/templates/list', ...);
  }

  /**
   * MCPハブを初期化
   */
  async initialize(): Promise<void> {
    if (this.initialized) {
      return;
    }

    this.logger.info('Initializing MCP Hub...');

    // リソースハンドラーを設定（initializeの時点で行う）
    this.setupResourceHandlers();

    // NPXサーバーやリモートサーバーサポートの初期化
    const servers = this.config.servers || [];
    const hasNpxServers = servers.some((s) => s.type === 'npx');
    const hasRemoteServers = servers.some((s) => s.type === 'remote');

    if (hasNpxServers || hasRemoteServers) {
      if (hasNpxServers) {
        // Workspace directory removed (not needed in lite version)

        // Warm up NPX packages to populate cache
        await this.warmupNpxPackages();
      }

      // Create storage based on config
      let storage: RegistryStorage | undefined;
      if (this.config.registry?.persist?.enabled) {
        const { UnifiedFileStorage } = await import(
          '../storage/unified-file-storage.js'
        );
        storage = new UnifiedFileStorage('.hatago/registry.json');
      }

      this.serverRegistry = new ServerRegistry(storage);
      await this.serverRegistry.initialize();
    }

    // 設定されたサーバーを接続
    this.logger.info(`Found ${servers.length} servers in config`);
    for (const serverConfig of servers) {
      this.logger.debug(`Checking server ${serverConfig.id}`);
      try {
        await this.connectServer(serverConfig);
      } catch (error) {
        this.logger.error(
          `Failed to connect server ${serverConfig.id}: ${error}`,
        );
        // エラーが発生しても続行
      }
    }

    this.initialized = true;
  }

  /**
   * Warm up NPX packages by pre-installing them
   */
  private async warmupNpxPackages(): Promise<void> {
    const npxServers = (this.config.servers || []).filter(
      (s) => s.type === 'npx',
    );

    if (npxServers.length === 0) {
      return;
    }

    this.logger.info('🔥 Warming up NPX packages...');

    // Run warmup in parallel for all NPX servers
    const warmupPromises = npxServers.map(async (serverConfig) => {
      try {
        const npxConfig = serverConfig as NpxServerConfig;

        // Get package name from either package property or args
        let packageName: string | undefined = npxConfig.package;

        if (!packageName && npxConfig.args) {
          // Extract package name from args (skip -y flag)
          const argsWithoutFlags = npxConfig.args.filter(
            (arg) => !arg.startsWith('-'),
          );
          packageName = argsWithoutFlags[0];
        }

        if (!packageName) {
          this.logger.warn(
            `  ⚠️  Cannot determine package name for ${serverConfig.id}, skipping warmup`,
          );
          return;
        }

        const packageSpec = npxConfig.version
          ? `${packageName}@${npxConfig.version}`
          : packageName;

        this.logger.info(`  📦 Pre-caching ${packageSpec}...`);

        // Run npx to trigger installation without executing the package
        const { spawn } = await import('node:child_process');
        const command = process.platform === 'win32' ? 'npx.cmd' : 'npx';

        // Use -p to install package and -c to run a harmless command
        // This ensures package is cached without executing it
        const nodeCommand =
          process.platform === 'win32'
            ? 'node -e "process.exit(0)"'
            : "node -e 'process.exit(0)'";

        await new Promise<void>((resolve, reject) => {
          const warmupProcess = spawn(
            command,
            ['-y', '-p', packageSpec, '-c', nodeCommand],
            {
              stdio: 'pipe',
              env: {
                ...process.env,
                NO_COLOR: '1',
                FORCE_COLOR: '0',
                npm_config_loglevel: 'silent',
                npm_config_progress: 'false',
              },
            },
          );

          let hasExited = false;
          let _stderr = '';

          warmupProcess.stderr?.on('data', (data) => {
            _stderr += data.toString();
          });

          warmupProcess.on('error', (error) => {
            if (!hasExited) {
              hasExited = true;
              this.logger.info(
                `  ⚠️  Failed to warm up ${packageSpec}: ${error.message}`,
              );
              // Record cache failure

              reject(error); // Reject on error for tracking
            }
          });

          warmupProcess.on('exit', (code) => {
            if (!hasExited) {
              hasExited = true;
              if (code === 0) {
                this.logger.info(`  ✅ ${packageSpec} cached`);
                // Record successful cache

                resolve();
              } else {
                // With -p/-c approach, non-zero exit usually means npm error
                this.logger.info(
                  `  ⚠️  ${packageSpec} warmup exited with code ${code}`,
                );
                // Record cache failure

                reject(new Error(`Warmup failed with code ${code}`));
              }
            }
          });

          // Set a timeout for warmup
          setTimeout(() => {
            if (!hasExited) {
              hasExited = true;
              warmupProcess.kill('SIGTERM');
              this.logger.info(`  ⚠️  ${packageSpec} warmup timeout`);
              // Record cache failure on timeout

              reject(new Error('Warmup timeout'));
            }
          }, 30000); // 30 second timeout for warmup
        });
      } catch (error) {
        this.logger.info(`  ⚠️  Failed to warm up ${serverConfig.id}: ${error}`);
        // Don't fail the whole initialization
      }
    });

    // Use allSettled to track success/failure
    const results = await Promise.allSettled(warmupPromises);

    // Count failures
    const failures = results.filter((r) => r.status === 'rejected');
    const successCount = results.length - failures.length;
    const totalServers = npxServers.length;

    // Calculate strict majority threshold (more than half)
    const majorityThreshold = Math.floor(totalServers / 2) + 1;
    const hasMajorityFailure = failures.length >= majorityThreshold;

    // Check if majority failed
    if (hasMajorityFailure) {
      this.logger.info(
        `⚠️  NPX warmup: ${failures.length}/${npxServers.length} servers failed - majority failure detected`,
      );
      this.logger.info(
        '   This may indicate network issues or npm registry problems',
      );
    } else if (failures.length > 0) {
      this.logger.info(
        `⚠️  NPX warmup: ${failures.length}/${npxServers.length} servers failed`,
      );
    }

    this.logger.info(
      `✅ NPX package warmup complete (${successCount}/${npxServers.length} succeeded)`,
    );
  }

  /**
   * サーバーに接続
   */
  async connectServer(serverConfig: ServerConfig): Promise<void> {
    const { id: serverId, type } = serverConfig;

    try {
      if (type === 'npx') {
        // NPXサーバーは起動と接続を同時に行う
        if (!this.serverRegistry) {
          this.serverRegistry = new ServerRegistry();
        }

        // サーバーを登録
        const npxConfig = serverConfig as NpxServerConfig;
        const registered =
          await this.serverRegistry.registerNpxServer(npxConfig);

        // イベントリスナーを設定
        const npxServer = registered.instance as NpxMcpServer;

        // Started イベント
        npxServer.on('started', async ({ serverId: startedId }) => {
          if (startedId === serverId) {
            this.logger.info(
              `NPX server ${serverId} started, discovering tools and resources...`,
            );
            // ツールを再発見
            await this.refreshNpxServerTools(serverId);
            // リソースを再発見
            await this.refreshNpxServerResources(serverId);
            // プロンプトを再発見
            await this.refreshNpxServerPrompts(serverId);
          }
        });

        // ツールの発見イベント
        // ServerRegistryが自動的にツールを発見し、refreshRemoteServerToolsで処理するため
        // ここではイベントリスナーを設定しない（重複防止）

        // リソースの発見イベント
        // 同様にリソースもconnectServerの最後で一度だけ取得する

        // プロンプトの発見イベント
        this.serverRegistry.on(
          'server:prompts-discovered',
          async ({ serverId: discoveredId }) => {
            if (discoveredId === serverId) {
              await this.updateHubPrompts();
            }
          },
        );

        // 起動
        await this.serverRegistry.startServer(serverId);

        // 接続情報を保存
        const connection: McpConnection = {
          serverId,
          npxServer,
          connected: true,
          type: 'npx',
        };
        this.connections.set(serverId, connection);

        // ツールを取得して登録
        await this.refreshNpxServerTools(serverId);
        // リソースを取得して登録
        await this.refreshNpxServerResources(serverId);
        // プロンプトを取得して登録
        await this.refreshNpxServerPrompts(serverId);

        this.logger.info(`Connected to NPX server ${serverId}`);
      } else if (type === 'remote') {
        // リモートサーバーは起動と接続を行う
        if (!this.serverRegistry) {
          this.serverRegistry = new ServerRegistry();
        }

        // サーバーを登録
        const remoteConfig = serverConfig as RemoteServerConfig;
        const registered =
          await this.serverRegistry.registerRemoteServer(remoteConfig);

        // イベントリスナーを設定
        const remoteServer = registered.instance as RemoteMcpServer;

        // Started イベント
        remoteServer.on('started', async ({ serverId: startedId }) => {
          if (startedId === serverId) {
            this.logger.info(
              `Remote server ${serverId} started, discovering tools and resources...`,
            );
            // ServerRegistryが既にdiscoverToolsを呼んでいるので、ここでは呼ばない
            // ツールとリソースはconnectServerの最後で一度だけ取得する
          }
        });

        // ツールの発見イベント
        // ServerRegistryが自動的にツールを発見し、refreshRemoteServerToolsで処理するため
        // ここではイベントリスナーを設定しない（重複防止）

        // リソースの発見イベント
        // 同様にリソースもconnectServerの最後で一度だけ取得する

        // すべてのエラーイベントリスナーを確実に設定
        remoteServer.setMaxListeners(10); // デフォルトの10を明示的に設定

        // 起動
        await this.serverRegistry.startServer(serverId);

        // 接続情報を保存
        const connection: McpConnection = {
          serverId,
          remoteServer,
          connected: true,
          type: 'remote',
        };
        this.connections.set(serverId, connection);

        // ツールを取得して登録（リモートサーバーの場合はRegistryから取得）
        await this.refreshRemoteServerTools(serverId);
        // リソースを取得して登録
        await this.refreshRemoteServerResources(serverId);

        this.logger.info(`Connected to remote server ${serverId}`);
      } else if (type === 'local') {
        // ローカルサーバーはNPXサーバーと同様の処理
        if (!this.serverRegistry) {
          this.serverRegistry = new ServerRegistry();
        }

        // サーバーを登録（LocalServerConfigをNpxMcpServerで実行）
        const localConfig =
          serverConfig as import('../config/types.js').LocalServerConfig;
        const registered =
          await this.serverRegistry.registerLocalServer(localConfig);

        // イベントリスナーを設定
        const localServer = registered.instance as NpxMcpServer;

        // Started イベント
        localServer.on('started', async ({ serverId: startedId }) => {
          if (startedId === serverId) {
            this.logger.info(
              `Local server ${serverId} started, discovering tools and resources...`,
            );
          }
        });

        // ツールの発見イベント
        localServer.on(
          'tools-discovered',
          async ({ serverId: discoveredId }) => {
            if (discoveredId === serverId) {
              await this.updateHubTools();
            }
          },
        );

        // リソースの発見イベント
        localServer.on(
          'resources-discovered',
          async ({ serverId: discoveredId }) => {
            if (discoveredId === serverId) {
              await this.updateHubResources();
            }
          },
        );

        // プロンプトの発見イベント
        localServer.on(
          'prompts-discovered',
          async ({ serverId: discoveredId }) => {
            if (discoveredId === serverId) {
              await this.updateHubPrompts();
            }
          },
        );

        // すべてのエラーイベントリスナーを確実に設定
        localServer.setMaxListeners(10);

        // 起動
        await this.serverRegistry.startServer(serverId);

        // 接続情報を保存
        const connection: McpConnection = {
          serverId,
          npxServer: localServer, // NpxMcpServerインスタンスをnpxServerとして保存
          connected: true,
          type: 'local',
        };
        this.connections.set(serverId, connection);

        // ツールを取得して登録
        await this.refreshNpxServerTools(serverId);
        // リソースを取得して登録
        await this.refreshNpxServerResources(serverId);
        // プロンプトを取得して登録
        await this.refreshNpxServerPrompts(serverId);

        this.logger.info(`Connected to local server ${serverId}`);
      } else {
        this.logger.info(`Server type ${type} is not yet supported`);
      }
    } catch (error) {
      this.logger.error({ error }, `Failed to connect to server ${serverId}`);
      throw error;
    }
  }

  /**
   * サーバーから切断
   */
  async disconnectServer(serverId: string): Promise<void> {
    const connection = this.connections.get(serverId);
    if (!connection) {
      return;
    }

    this.logger.info(`Disconnecting from server ${serverId}...`);

    try {
      if (connection.type === 'local') {
        // ローカルサーバーの切断
        if (connection.client) {
          await connection.client.close();
        }
        if (connection.transport) {
          await connection.transport.stop();
        }
      } else if (connection.type === 'npx') {
        // NPXサーバーの切断
        if (this.serverRegistry) {
          await this.serverRegistry.stopServer(serverId);
          await this.serverRegistry.unregisterServer(serverId);
        }
      } else if (connection.type === 'remote') {
        // リモートサーバーの切断
        if (this.serverRegistry) {
          await this.serverRegistry.stopServer(serverId);
          await this.serverRegistry.unregisterServer(serverId);
        }
      }

      // ツールをレジストリから削除
      this.registry.clearServerTools(serverId);

      // リソースをレジストリから削除
      this.resourceRegistry.clearServerResources(serverId);

      // プロンプトをレジストリから削除

      // 接続情報を削除
      this.connections.delete(serverId);

      this.logger.info(`Disconnected from server ${serverId}`);
    } catch (error) {
      this.logger.error(
        { error },
        `Error disconnecting from server ${serverId}`,
      );
    }
  }

  /**
   * NPXサーバーのツールを更新
   */
  private async refreshNpxServerTools(serverId: string): Promise<void> {
    if (!this.serverRegistry) {
      return;
    }

    const registered = this.serverRegistry.getServer(serverId);
    if (!registered?.tools) {
      return;
    }

    try {
      // ServerRegistryからツール情報を取得
      const tools = (registered.tools || []).map((tool) => ({
        name: tool.name,
        description: tool.description || `Tool from NPX server ${serverId}`,
        inputSchema: tool.inputSchema || {},
      }));

      this.logger.info(`NPX Server ${serverId} has ${tools.length} tools`);

      // レジストリに登録
      this.registry.registerServerTools(serverId, tools);

      // ハブのツールを更新
      await this.updateHubTools();
    } catch (error) {
      this.logger.error({ error }, `$2`);
    }
  }

  /**
   * リモートサーバーのツールを更新
   */
  private async refreshRemoteServerTools(serverId: string): Promise<void> {
    this.logger.info(`[DEBUG] refreshRemoteServerTools called for ${serverId}`);
    if (!this.serverRegistry) {
      return;
    }

    const registered = this.serverRegistry.getServer(serverId);
    this.logger.debug(
      {
        server: {
          id: registered?.id,
          state: registered?.state,
          tools: registered?.tools,
          hasInstance: !!registered?.instance,
        },
      },
      `[DEBUG] Registered server`,
    );

    // toolsが配列でない場合は修正
    if (registered && !Array.isArray(registered.tools)) {
      registered.tools = undefined;
    }

    if (!registered?.tools) {
      this.logger.info(
        `[DEBUG] No tools found for ${serverId}, attempting discovery...`,
      );

      // リモートサーバーから直接ツールを取得
      if (registered?.instance && 'discoverTools' in registered.instance) {
        try {
          const tools = await (
            registered.instance as RemoteMcpServer
          ).discoverTools();
          this.logger.info(
            `[DEBUG] Discovered ${tools.length} tools from ${serverId}`,
          );

          // ツールをServerRegistryに登録
          this.serverRegistry.registerServerTools(serverId, tools);

          // 再度取得
          const updatedRegistered = this.serverRegistry.getServer(serverId);
          if (!updatedRegistered?.tools) {
            this.logger.info(
              `[DEBUG] Still no tools after discovery for ${serverId}`,
            );
            return;
          }
        } catch (error) {
          this.logger.error({ error }, `$2`);
          return;
        }
      } else {
        this.logger.info(
          `[DEBUG] Server ${serverId} doesn't support tool discovery`,
        );
        return;
      }
    }

    try {
      // ServerRegistryからツール情報を取得
      const tools = (registered.tools || []).map((tool) => ({
        name: typeof tool === 'string' ? tool : tool.name,
        description:
          typeof tool === 'string'
            ? `Tool from remote server ${serverId}`
            : tool.description || `Tool from remote server ${serverId}`,
        inputSchema:
          typeof tool === 'string'
            ? { type: 'object' as const, properties: {} }
            : tool.inputSchema || { type: 'object' as const, properties: {} },
      }));

      this.logger.info(`Remote Server ${serverId} has ${tools.length} tools`);

      // レジストリに登録
      this.registry.registerServerTools(serverId, tools);

      // ハブのツールを更新
      await this.updateHubTools();
    } catch (error) {
      this.logger.error({ error }, `$2`);
    }
  }

  /**
   * NPXサーバーのリソースを更新
   */
  private async refreshNpxServerResources(serverId: string): Promise<void> {
    if (!this.serverRegistry) {
      return;
    }

    const registered = this.serverRegistry.getServer(serverId);
    if (!registered?.instance) {
      return;
    }

    try {
      const npxServer = registered.instance as NpxMcpServer;
      const resources = npxServer.getResources();

      this.logger.info(
        `NPX Server ${serverId} has ${resources.length} resources`,
      );

      // ServerRegistryにリソースを登録
      this.serverRegistry.registerServerResources(serverId, resources);

      // レジストリに登録
      this.resourceRegistry.registerServerResources(serverId, resources);

      // ハブのリソースを更新
      this.updateHubResources();
    } catch (error) {
      this.logger.error({ error }, `$2`);
    }
  }

  /**
   * NPXサーバーのプロンプトを更新
   */
  private async refreshNpxServerPrompts(serverId: string): Promise<void> {
    if (this.promptManager) {
      await this.promptManager.refreshNpxServerPrompts(serverId);
    }
  }

  /**
   * リモートサーバーのリソースを更新
   */
  private async refreshRemoteServerResources(serverId: string): Promise<void> {
    this.logger.info(
      `[DEBUG] refreshRemoteServerResources called for ${serverId}`,
    );
    if (!this.serverRegistry) {
      return;
    }

    const registered = this.serverRegistry.getServer(serverId);
    if (!registered?.instance) {
      return;
    }

    try {
      const remoteServer = registered.instance as RemoteMcpServer;

      // リモートサーバーから直接リソースを取得
      const resources = await remoteServer.discoverResources();
      this.logger.info(
        `[DEBUG] Discovered ${resources.length} resources from ${serverId}`,
      );

      // ServerRegistryにリソースを登録
      this.serverRegistry.registerServerResources(
        serverId,
        resources as Resource[],
      );

      // レジストリに登録
      this.resourceRegistry.registerServerResources(
        serverId,
        resources as Resource[],
      );

      // ハブのリソースを更新
      this.updateHubResources();
    } catch (error) {
      this.logger.error({ error }, `$2`);
    }
  }

  /**
   * ハブのリソースを更新
   */
  private updateHubResources(): void {
    const resources = this.resourceRegistry.getAllResources();
    this.logger.info(`Hub now has ${resources.length} total resources`);

    // Debug: Log the first resource to see its structure
    if (resources.length > 0) {
      this.logger.debug({ resource: resources[0] }, 'First resource structure');
    }

    // Notify clients that resource list has changed (if capability is registered)
    this.notifyResourcesChanged();
  }

  /**
   * Notify clients that the resource list has changed
   * This implements the MCP resources/list_changed notification
   */
  private notifyResourcesChanged(): void {
    // Don't send notifications during startup or if no client is connected
    // This prevents errors when NPX servers discover resources before a client connects
    if (!this.initialized) {
      return;
    }

    try {
      // Check if server is connected before sending notification
      if (!this.server) {
        return;
      }

      // Use SDK's isConnected() method to reliably check connection state
      // This prevents "Not connected" errors when resources are discovered
      // before client connection or during server restarts
      // TODO: isConnected is not available on SDK Server
      // if (!this.server.isConnected()) {
      if (!this.server) {
        // Connection not established yet, skip notification
        return;
      }

      // Check if we have registered the listChanged capability
      // TODO: getCapabilities is private in SDK Server - need alternative approach
      // TODO: Re-enable when capability tracking is implemented
      // const capabilities = this.server.getCapabilities();
      // if (capabilities?.resources?.listChanged) {
      //   this.server.notification({
      //     method: 'notifications/resources/list_changed',
      //     params: {},
      //   });
      //   this.logger.info('Sent resources/list_changed notification');
      // }
    } catch (error) {
      // Log unexpected errors, but don't crash
      this.logger.debug(
        { error },
        'Failed to send resources/list_changed notification',
      );
    }
  }

  /**
   * ハブのプロンプトを更新
   */
  private updateHubPrompts(): void {
    // Delegate to prompt manager
    // Note: This method is kept for backward compatibility with event handlers
    // In the future, we can directly call promptManager from event handlers
  }

  /**
   * ハブのツールを更新
   */
  private async updateHubTools(): Promise<void> {
    // Use mutex to prevent concurrent tool registration
    await this.toolRegistrationMutex.runExclusive(async () => {
      const tools = this.registry.getAllTools();
      this.logger.info(`Hub now has ${tools.length} total tools`);
      // Debug: Log the first tool to see its structure
      if (tools.length > 0) {
        this.logger.debug(
          `First tool structure: ${JSON.stringify(tools[0], null, 2)}`,
        );
      }

      // Track which tools are currently active
      const currentToolNames = new Set(tools.map((t) => t.name));

      // Remove tools that are no longer available
      for (const toolName of this.registeredTools) {
        if (!currentToolNames.has(toolName)) {
          // Tool was removed from registry
          this.registeredTools.delete(toolName);
          this.logger.info(`Tool ${toolName} removed from registry`);
        }
      }

      // Track new tools (no need to register with Server class)
      // The Server class uses setRequestHandler for tools/list and tools/call
      // which we've already set up in setupToolHandlers()
      for (const tool of tools) {
        if (!this.registeredTools.has(tool.name)) {
          // Just track that this tool exists
          this.registeredTools.add(tool.name);
          this.logger.debug(`Tool ${tool.name} added to hub`);
        }
      }
    });
  }

  /**
   * ツールを呼び出し
   */
  async callTool(
    request: CallToolRequest,
    _requestId?: string | number,
  ): Promise<CallToolResult> {
    // Handle both direct properties and params object
    const requestWithParams = request as CallToolRequest & {
      name?: string;
      arguments?: unknown;
      _meta?: { progressToken?: string };
    };
    const publicName = requestWithParams.name || request.params?.name;
    const toolArgs = requestWithParams.arguments || request.params?.arguments;
    const progressToken =
      requestWithParams._meta?.progressToken ||
      request.params?._meta?.progressToken;

    // 引数の型を確認して必要に応じて変換
    let processedArgs = toolArgs;
    if (typeof toolArgs === 'string') {
      try {
        processedArgs = JSON.parse(toolArgs);
      } catch {
        // パースに失敗したら文字列のまま使用
      }
    }

    // ツール情報を取得
    const toolInfo = this.registry.resolveTool(publicName);
    if (!toolInfo) {
      throw new Error(`Tool not found: ${publicName}`);
    }

    // 実際のツール呼び出しはMcpHubが各接続に委譲
    const connection = this.connections.get(toolInfo.serverId);

    // NPX/Remoteサーバーの場合はclientを使用
    if (connection?.client) {
      const result = (await connection.client.request(
        {
          method: 'tools/call',
          params: {
            name: toolInfo.originalName,
            arguments: processedArgs,
          },
        },
        CallToolRequestSchema,
      )) as unknown as CallToolResult;
      return result || { content: [] };
    }

    // serverRegistryを使用する場合（NPX/Remote/Localサーバー）
    if (this.serverRegistry) {
      const servers = this.serverRegistry.listServers();
      const server = servers.find((s) => s.id === toolInfo.serverId);
      if (server?.instance) {
        // RemoteMcpServerの場合
        if (server.instance instanceof RemoteMcpServer) {
          const result = await server.instance.callTool(
            toolInfo.originalName,
            (processedArgs || {}) as Record<string, unknown>,
            progressToken,
          );
          return result;
        }
        // NpxMcpServerの場合
        else if (server.instance instanceof NpxMcpServer) {
          const result = await server.instance.callTool(
            toolInfo.originalName,
            (processedArgs || {}) as Record<string, unknown>,
          );
          return result as CallToolResult;
        }
      }
    }

    throw new Error(
      `Server connection not found or unable to call tool: ${toolInfo.serverId}`,
    );
  }

  /**
   * MCPサーバーを起動（STDIOトランスポート用）
   */
  async serve(
    transport: StreamableHTTPTransport | StdioTransport | unknown,
  ): Promise<void> {
    // Store transport for progress notifications (only if it's StreamableHTTPTransport)
    if (
      transport &&
      typeof transport === 'object' &&
      'sendProgressNotification' in transport
    ) {
      this.transport = transport as StreamableHTTPTransport;
    }

    // Create managers if not already created
    if (!this.toolManager && this.serverRegistry) {
      this.toolManager = new McpHubToolManager(
        this.registry,
        this.serverRegistry,
        this.connections,
        this.server,
        this.logger.child({ component: 'ToolManager' }),
      );
      this.toolManager.setupToolHandlers();
    }

    if (!this.resourceManager && this.serverRegistry) {
      this.resourceManager = new McpHubResourceManager(
        this.resourceRegistry,
        this.serverRegistry,
        this.connections,
        this.server,
        this.logger.child({ component: 'ResourceManager' }),
      );
      this.resourceManager.setupResourceHandlers();
    }

    if (!this.promptManager && this.serverRegistry) {
      this.promptManager = new McpHubPromptManager(
        this.promptRegistry,
        this.serverRegistry,
        this.connections,
        this.server,
        this.logger.child({ component: 'PromptManager' }),
      );
      this.promptManager.setupPromptHandlers();
    }

    // Set initialized flag on managers
    this.toolManager?.setInitialized(true);
    this.resourceManager?.setInitialized(true);
    this.promptManager?.setInitialized(true);

    await this.server.connect(
      transport as import('@modelcontextprotocol/sdk/shared/transport.js').Transport,
    );
  }

  /**
   * クリーンアップ
   */
  async cleanup(): Promise<void> {
    this.logger.info('Cleaning up MCP Hub...');

    // 全サーバーから切断
    for (const [serverId] of this.connections) {
      await this.disconnectServer(serverId);
    }

    // セッションマネージャーを停止
    this.sessionManager.stop();

    // ワークスペースマネージャーを停止

    // ServerRegistryをクリーンアップ
    if (this.serverRegistry) {
      await this.serverRegistry.onShutdown();
    }

    this.logger.info('MCP Hub cleanup complete');
  }

  /**
   * Get the tool registry (for CLI commands)
   */
  getRegistry(): ToolRegistry {
    return this.registry;
  }

  /**
   * Get the session manager (for CLI commands)
   */
  getSessionManager(): SessionManager {
    return this.sessionManager;
  }

  /**
   * Get the MCP server instance (for CLI commands)
   */
  getServer(): McpServer {
    return this.server;
  }

  /**
   * Get connections map (for CLI commands)
   */
  getConnections(): Map<string, McpConnection> {
    return this.connections;
  }

  /**
   * Shutdown the hub (alias for cleanup)
   */
  async shutdown(): Promise<void> {
    await this.cleanup();
  }
}
