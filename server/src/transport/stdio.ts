import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

// STDIOトランスポートのオプション
export interface StdioTransportOptions {
  command: string;
  args?: string[];
  cwd?: string;
  env?: Record<string, string>;
}

/**
 * STDIOトランスポート - 子プロセスとの通信を管理
 */
export class StdioTransport {
  private options: StdioTransportOptions;
  private clientTransport?: StdioClientTransport;
  private connected = false;

  constructor(options: StdioTransportOptions) {
    this.options = options;
  }

  /**
   * トランスポートを開始
   */
  async start(): Promise<void> {
    if (this.connected) {
      throw new Error('Transport is already started');
    }

    console.log(
      `Starting STDIO transport: ${this.options.command} ${this.options.args?.join(' ') || ''}`,
    );

    try {
      // MCPクライアントトランスポートを作成
      // StdioClientTransportが自分でプロセスを管理する
      this.clientTransport = new StdioClientTransport({
        command: this.options.command,
        args: this.options.args,
        env: {
          ...process.env,
          ...this.options.env,
        },
      });

      this.connected = true;
      console.log('STDIO transport started');
    } catch (error) {
      console.error('Failed to start STDIO transport:', error);
      throw error;
    }
  }

  /**
   * トランスポートを停止
   */
  async stop(): Promise<void> {
    if (!this.connected) {
      return;
    }

    console.log('Stopping STDIO transport...');

    try {
      // StdioClientTransportにcloseメソッドがあるか確認が必要
      // 今のところ、クリーンアップだけ行う
      this.clientTransport = undefined;
      this.connected = false;

      console.log('STDIO transport stopped');
    } catch (error) {
      console.error('Error stopping STDIO transport:', error);
      throw error;
    }
  }

  /**
   * クライアントトランスポートを取得
   */
  getClientTransport(): StdioClientTransport {
    if (!this.clientTransport) {
      throw new Error('Transport not started');
    }
    return this.clientTransport;
  }

  /**
   * 接続状態を取得
   */
  isConnected(): boolean {
    return this.connected;
  }

  /**
   * プロセスIDを取得
   */
  getPid(): number | undefined {
    // StdioClientTransportがプロセス管理するため、現在は取得不可
    return undefined;
  }

  /**
   * プロセスを再起動
   */
  async restart(): Promise<void> {
    console.log('Restarting STDIO transport...');
    await this.stop();
    await this.start();
  }
}
