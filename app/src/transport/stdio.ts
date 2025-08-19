import { type ChildProcess, spawn } from 'node:child_process';
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
  private process?: ChildProcess;
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
      // 子プロセスを起動
      this.process = spawn(this.options.command, this.options.args || [], {
        cwd: this.options.cwd,
        env: {
          ...process.env,
          ...this.options.env,
        },
        stdio: ['pipe', 'pipe', 'pipe'],
      });

      // エラーハンドリング
      this.process.on('error', (error) => {
        console.error('Process error:', error);
        this.connected = false;
      });

      this.process.on('exit', (code, signal) => {
        console.log(`Process exited with code ${code} and signal ${signal}`);
        this.connected = false;
      });

      // stderr をログ出力
      this.process.stderr?.on('data', (data) => {
        console.error(`Process stderr: ${data.toString()}`);
      });

      // MCPクライアントトランスポートを作成
      if (!this.process.stdin || !this.process.stdout) {
        throw new Error('Failed to create process stdio streams');
      }

      this.clientTransport = new StdioClientTransport({
        stdin: this.process.stdin,
        stdout: this.process.stdout,
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
      // プロセスを終了
      if (this.process) {
        // プロセスが既に終了していないか確認
        if (
          this.process.exitCode === null &&
          this.process.signalCode === null
        ) {
          // まずSIGTERMを送信
          this.process.kill('SIGTERM');

          // プロセスの終了を待つ（最大3秒）
          const startTime = Date.now();
          while (
            this.process.exitCode === null &&
            this.process.signalCode === null &&
            Date.now() - startTime < 3000
          ) {
            await new Promise((resolve) => setTimeout(resolve, 100));
          }

          // まだ生きていればSIGKILLを送信
          if (
            this.process.exitCode === null &&
            this.process.signalCode === null
          ) {
            console.log(
              'Process did not terminate with SIGTERM, sending SIGKILL',
            );
            this.process.kill('SIGKILL');

            // SIGKILLの効果を待つ（最大1秒）
            const killTime = Date.now();
            while (
              this.process.exitCode === null &&
              this.process.signalCode === null &&
              Date.now() - killTime < 1000
            ) {
              await new Promise((resolve) => setTimeout(resolve, 100));
            }
          }
        }

        this.process = undefined;
      }

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
    return this.process?.pid;
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
