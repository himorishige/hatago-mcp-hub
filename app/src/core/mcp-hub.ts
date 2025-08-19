import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type {
  CallToolRequest,
  CallToolResult,
} from '@modelcontextprotocol/sdk/types.js';
import type { HatagoConfig, ServerConfig } from '../config/types.js';
import { StdioTransport } from '../transport/stdio.js';
import { ToolRegistry } from './tool-registry.js';

// MCPサーバー接続情報
export interface McpConnection {
  serverId: string;
  client: Client;
  transport: StdioTransport;
  connected: boolean;
  capabilities?: unknown;
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

    console.log('Initializing MCP Hub...');

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
    console.log('MCP Hub initialized');
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
      // 現在はローカルサーバーのみサポート
      if (type === 'local') {
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
        };
        this.connections.set(serverId, connection);

        // ツールを取得して登録
        await this.refreshServerTools(serverId);

        console.log(`Connected to server ${serverId}`);
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
      // クライアントを切断
      await connection.client.close();

      // トランスポートを停止
      await connection.transport.stop();

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
    if (!connection?.connected) {
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
    const connection = this.connections.get(serverId);
    if (!connection?.connected) {
      // 遅延接続を試みる
      const serverConfig = this.config.servers.find((s) => s.id === serverId);
      if (serverConfig && serverConfig.start === 'lazy') {
        try {
          await this.connectServer(serverConfig);
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

    // 再度接続を取得
    const activeConnection = this.connections.get(serverId);
    if (!activeConnection) {
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

      const callPromise = activeConnection.client.callTool({
        name: originalName,
        arguments: args,
      });

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

    console.log('MCP Hub shutdown complete');
  }
}
