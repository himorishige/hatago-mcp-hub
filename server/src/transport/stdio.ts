import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { ErrorHelpers } from '../utils/errors.js';

// STDIO transport options
export interface StdioTransportOptions {
  command: string;
  args?: string[];
  cwd?: string;
  env?: Record<string, string>;
}

/**
 * STDIO Transport - Manages communication with child processes
 */
export class StdioTransport {
  private options: StdioTransportOptions;
  private clientTransport?: StdioClientTransport;
  private connected = false;

  constructor(options: StdioTransportOptions) {
    this.options = options;
  }

  /**
   * Start the transport
   */
  async start(): Promise<void> {
    if (this.connected) {
      throw ErrorHelpers.transportAlreadyStarted();
    }
    // Create MCP client transport
    // StdioClientTransport manages the process itself
    this.clientTransport = new StdioClientTransport({
      command: this.options.command,
      args: this.options.args,
      env: {
        ...process.env,
        ...this.options.env,
      } as Record<string, string>,
    });

    this.connected = true;
  }

  /**
   * Stop the transport
   */
  async stop(): Promise<void> {
    if (!this.connected) {
      return;
    }
    // Need to check if StdioClientTransport has close method
    // For now, just perform cleanup
    this.clientTransport = undefined;
    this.connected = false;
  }

  /**
   * Get client transport
   */
  getClientTransport(): StdioClientTransport {
    if (!this.clientTransport) {
      throw ErrorHelpers.transportNotStarted();
    }
    return this.clientTransport;
  }

  /**
   * Get connection status
   */
  isConnected(): boolean {
    return this.connected;
  }

  /**
   * Get process ID
   */
  getPid(): number | undefined {
    // Currently unavailable as StdioClientTransport manages the process
    return undefined;
  }

  /**
   * Restart the process
   */
  async restart(): Promise<void> {
    await this.stop();
    await this.start();
  }
}
