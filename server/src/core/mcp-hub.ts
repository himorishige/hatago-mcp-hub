import type { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type {
  CallToolRequest,
  CallToolResult,
  ListResourcesRequest,
  ListResourcesResult,
  ReadResourceRequest,
  ReadResourceResult,
  Resource,
} from '@modelcontextprotocol/sdk/types.js';
import {
  ListResourcesRequestSchema,
  ReadResourceRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import type {
  HatagoConfig,
  NpxServerConfig,
  RemoteServerConfig,
  ServerConfig,
} from '../config/types.js';
import type { NpxMcpServer } from '../servers/npx-mcp-server.js';
import type { RemoteMcpServer } from '../servers/remote-mcp-server.js';
import { ServerRegistry } from '../servers/server-registry.js';
import { WorkspaceManager } from '../servers/workspace-manager.js';
import type { StdioTransport } from '../transport/stdio.js';
import { createZodLikeSchema } from '../utils/json-to-zod.js';
import {
  createResourceRegistry,
  type ResourceRegistry,
} from './resource-registry.js';
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
  private connections = new Map<string, McpConnection>();
  private config: HatagoConfig;
  private initialized = false;
  private workspaceManager?: WorkspaceManager;
  private serverRegistry?: ServerRegistry;
  private registeredTools = new Set<string>(); // Track registered tools to avoid duplicates
  private workDir: string = '.hatago'; // Default work directory

  constructor(options: McpHubOptions) {
    this.config = options.config;

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

    // リソース機能を登録（transportに接続する前に行う必要がある）
    this.server.server.registerCapabilities({
      resources: {
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
    // McpServerのAPIでは、ツールは動的に登録される
    // connectServerでツールを追加するので、ここでは何もしない
    // tools/listとtools/callはMcpServerが自動的に処理する
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
   * MCPハブを初期化
   */
  async initialize(): Promise<void> {
    if (this.initialized) {
      return;
    }

    console.log('Initializing MCP Hub...');

    // リソースハンドラーを設定（initializeの時点で行う）
    this.setupResourceHandlers();

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
    console.log(`Found ${this.config.servers.length} servers in config`);
    for (const serverConfig of this.config.servers) {
      console.log(
        `Checking server ${serverConfig.id} with start: ${serverConfig.start}`,
      );
      if (serverConfig.start === 'eager') {
        try {
          await this.connectServer(serverConfig);
        } catch (error) {
          console.error(`Failed to connect server ${serverConfig.id}:`, error);
          // エラーが発生しても続行
        }
      }
    }

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

    console.log('🔥 Warming up NPX packages...');

    // Run warmup in parallel for all NPX servers
    const warmupPromises = npxServers.map(async (serverConfig) => {
      try {
        const npxConfig = serverConfig as NpxServerConfig;
        const packageSpec = npxConfig.version
          ? `${npxConfig.package}@${npxConfig.version}`
          : npxConfig.package;

        console.log(`  📦 Pre-caching ${packageSpec}...`);

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
              console.warn(
                `  ⚠️  Failed to warm up ${packageSpec}: ${error.message}`,
              );
              reject(error); // Reject on error for tracking
            }
          });

          warmupProcess.on('exit', (code) => {
            if (!hasExited) {
              hasExited = true;
              if (code === 0) {
                console.log(`  ✅ ${packageSpec} cached`);
                resolve();
              } else {
                // With -p/-c approach, non-zero exit usually means npm error
                console.warn(
                  `  ⚠️  ${packageSpec} warmup exited with code ${code}`,
                );
                reject(new Error(`Warmup failed with code ${code}`));
              }
            }
          });

          // Set a timeout for warmup
          setTimeout(() => {
            if (!hasExited) {
              hasExited = true;
              warmupProcess.kill('SIGTERM');
              console.warn(`  ⚠️  ${packageSpec} warmup timeout`);
              reject(new Error('Warmup timeout'));
            }
          }, 30000); // 30 second timeout for warmup
        });
      } catch (error) {
        console.warn(`  ⚠️  Failed to warm up ${serverConfig.id}: ${error}`);
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
      console.error(
        `⚠️  NPX warmup: ${failures.length}/${npxServers.length} servers failed - majority failure detected`,
      );
      console.error(
        '   This may indicate network issues or npm registry problems',
      );
    } else if (failures.length > 0) {
      console.warn(
        `⚠️  NPX warmup: ${failures.length}/${npxServers.length} servers failed`,
      );
    }

    console.log(
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
            console.log(
              `NPX server ${serverId} started, discovering tools and resources...`,
            );
            // ツールを再発見
            await this.refreshNpxServerTools(serverId);
            // リソースを再発見
            await this.refreshNpxServerResources(serverId);
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

        console.log(`Connected to NPX server ${serverId}`);
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
            console.log(
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

        console.log(`Connected to remote server ${serverId}`);
      } else {
        console.warn(`Server type ${type} is not yet supported`);
      }
    } catch (error) {
      console.error(`Failed to connect to server ${serverId}:`, error);
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

    console.log(`Disconnecting from server ${serverId}...`);

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

      // 接続情報を削除
      this.connections.delete(serverId);

      console.log(`Disconnected from server ${serverId}`);
    } catch (error) {
      console.error(`Error disconnecting from server ${serverId}:`, error);
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

      console.log(`NPX Server ${serverId} has ${tools.length} tools`);

      // レジストリに登録
      this.registry.registerServerTools(serverId, tools);

      // ハブのツールを更新
      this.updateHubTools();
    } catch (error) {
      console.error(
        `Failed to refresh tools for NPX server ${serverId}:`,
        error,
      );
    }
  }

  /**
   * リモートサーバーのツールを更新
   */
  private async refreshRemoteServerTools(serverId: string): Promise<void> {
    console.log(`[DEBUG] refreshRemoteServerTools called for ${serverId}`);
    if (!this.serverRegistry) {
      return;
    }

    const registered = this.serverRegistry.getServer(serverId);
    console.log(`[DEBUG] Registered server:`, {
      id: registered?.id,
      state: registered?.state,
      tools: registered?.tools,
      hasInstance: !!registered?.instance,
    });

    // toolsが配列でない場合は修正
    if (registered && !Array.isArray(registered.tools)) {
      registered.tools = undefined;
    }

    if (!registered?.tools) {
      console.log(
        `[DEBUG] No tools found for ${serverId}, attempting discovery...`,
      );

      // リモートサーバーから直接ツールを取得
      if (registered?.instance && 'discoverTools' in registered.instance) {
        try {
          const tools = await (
            registered.instance as RemoteMcpServer
          ).discoverTools();
          console.log(
            `[DEBUG] Discovered ${tools.length} tools from ${serverId}`,
          );

          // ツールをServerRegistryに登録
          this.serverRegistry.registerServerTools(serverId, tools);

          // 再度取得
          const updatedRegistered = this.serverRegistry.getServer(serverId);
          if (!updatedRegistered?.tools) {
            console.log(
              `[DEBUG] Still no tools after discovery for ${serverId}`,
            );
            return;
          }
        } catch (error) {
          console.error(
            `[DEBUG] Failed to discover tools for ${serverId}:`,
            error,
          );
          return;
        }
      } else {
        console.log(
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

      console.log(`Remote Server ${serverId} has ${tools.length} tools`);

      // レジストリに登録
      this.registry.registerServerTools(serverId, tools);

      // ハブのツールを更新
      this.updateHubTools();
    } catch (error) {
      console.error(
        `Failed to refresh tools for remote server ${serverId}:`,
        error,
      );
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

      console.log(`NPX Server ${serverId} has ${resources.length} resources`);

      // ServerRegistryにリソースを登録
      this.serverRegistry.registerServerResources(serverId, resources);

      // レジストリに登録
      this.resourceRegistry.registerServerResources(serverId, resources);

      // ハブのリソースを更新
      this.updateHubResources();
    } catch (error) {
      console.error(
        `Failed to refresh resources for NPX server ${serverId}:`,
        error,
      );
    }
  }

  /**
   * リモートサーバーのリソースを更新
   */
  private async refreshRemoteServerResources(serverId: string): Promise<void> {
    console.log(`[DEBUG] refreshRemoteServerResources called for ${serverId}`);
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
      console.log(
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
      console.error(
        `[DEBUG] Failed to discover resources for ${serverId}:`,
        error,
      );
    }
  }

  /**
   * ハブのリソースを更新
   */
  private updateHubResources(): void {
    const resources = this.resourceRegistry.getAllResources();
    console.log(`Hub now has ${resources.length} total resources`);

    // Debug: Log the first resource to see its structure
    if (resources.length > 0) {
      console.log(
        'First resource structure:',
        JSON.stringify(resources[0], null, 2),
      );
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

      // Check if we have registered the listChanged capability
      const capabilities = this.server.server.getCapabilities();
      if (capabilities?.resources?.listChanged) {
        // Wrap in try-catch to handle "Not connected" errors gracefully
        try {
          this.server.server.notification({
            method: 'notifications/resources/list_changed',
            params: {},
          });
          console.log('Sent resources/list_changed notification');
        } catch (notificationError) {
          // Silently ignore "Not connected" errors - this is expected during startup
          // or when resources are discovered before client connection
          const errorMessage = String(notificationError);
          if (!errorMessage.includes('Not connected')) {
            console.error(
              'Failed to send resources/list_changed notification:',
              notificationError,
            );
          }
        }
      }
    } catch (error) {
      console.error(
        'Failed to check resources/list_changed capability:',
        error,
      );
    }
  }

  /**
   * ハブのツールを更新
   */
  private updateHubTools(): void {
    const tools = this.registry.getAllTools();
    console.log(`Hub now has ${tools.length} total tools`);
    // Debug: Log the first tool to see its structure
    if (tools.length > 0) {
      console.log('First tool structure:', JSON.stringify(tools[0], null, 2));
    }

    // Track which tools are currently active
    const currentToolNames = new Set(tools.map((t) => t.name));

    // Remove tools that are no longer available
    for (const toolName of this.registeredTools) {
      if (!currentToolNames.has(toolName)) {
        // Tool was removed, we can't unregister from MCP SDK but mark it as removed
        this.registeredTools.delete(toolName);
        console.log(`Tool ${toolName} removed from registry`);
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

        // Mark as registered
        this.registeredTools.add(tool.name);
        console.log(`✅ Tool ${tool.name} registered`);
      } catch (error) {
        // This should rarely happen now due to idempotent check
        console.debug(
          `Failed to register tool ${tool.name}:`,
          error instanceof Error ? error.message : error,
        );
      }
    }

    console.log(`Total registered tools: ${this.registeredTools.size}`);
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
   * シャットダウン
   */
  async shutdown(): Promise<void> {
    console.log('Shutting down MCP Hub...');

    // すべてのサーバーから切断
    const serverIds = Array.from(this.connections.keys());
    for (const serverId of serverIds) {
      await this.disconnectServer(serverId);
    }

    // レジストリのクリーンアップ
    this.registry.clear();
    this.resourceRegistry.clear();

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

    console.log('MCP Hub shutdown complete');
  }
}
