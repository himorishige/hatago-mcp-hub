import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type {
  CallToolRequest,
  CallToolResult,
} from '@modelcontextprotocol/sdk/types.js';
import type {
  HatagoConfig,
  NpxServerConfig,
  RemoteServerConfig,
  ServerConfig,
} from '../config/types.js';
import { getRuntime } from '../runtime/runtime-factory.js';
import type { NpxMcpServer } from '../servers/npx-mcp-server.js';
import type { RemoteMcpServer } from '../servers/remote-mcp-server.js';
import { ServerRegistry } from '../servers/server-registry.js';
import { WorkspaceManager } from '../servers/workspace-manager.js';
import { StdioTransport } from '../transport/stdio.js';
import { createZodLikeSchema } from '../utils/json-to-zod.js';
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
  private connections = new Map<string, McpConnection>();
  private config: HatagoConfig;
  private initialized = false;
  private workspaceManager?: WorkspaceManager;
  private serverRegistry?: ServerRegistry;
  private registeredTools = new Set<string>(); // Track registered tools to avoid duplicates

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

    // MCPサーバーにツールハンドラーを設定
    this.setupToolHandlers();
  }

  /**
   * ツール関連のハンドラーを設定
   */
  private setupToolHandlers(): void {
    // McpServer で動的にツールを登録
    // 実際のツール呼び出しは this.callTool を通して行う
    // 初期化時は何もしない - connectServer でツールを動的に追加
  }

  /**
   * MCPハブを初期化
   */
  async initialize(): Promise<void> {
    if (this.initialized) {
      return;
    }

    console.log('Initializing MCP Hub...');

    // NPXサーバーやリモートサーバーサポートの初期化
    const hasNpxServers = this.config.servers.some((s) => s.type === 'npx');
    const hasRemoteServers = this.config.servers.some(
      (s) => s.type === 'remote',
    );

    if (hasNpxServers || hasRemoteServers) {
      if (hasNpxServers) {
        this.workspaceManager = new WorkspaceManager();
        await this.workspaceManager.initialize();

        // Warm up NPX packages to populate cache
        await this.warmupNpxPackages();
      }

      this.serverRegistry = new ServerRegistry(this.workspaceManager);
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

        // Run npx with --version flag just to trigger installation
        const { spawn } = await import('node:child_process');
        const command = process.platform === 'win32' ? 'npx.cmd' : 'npx';

        await new Promise<void>((resolve, _reject) => {
          const warmupProcess = spawn(
            command,
            ['-y', packageSpec, '--version'],
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

          let _stderr = '';
          warmupProcess.stderr?.on('data', (data) => {
            _stderr += data.toString();
          });

          warmupProcess.on('error', (error) => {
            console.warn(
              `  ⚠️  Failed to warm up ${packageSpec}: ${error.message}`,
            );
            resolve(); // Don't fail the whole process
          });

          warmupProcess.on('exit', (code) => {
            if (code === 0) {
              console.log(`  ✅ ${packageSpec} cached`);
            } else {
              console.warn(
                `  ⚠️  ${packageSpec} warmup exited with code ${code}`,
              );
            }
            resolve();
          });

          // Set a timeout for warmup
          setTimeout(() => {
            warmupProcess.kill('SIGTERM');
            console.warn(`  ⚠️  ${packageSpec} warmup timeout`);
            resolve();
          }, 30000); // 30 second timeout for warmup
        });
      } catch (error) {
        console.warn(`  ⚠️  Failed to warm up ${serverConfig.id}: ${error}`);
        // Don't fail the whole initialization
      }
    });

    await Promise.all(warmupPromises);
    console.log('✅ NPX package warmup complete');
  }

  /**
   * サーバーに接続
   */
  async connectServer(serverConfig: ServerConfig): Promise<void> {
    const { id: serverId, type } = serverConfig;

    // 既に接続されている場合はスキップ
    if (this.connections.has(serverId)) {
      console.log(`Server ${serverId} is already connected`);
      return;
    }

    console.log(`Connecting to server ${serverId} (${type})...`);

    try {
      if (type === 'local') {
        // ローカルサーバーの接続
        const transport = new StdioTransport({
          command: serverConfig.command,
          args: serverConfig.args || [],
          cwd: serverConfig.cwd,
          env: serverConfig.env,
        });

        const client = new Client({
          name: 'hatago-hub-client',
          version: '0.0.1',
        });

        // トランスポートを開始
        await transport.start();

        // MCPクライアントを接続
        await client.connect(transport.getClientTransport());

        // 接続情報を保存
        const connection: McpConnection = {
          serverId,
          client,
          transport,
          connected: true,
          capabilities: client.getServerCapabilities?.(),
          type: 'local',
        };
        this.connections.set(serverId, connection);

        // ツールを取得して登録
        await this.refreshServerTools(serverId);

        console.log(`Connected to server ${serverId}`);
      } else if (type === 'npx') {
        // NPXサーバーの接続
        if (!this.serverRegistry) {
          throw new Error('Server registry not initialized');
        }

        const npxConfig = serverConfig as NpxServerConfig;
        const registered =
          await this.serverRegistry.registerNpxServer(npxConfig);

        // 起動
        await this.serverRegistry.startServer(serverId);

        // 接続情報を保存
        const connection: McpConnection = {
          serverId,
          npxServer: registered.instance,
          connected: true,
          type: 'npx',
        };
        this.connections.set(serverId, connection);

        // ツールを取得して登録（NPXサーバーの場合はRegistryから取得）
        await this.refreshNpxServerTools(serverId);

        console.log(`Connected to NPX server ${serverId}`);
      } else if (type === 'remote') {
        // リモートサーバーの接続
        if (!this.serverRegistry) {
          throw new Error('Server registry not initialized');
        }

        const remoteConfig = serverConfig as RemoteServerConfig;
        const registered =
          await this.serverRegistry.registerRemoteServer(remoteConfig);

        // エラーリスナーを設定（Node.jsのunhandled errorを防ぐ）
        if (registered.instance) {
          const remoteServer = registered.instance as RemoteMcpServer;

          // エラーハンドリングを改善
          remoteServer.on('error', (event) => {
            console.warn(`Remote server ${serverId} error:`, event.error);
            // エラーイベントを処理済みとしてマーク
          });

          // すべてのエラーイベントリスナーを確実に設定
          remoteServer.setMaxListeners(10); // デフォルトの10を明示的に設定
        }

        // 起動
        await this.serverRegistry.startServer(serverId);

        // 接続情報を保存
        const connection: McpConnection = {
          serverId,
          remoteServer: registered.instance as RemoteMcpServer,
          connected: true,
          type: 'remote',
        };
        this.connections.set(serverId, connection);

        // サーバーが起動してツールが発見されるまで待つ
        // ServerRegistryの'started'イベントがツール発見をトリガーする
        const waitForToolsDiscovery = async (
          timeoutMs = 5000,
        ): Promise<{ success: boolean; partial?: boolean }> => {
          const server = this.serverRegistry?.getServer(serverId);
          if (server?.tools && server.tools.length > 0) {
            return { success: true };
          }

          return new Promise<{ success: boolean; partial?: boolean }>(
            (resolve) => {
              const timeout = setTimeout(() => {
                this.serverRegistry?.off('server:tools-discovered', handler);

                // タイムアウト時の警告とpartialフラグ
                const currentServer = this.serverRegistry?.getServer(serverId);
                const hasPartialTools =
                  currentServer?.tools && currentServer.tools.length > 0;

                console.warn(
                  `⚠️  Tool discovery timeout for ${serverId} (${timeoutMs}ms).`,
                  hasPartialTools
                    ? `Found ${currentServer.tools.length} tools so far.`
                    : 'No tools discovered yet.',
                );

                resolve({
                  success: false,
                  partial: hasPartialTools,
                });
              }, timeoutMs);

              const handler = ({
                serverId: discoveredId,
              }: {
                serverId: string;
              }) => {
                if (discoveredId === serverId) {
                  clearTimeout(timeout);
                  this.serverRegistry?.off('server:tools-discovered', handler);
                  resolve({ success: true });
                }
              };

              this.serverRegistry?.on('server:tools-discovered', handler);
            },
          );
        };

        // ツール発見を待つ（リトライ機能付き）
        let discoveryResult = await waitForToolsDiscovery();

        // 初回タイムアウトの場合、指数バックオフでリトライ
        if (!discoveryResult.success && !discoveryResult.partial) {
          console.log(`Retrying tool discovery for ${serverId}...`);

          // 指数バックオフでリトライ（最大3回）
          const maxRetries = 3;
          let retryDelay = 1000; // 初回1秒

          for (let i = 0; i < maxRetries && !discoveryResult.success; i++) {
            await new Promise((resolve) => setTimeout(resolve, retryDelay));

            console.log(`Retry ${i + 1}/${maxRetries} for ${serverId}...`);
            discoveryResult = await waitForToolsDiscovery(retryDelay * 2);

            retryDelay *= 2; // 指数バックオフ
          }

          if (!discoveryResult.success) {
            console.error(
              `Failed to discover tools for ${serverId} after ${maxRetries} retries.`,
              'Server will continue without tools.',
            );
          }
        }

        // ツールを取得して登録（リモートサーバーの場合はRegistryから取得）
        await this.refreshRemoteServerTools(serverId);

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
   * サーバーのツールを更新
   */
  private async refreshServerTools(serverId: string): Promise<void> {
    const connection = this.connections.get(serverId);
    if (!connection?.connected || !connection.client) {
      return;
    }

    try {
      // サーバーからツール一覧を取得
      const response = await connection.client.listTools();
      const tools = response.tools || [];

      console.log(`Server ${serverId} has ${tools.length} tools`);

      // レジストリに登録
      this.registry.registerServerTools(serverId, tools);

      // ハブのツールを更新
      this.updateHubTools();
    } catch (error) {
      console.error(`Failed to refresh tools for server ${serverId}:`, error);
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
      const tools = registered.tools.map((name) => ({
        name,
        description: `Tool from NPX server ${serverId}`,
        inputSchema: {},
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
    if (!this.serverRegistry) {
      return;
    }

    const registered = this.serverRegistry.getServer(serverId);
    if (!registered?.tools) {
      return;
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
   * ハブのツールを更新
   */
  private updateHubTools(): void {
    const tools = this.registry.getAllTools();
    console.log(`Hub now has ${tools.length} total tools`);

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
        const zodLikeSchema = createZodLikeSchema(tool.inputSchema);

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
        const runtime = await getRuntime();
        const toolId = await runtime.idGenerator.generate();

        const toolRequest = JSON.stringify({
          jsonrpc: '2.0',
          id: toolId,
          method: 'tools/call',
          params: {
            name: originalName,
            arguments: toolArgs,
          },
        });

        // リクエストを送信
        await connection.npxServer.send(`${toolRequest}\n`);

        // レスポンスを待つ
        callPromise = this.waitForToolResponse(connection.npxServer, toolId);
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
   * NPXサーバーからのツール実行レスポンスを待つ
   */
  private async waitForToolResponse(
    server: NpxMcpServer,
    requestId: string,
  ): Promise<CallToolResult> {
    return new Promise((resolve, reject) => {
      let buffer = '';
      let cleanupStdout: (() => void) | null = null;

      const onData = (data: Buffer) => {
        buffer += data.toString();
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          if (!line.trim()) continue;

          try {
            const message = JSON.parse(line);

            if (message.id === requestId) {
              if (cleanupStdout) cleanupStdout();

              if (message.result) {
                resolve(message.result);
              } else if (message.error) {
                reject(new Error(message.error.message));
              }
              return;
            }
          } catch {
            // Not valid JSON, continue
          }
        }
      };

      cleanupStdout = server.onStdout(onData);

      // タイムアウトは呼び出し側で設定される
    });
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

    // NPXサーバー関連のシャットダウン
    if (this.serverRegistry) {
      await this.serverRegistry.shutdown();
    }
    if (this.workspaceManager) {
      await this.workspaceManager.shutdown();
    }

    console.log('MCP Hub shutdown complete');
  }
}
