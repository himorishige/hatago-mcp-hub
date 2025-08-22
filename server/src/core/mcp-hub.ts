import type { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type {
  CallToolRequest,
  CallToolResult,
  GetPromptRequest,
  GetPromptResult,
  ListPromptsRequest,
  ListPromptsResult,
  ListResourcesRequest,
  ListResourcesResult,
  ReadResourceRequest,
  ReadResourceResult,
  Resource,
} from '@modelcontextprotocol/sdk/types.js';
import {
  CallToolRequestSchema,
  GetPromptRequestSchema,
  ListPromptsRequestSchema,
  ListResourcesRequestSchema,
  ListToolsRequestSchema,
  ReadResourceRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import type { Logger } from 'pino';
import type {
  HatagoConfig,
  NpxServerConfig,
  RemoteServerConfig,
  ServerConfig,
} from '../config/types.js';
import { getNpxCacheManager } from '../servers/npx-cache-manager.js';
import type { NpxMcpServer } from '../servers/npx-mcp-server.js';
import type { RemoteMcpServer } from '../servers/remote-mcp-server.js';
import { ServerRegistry } from '../servers/server-registry.js';
import { WorkspaceManager } from '../servers/workspace-manager.js';
import type { StdioTransport } from '../transport/stdio.js';
import { createZodLikeSchema } from '../utils/json-to-zod.js';
import { createLogger } from '../utils/logger.js';
import { createMutex } from '../utils/mutex.js';
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

// MCPサーバー接続情報
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

// MCPハブのオプション
export interface McpHubOptions {
  config: HatagoConfig;
}

/**
 * MCPハブ - 複数のMCPサーバーを統合管理
 */
export class McpHub {
  private server: McpServer;
  private registry: ToolRegistry;
  private resourceRegistry: ResourceRegistry;
  private promptRegistry: PromptRegistry;
  private connections = new Map<string, McpConnection>();
  private config: HatagoConfig;
  private initialized = false;
  private workspaceManager?: WorkspaceManager;
  private serverRegistry?: ServerRegistry;
  private registeredTools = new Set<string>(); // Track registered tools to avoid duplicates
  private toolRegistrationMutex = createMutex(); // Mutex for tool registration
  private sessionManager: SessionManager;
  private workDir: string = '.hatago'; // Default work directory
  private logger: Logger;

  constructor(options: McpHubOptions) {
    this.config = options.config;

    // Create logger for McpHub
    this.logger = createLogger({
      component: 'mcp-hub',
      destination: process.stderr, // Always use stderr to avoid stdout contamination
    });

    // MCPサーバーを作成
    this.server = new McpServer({
      name: 'hatago-hub',
      version: '0.0.1',
    });

    // ツールレジストリを初期化
    this.registry = new ToolRegistry({
      namingConfig: this.config.toolNaming,
    });

    // リソースレジストリを初期化
    this.resourceRegistry = createResourceRegistry({
      namingConfig: this.config.toolNaming, // リソースも同じ命名戦略を使用
    });

    // セッションマネージャーを初期化
    const sessionTtl = this.config.session?.ttlSeconds ?? 3600;
    this.sessionManager = new SessionManager(sessionTtl);

    // プロンプトレジストリを初期化
    this.promptRegistry = createPromptRegistry({
      namingConfig: this.config.toolNaming, // プロンプトも同じ命名戦略を使用
    });

    // ツール、リソース、プロンプト機能を登録（transportに接続する前に行う必要がある）
    this.server.server.registerCapabilities({
      tools: {
        listChanged: false, // ツール一覧の変更通知はサポートしない
      },
      resources: {
        listChanged: true,
      },
      prompts: {
        listChanged: true,
      },
    });

    // MCPサーバーにツールハンドラーを設定
    this.setupToolHandlers();
  }

  /**
   * ツール関連のハンドラーを設定
   */
  private setupToolHandlers(): void {
    // tools/listハンドラーを明示的に設定
    this.server.server.setRequestHandler(ListToolsRequestSchema, async () => {
      const tools = this.registry.getAllTools();
      return {
        tools: tools.map((tool) => ({
          name: tool.name,
          description: tool.description,
          inputSchema: tool.inputSchema || {},
        })),
      };
    });

    // tools/callハンドラーも明示的に設定
    this.server.server.setRequestHandler(
      CallToolRequestSchema,
      async (request: CallToolRequest) => {
        return await this.callTool(request.params);
      },
    );
  }

  /**
   * リソース関連のハンドラーを設定
   */
  private setupResourceHandlers(): void {
    // resources/listハンドラーを設定
    this.server.server.setRequestHandler(
      ListResourcesRequestSchema,
      async (_request: ListResourcesRequest): Promise<ListResourcesResult> => {
        const allResources = this.resourceRegistry.getAllResources();

        // TODO: ページネーション対応（cursorパラメータ）
        return {
          resources: allResources,
        };
      },
    );

    // resources/readハンドラーを設定
    this.server.server.setRequestHandler(
      ReadResourceRequestSchema,
      async (request: ReadResourceRequest): Promise<ReadResourceResult> => {
        const { uri } = request.params;

        // リソースを解決
        const resolved = this.resourceRegistry.resolveResource(uri);
        if (!resolved) {
          throw new Error(`Resource not found: ${uri}`);
        }

        const { serverId, originalUri } = resolved;

        // サーバー接続を取得
        const connection = this.connections.get(serverId);
        if (!connection?.connected) {
          throw new Error(`Server not connected: ${serverId}`);
        }

        // 接続タイプに応じてリソースを読み取り
        if (connection.type === 'local' && connection.client) {
          // ローカルサーバーの場合
          const result = await connection.client.readResource({
            uri: originalUri,
          });
          return result;
        } else if (connection.type === 'npx' && connection.npxServer) {
          // NPXサーバーの場合
          const result = await connection.npxServer.readResource(originalUri);
          return result as ReadResourceResult;
        } else if (connection.type === 'remote' && connection.remoteServer) {
          // リモートサーバーの場合
          const result =
            await connection.remoteServer.readResource(originalUri);
          return result as ReadResourceResult;
        } else {
          throw new Error(`Unsupported connection type: ${connection.type}`);
        }
      },
    );

    // resources/templates/listハンドラーを設定（将来対応）
    // this.server.server.setRequestHandler('resources/templates/list', ...);
  }

  /**
   * プロンプト関連のハンドラーを設定
   */
  private setupPromptHandlers(): void {
    // prompts/listハンドラーを設定
    this.server.server.setRequestHandler(
      ListPromptsRequestSchema,
      async (_request: ListPromptsRequest): Promise<ListPromptsResult> => {
        const allPrompts = this.promptRegistry.getAllPrompts();

        // TODO: ページネーション対応（cursorパラメータ）
        return {
          prompts: allPrompts,
        };
      },
    );

    // prompts/getハンドラーを設定
    this.server.server.setRequestHandler(
      GetPromptRequestSchema,
      async (request: GetPromptRequest): Promise<GetPromptResult> => {
        const { name, arguments: args } = request.params;

        // プロンプトを解決
        const resolved = this.promptRegistry.resolvePrompt(name);
        if (!resolved) {
          throw new Error(`Prompt not found: ${name}`);
        }

        const { serverId, originalName } = resolved;

        // サーバー接続を取得
        const connection = this.connections.get(serverId);
        if (!connection?.connected) {
          throw new Error(`Server not connected: ${serverId}`);
        }

        // 接続タイプに応じてプロンプトを取得
        if (connection.type === 'local' && connection.client) {
          // ローカルサーバーの場合
          const result = await connection.client.getPrompt({
            name: originalName,
            arguments: args,
          });
          return result;
        } else if (connection.type === 'npx' && connection.npxServer) {
          // NPXサーバーの場合
          const result = await connection.npxServer.getPrompt(
            originalName,
            args,
          );
          return result as GetPromptResult;
        } else if (connection.type === 'remote' && connection.remoteServer) {
          // リモートサーバーの場合（未実装）
          throw new Error('Remote server prompts not yet implemented');
        } else {
          throw new Error(`Unsupported connection type: ${connection.type}`);
        }
      },
    );
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

    // プロンプトハンドラーを設定（initializeの時点で行う）
    this.setupPromptHandlers();

    // NPXサーバーやリモートサーバーサポートの初期化
    const hasNpxServers = this.config.servers.some((s) => s.type === 'npx');
    const hasRemoteServers = this.config.servers.some(
      (s) => s.type === 'remote',
    );

    if (hasNpxServers || hasRemoteServers) {
      if (hasNpxServers) {
        // Use .hatago/workspaces directory for workspace management
        this.workDir = '.hatago';
        this.workspaceManager = new WorkspaceManager({
          baseDir: `${this.workDir}/workspaces`,
        });
        await this.workspaceManager.initialize();

        // Warm up NPX packages to populate cache
        await this.warmupNpxPackages();
      }

      // Create storage based on config
      let storage = null;
      if (this.config.registry?.persist?.enabled) {
        const { createRegistryStorage } = await import(
          '../storage/registry-storage-factory.js'
        );
        storage = createRegistryStorage(this.config, this.workDir);
      }

      this.serverRegistry = new ServerRegistry(
        this.workspaceManager,
        undefined,
        storage,
      );
      await this.serverRegistry.initialize();
    }

    // 設定されたサーバーを接続
    this.logger.info(`Found ${this.config.servers.length} servers in config`);
    for (const serverConfig of this.config.servers) {
      this.logger.debug(
        `Checking server ${serverConfig.id} with start: ${serverConfig.start}`,
      );
      if (serverConfig.start === 'eager') {
        try {
          await this.connectServer(serverConfig);
        } catch (error) {
          this.logger.error(
            `Failed to connect server ${serverConfig.id}: ${error}`,
          );
          // エラーが発生しても続行
        }
      }
    }

    // セッションマネージャーのクリーンアップを開始
    this.sessionManager.startCleanup();

    this.initialized = true;
  }

  /**
   * Warm up NPX packages by pre-installing them
   */
  private async warmupNpxPackages(): Promise<void> {
    const npxServers = this.config.servers.filter((s) => s.type === 'npx');

    if (npxServers.length === 0) {
      return;
    }

    this.logger.info('🔥 Warming up NPX packages...');

    // Get cache manager instance
    const cacheManager = getNpxCacheManager();

    // Run warmup in parallel for all NPX servers
    const warmupPromises = npxServers.map(async (serverConfig) => {
      try {
        const npxConfig = serverConfig as NpxServerConfig;
        const packageSpec = npxConfig.version
          ? `${npxConfig.package}@${npxConfig.version}`
          : npxConfig.package;

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
              cacheManager.recordWarmupResult(packageSpec, false);
              reject(error); // Reject on error for tracking
            }
          });

          warmupProcess.on('exit', (code) => {
            if (!hasExited) {
              hasExited = true;
              if (code === 0) {
                this.logger.info(`  ✅ ${packageSpec} cached`);
                // Record successful cache
                cacheManager.recordWarmupResult(packageSpec, true);
                resolve();
              } else {
                // With -p/-c approach, non-zero exit usually means npm error
                this.logger.info(
                  `  ⚠️  ${packageSpec} warmup exited with code ${code}`,
                );
                // Record cache failure
                cacheManager.recordWarmupResult(packageSpec, false);
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
              cacheManager.recordWarmupResult(packageSpec, false);
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
      if (type === 'stdio') {
        // STDIOサーバーは起動時に既に接続されている
        return;
      } else if (type === 'npx') {
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
        this.serverRegistry.on(
          'server:tools-discovered',
          async ({ serverId: discoveredId }) => {
            if (discoveredId === serverId) {
              await this.updateHubTools();
            }
          },
        );

        // リソースの発見イベント
        this.serverRegistry.on(
          'server:resources-discovered',
          async ({ serverId: discoveredId }) => {
            if (discoveredId === serverId) {
              await this.updateHubResources();
            }
          },
        );

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
            // ツールを再発見
            await this.refreshRemoteServerTools(serverId);
            // リソースを再発見
            await this.refreshRemoteServerResources(serverId);
          }
        });

        // ツールの発見イベント
        this.serverRegistry.on(
          'server:tools-discovered',
          async ({ serverId: discoveredId }) => {
            if (discoveredId === serverId) {
              await this.updateHubTools();
            }
          },
        );

        // リソースの発見イベント
        this.serverRegistry.on(
          'server:resources-discovered',
          async ({ serverId: discoveredId }) => {
            if (discoveredId === serverId) {
              await this.updateHubResources();
            }
          },
        );

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
      this.promptRegistry.clearServerPrompts(serverId);

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
      const tools = registered.tools.map((tool) => ({
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
      const tools = registered.tools.map((name) => ({
        name,
        description: `Tool from remote server ${serverId}`,
        inputSchema: {},
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
    if (!this.serverRegistry) {
      return;
    }

    const registered = this.serverRegistry.getServer(serverId);
    if (!registered?.instance) {
      return;
    }

    try {
      const npxServer = registered.instance as NpxMcpServer;
      const prompts = npxServer.getPrompts();

      this.logger.info(`NPX Server ${serverId} has ${prompts.length} prompts`);

      // ServerRegistryにプロンプトを登録
      this.serverRegistry.registerServerPrompts(serverId, prompts);

      // レジストリに登録
      this.promptRegistry.registerServerPrompts(serverId, prompts);

      // ハブのプロンプトを更新
      this.updateHubPrompts();
    } catch (error) {
      this.logger.error({ error }, `$2`);
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
      if (!this.server?.server) {
        return;
      }

      // Use SDK's isConnected() method to reliably check connection state
      // This prevents "Not connected" errors when resources are discovered
      // before client connection or during server restarts
      if (!this.server.server.isConnected()) {
        // Connection not established yet, skip notification
        return;
      }

      // Check if we have registered the listChanged capability
      const capabilities = this.server.server.getCapabilities();
      if (capabilities?.resources?.listChanged) {
        // Safe to send notification - we've verified connection is active
        this.server.server.notification({
          method: 'notifications/resources/list_changed',
          params: {},
        });
        this.logger.info('Sent resources/list_changed notification');
      }
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
    const prompts = this.promptRegistry.getAllPrompts();
    this.logger.info(`Hub now has ${prompts.length} total prompts`);

    // Debug: Log the first prompt to see its structure
    if (prompts.length > 0) {
      this.logger.debug({ prompt: prompts[0] }, 'First prompt structure');
    }

    // Notify clients that prompt list has changed (if capability is registered)
    this.notifyPromptsChanged();
  }

  /**
   * Notify clients that the prompt list has changed
   * This implements the MCP prompts/list_changed notification
   */
  private notifyPromptsChanged(): void {
    // Don't send notifications during startup or if no client is connected
    // This prevents errors when NPX servers discover prompts before a client connects
    if (!this.initialized) {
      return;
    }

    try {
      // Check if server is connected before sending notification
      if (!this.server?.server) {
        return;
      }

      // Use SDK's isConnected() method to reliably check connection state
      // This prevents "Not connected" errors when prompts are discovered
      // before client connection or during server restarts
      if (!this.server.server.isConnected()) {
        // Connection not established yet, skip notification
        return;
      }

      // Check if we have registered the listChanged capability
      const capabilities = this.server.server.getCapabilities();
      if (capabilities?.prompts?.listChanged) {
        // Safe to send notification - we've verified connection is active
        this.server.server.notification({
          method: 'notifications/prompts/list_changed',
          params: {},
        });
        this.logger.info('Sent prompts/list_changed notification');
      }
    } catch (error) {
      // Log unexpected errors, but don't crash
      this.logger.debug(
        { error },
        'Failed to send prompts/list_changed notification',
      );
    }
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
        this.logger.debug({ tool: tools[0] }, 'First tool structure');
      }

      // Track which tools are currently active
      const currentToolNames = new Set(tools.map((t) => t.name));

      // Remove tools that are no longer available
      for (const toolName of this.registeredTools) {
        if (!currentToolNames.has(toolName)) {
          // Tool was removed, we can't unregister from MCP SDK but mark it as removed
          this.registeredTools.delete(toolName);
          this.logger.info(`Tool ${toolName} removed from registry`);
        }
      }

      // Register new or updated tools
      for (const tool of tools) {
        // Skip if already registered (idempotent)
        if (this.registeredTools.has(tool.name)) {
          continue;
        }

        try {
          // JSON\u30b9\u30ad\u30fc\u30de\u3092Zod\u4e92\u63db\u30b9\u30ad\u30fc\u30de\u306b\u5909\u63db
          // inputSchemaが空またはpropertiesが空の場合はundefinedを使用
          let zodLikeSchema: unknown;
          if (
            tool.inputSchema?.properties &&
            Object.keys(tool.inputSchema.properties).length > 0
          ) {
            zodLikeSchema = createZodLikeSchema(tool.inputSchema);
          }

          // MCP SDK\u306eregisterTool\u30e1\u30bd\u30c3\u30c9\u3092\u4f7f\u7528
          this.server.registerTool(
            tool.name,
            {
              description: tool.description || `Tool ${tool.name}`,
              inputSchema: zodLikeSchema as unknown, // Zod\u4e92\u63db\u30b9\u30ad\u30fc\u30de\u3092\u6e21\u3059
            },
            async (args: unknown, _extra: unknown) => {
              // registerTool\u30e1\u30bd\u30c3\u30c9\u306f\u6b63\u3057\u304f\u5f15\u6570\u3092\u6e21\u3059\u306f\u305a\u306a\u306e\u3067\u3001
              // args\u304cundefined\u306e\u5834\u5408\u306f\u7a7a\u30aa\u30d6\u30b8\u30a7\u30af\u30c8\u3092\u4f7f\u7528
              const toolArgs = args || {};
              const result = await this.callTool({
                name: tool.name,
                arguments: toolArgs,
              });
              return result;
            },
          );

          // Mark as registered - this is now protected by mutex
          this.registeredTools.add(tool.name);
          this.logger.info(`✅ Tool ${tool.name} registered`);
        } catch (error) {
          // This should rarely happen now due to idempotent check
          this.logger.debug(
            { error: error instanceof Error ? error.message : error },
            `Failed to register tool ${tool.name}`,
          );
        }
      }

      this.logger.info(`Total registered tools: ${this.registeredTools.size}`);
    });
  }

  /**
   * ツールを実行
   */
  async callTool(request: CallToolRequest): Promise<CallToolResult> {
    const { name: publicName, arguments: toolArgs } = request;

    // ツールを解決
    const resolved = this.registry.resolveTool(publicName);
    if (!resolved) {
      return {
        content: [
          {
            type: 'text',
            text: `Tool not found: ${publicName}`,
          },
        ],
        isError: true,
      };
    }

    const { serverId, originalName } = resolved;

    // サーバー接続を取得
    let connection = this.connections.get(serverId);
    if (!connection?.connected) {
      // 遅延接続を試みる
      const serverConfig = this.config.servers.find((s) => s.id === serverId);
      if (serverConfig && serverConfig.start === 'lazy') {
        try {
          await this.connectServer(serverConfig);
          connection = this.connections.get(serverId);
        } catch (error) {
          return {
            content: [
              {
                type: 'text',
                text: `Failed to connect to server ${serverId}: ${error}`,
              },
            ],
            isError: true,
          };
        }
      } else {
        return {
          content: [
            {
              type: 'text',
              text: `Server not connected: ${serverId}`,
            },
          ],
          isError: true,
        };
      }
    }

    if (!connection) {
      return {
        content: [
          {
            type: 'text',
            text: `Failed to establish connection to server: ${serverId}`,
          },
        ],
        isError: true,
      };
    }

    try {
      // タイムアウトを設定
      const timeoutMs = this.config.timeouts.toolCallMs;
      let timeoutId: NodeJS.Timeout | undefined;

      let callPromise: Promise<CallToolResult>;

      if (connection.type === 'local' && connection.client) {
        // ローカルサーバーの場合
        callPromise = connection.client.callTool({
          name: originalName,
          arguments: toolArgs,
        });
      } else if (connection.type === 'npx' && connection.npxServer) {
        // NPXサーバーの場合
        callPromise = connection.npxServer.callTool(
          originalName,
          toolArgs,
        ) as Promise<CallToolResult>;
      } else if (connection.type === 'remote' && connection.remoteServer) {
        // リモートサーバーの場合
        callPromise = connection.remoteServer.callTool(
          originalName,
          toolArgs,
        ) as Promise<CallToolResult>;
      } else {
        throw new Error(`Unsupported connection type: ${connection.type}`);
      }

      const timeoutPromise = new Promise<CallToolResult>((_, reject) => {
        timeoutId = setTimeout(() => {
          reject(new Error('Tool call timeout'));
        }, timeoutMs);
      });

      try {
        // タイムアウトとレースさせる
        const result = await Promise.race([callPromise, timeoutPromise]);

        // タイムアウトをクリア
        if (timeoutId) {
          clearTimeout(timeoutId);
        }

        return result;
      } catch (timeoutError) {
        // タイムアウトをクリア
        if (timeoutId) {
          clearTimeout(timeoutId);
        }
        throw timeoutError;
      }
    } catch (error) {
      return {
        content: [
          {
            type: 'text',
            text: `Tool execution failed: ${error}`,
          },
        ],
        isError: true,
      };
    }
  }

  /**
   * MCPサーバーインスタンスを取得
   */
  getServer(): McpServer {
    return this.server;
  }

  /**
   * レジストリを取得
   */
  getRegistry(): ToolRegistry {
    return this.registry;
  }

  /**
   * 接続情報を取得
   */
  getConnections(): Map<string, McpConnection> {
    return this.connections;
  }

  /**
   * セッションマネージャーを取得
   */
  getSessionManager(): SessionManager {
    return this.sessionManager;
  }

  /**
   * シャットダウン
   */
  async shutdown(): Promise<void> {
    this.logger.info('Shutting down MCP Hub...');

    // すべてのサーバーから切断
    const serverIds = Array.from(this.connections.keys());
    for (const serverId of serverIds) {
      await this.disconnectServer(serverId);
    }

    // レジストリのクリーンアップ
    this.registry.clear();
    this.resourceRegistry.clear();
    this.promptRegistry.clear();

    // セッションマネージャーのクリーンアップ
    this.sessionManager.stop();
    this.sessionManager.clear();

    // NPXサーバー関連のシャットダウン
    if (this.serverRegistry) {
      await this.serverRegistry.shutdown();
    }
    if (this.workspaceManager) {
      await this.workspaceManager.shutdown();
    }

    // 接続マップをクリア
    this.connections.clear();
    this.registeredTools.clear();

    this.logger.info('MCP Hub shutdown complete');
  }
}
