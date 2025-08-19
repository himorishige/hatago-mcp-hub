import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type {
  CallToolRequest,
  CallToolResult,
} from '@modelcontextprotocol/sdk/types.js';
import type {
  HatagoConfig,
  NpxServerConfig,
  ServerConfig,
} from '../config/types.js';
import { getRuntime } from '../runtime/types.js';
import type { NpxMcpServer } from '../servers/npx-mcp-server.js';
import type { RemoteMcpServer } from '../servers/remote-mcp-server.js';
import { ServerRegistry } from '../servers/server-registry.js';
import { WorkspaceManager } from '../servers/workspace-manager.js';
import { StdioTransport } from '../transport/stdio.js';
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
  }

  /**
   * MCPハブを初期化
   */
  async initialize(): Promise<void> {
    if (this.initialized) {
      return;
    }

    // NPXサーバーやリモートサーバーサポートの初期化
    const hasNpxServers = this.config.servers.some((s) => s.type === 'npx');
    const hasRemoteServers = this.config.servers.some(
      (s) => s.type === 'remote',
    );

    if (hasNpxServers || hasRemoteServers) {
      if (hasNpxServers) {
        this.workspaceManager = new WorkspaceManager();
        await this.workspaceManager.initialize();
      }

      this.serverRegistry = new ServerRegistry(this.workspaceManager);
      await this.serverRegistry.initialize();
    }

    // 設定されたサーバーを接続
    for (const serverConfig of this.config.servers) {
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
    // 現在の実装では、個別のツールハンドラを設定
    // 将来的にはより効率的な方法を検討
    const tools = this.registry.getAllTools();
    console.log(`Hub now has ${tools.length} total tools`);
  }

  /**
   * ツールを実行
   */
  async callTool(request: CallToolRequest): Promise<CallToolResult> {
    const { name: publicName, arguments: args } = request;

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
          arguments: args,
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
            arguments: args,
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
          args,
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
