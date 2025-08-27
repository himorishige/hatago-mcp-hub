/**
 * Custom STDIO Transport for NPX MCP Servers
 * Handles initialization sequence and protocol framing correctly
 */

import { type ChildProcess, spawn } from 'node:child_process';
import { EventEmitter } from 'node:events';
import type { Transport } from '@modelcontextprotocol/sdk/shared/transport.js';
import type { JSONRPCMessage } from '@modelcontextprotocol/sdk/types.js';
import { APP_NAME, APP_VERSION, MCP_PROTOCOL_VERSION } from '../constants.js';
import type { NegotiatedProtocol } from '../core/types.js';
import { ErrorHelpers } from '../utils/errors.js';

export interface CustomStdioTransportOptions {
  command: string;
  args: string[];
  cwd?: string;
  env?: Record<string, string>;
  initTimeoutMs?: number;
  isFirstRun?: boolean;
}

export class CustomStdioTransport extends EventEmitter implements Transport {
  private child: ChildProcess | null = null;
  private stdinBuffer = Buffer.alloc(0);
  private closed = false;
  private negotiatedProtocol: NegotiatedProtocol | null = null;

  // Protocol handling
  private requestId = 1;
  private pendingRequests = new Map<
    number | string,
    {
      resolve: (result: JSONRPCMessage) => void;
      reject: (error: Error) => void;
      timer: NodeJS.Timeout;
    }
  >();

  onclose?: () => void;
  onerror?: (error: Error) => void;
  onmessage?: (message: JSONRPCMessage) => void;

  constructor(private options: CustomStdioTransportOptions) {
    super();
  }

  async start(): Promise<void> {
    if (this.child) {
      throw ErrorHelpers.stateAlreadyRunning('Transport');
    }

    // Prepare spawn options with optimized environment
    const spawnOptions = {
      stdio: ['pipe', 'pipe', 'pipe'] as any,
      shell: false,
      cwd: this.options.cwd || process.cwd(),
      env: {
        ...process.env,
        ...this.options.env,
        // Critical: suppress all non-protocol output
        NO_COLOR: '1',
        FORCE_COLOR: '0',
        NODE_NO_WARNINGS: '1',
        NPM_CONFIG_FUND: 'false',
        NPM_CONFIG_AUDIT: 'false',
        npm_config_loglevel: 'error',
        npm_config_progress: 'false',
        npm_config_update_notifier: 'false',
      },
    };

    // Spawn the process
    this.child = spawn(this.options.command, this.options.args, spawnOptions);

    // Handle process errors
    this.child?.on('error', (error) => {
      this.handleError(new Error(`Failed to spawn process: ${error.message}`));
    });

    this.child?.on('exit', (code, signal) => {
      if (!this.closed) {
        this.handleError(
          new Error(
            `Process exited unexpectedly: code=${code}, signal=${signal}`,
          ),
        );
      }
    });

    // Set up stdout handler with frame detection
    if (this.child?.stdout) {
      this.child?.stdout.on('data', (chunk: Buffer) => {
        this.handleStdoutData(chunk);
      });
    }

    // Set up stderr handler (log only, not protocol)
    if (this.child?.stderr) {
      this.child?.stderr.on('data', (chunk: Buffer) => {
        const text = chunk.toString('utf8');
        // Log stderr but don't treat as protocol
        if (process.env.DEBUG) {
          console.error(`[npx:stderr] ${text}`);
        }
      });
    }

    // Initialize with protocol negotiation
    await this.performInitialization();
  }

  private handleStdoutData(chunk: Buffer): void {
    this.stdinBuffer = Buffer.concat([this.stdinBuffer, chunk]);

    // Process all complete messages in the buffer
    while (true) {
      // MCP uses newline-delimited JSON, not Content-Length headers
      const newlineIndex = this.stdinBuffer.indexOf('\n');

      if (newlineIndex === -1) {
        // No complete message yet, keep buffering (but limit size)
        if (this.stdinBuffer.length > 64 * 1024) {
          // Keep only last 8KB to prevent memory issues
          this.stdinBuffer = this.stdinBuffer.slice(-8 * 1024);
        }
        break;
      }

      // Extract line up to newline
      const line = this.stdinBuffer.slice(0, newlineIndex).toString('utf8');

      // Remove processed line from buffer (including the newline)
      this.stdinBuffer = this.stdinBuffer.slice(newlineIndex + 1);

      // Skip empty lines
      if (line.trim().length === 0) {
        continue;
      }

      try {
        const message = JSON.parse(line) as JSONRPCMessage;
        this.handleMessage(message);
      } catch (error) {
        // Try Content-Length format as fallback for compatibility
        if (line.includes('Content-Length:')) {
          // Put the line back and try Content-Length parsing
          this.stdinBuffer = Buffer.concat([
            Buffer.from(`${line}\n`),
            this.stdinBuffer,
          ]);
          if (this.tryParseContentLength()) {
            continue;
          }
        }

        if (process.env.DEBUG) {
          console.error('Failed to parse JSON-RPC message:', error);
          console.error('Line:', line);
        }
      }
    }
  }

  private tryParseContentLength(): boolean {
    // Fallback parser for Content-Length format (for servers that use LSP-style framing)
    const bufferStr = this.stdinBuffer.toString('utf8');
    const headerMatch = bufferStr.match(/Content-Length:\s*(\d+)\r?\n/i);

    if (!headerMatch) {
      return false;
    }

    const headerIndex = this.stdinBuffer.indexOf('Content-Length:');
    const headerEndIndex = this.stdinBuffer.indexOf('\r\n\r\n', headerIndex);

    if (headerEndIndex === -1) {
      // Header not complete yet
      return false;
    }

    const contentLength = parseInt(headerMatch[1], 10);
    const bodyStart = headerEndIndex + 4;
    const bodyEnd = bodyStart + contentLength;

    if (this.stdinBuffer.length < bodyEnd) {
      // Body not complete yet
      return false;
    }

    // Extract the complete message
    const bodyBuffer = this.stdinBuffer.slice(bodyStart, bodyEnd);
    const messageText = bodyBuffer.toString('utf8');

    // Remove processed data from buffer
    this.stdinBuffer = this.stdinBuffer.slice(bodyEnd);

    try {
      const message = JSON.parse(messageText) as JSONRPCMessage;
      this.handleMessage(message);
      return true;
    } catch (error) {
      console.error('Failed to parse Content-Length message:', error);
      return false;
    }
  }

  private handleMessage(message: JSONRPCMessage): void {
    // Handle responses to our requests
    if ('id' in message && message.id !== null && message.id !== undefined) {
      const pending = this.pendingRequests.get(message.id);
      if (pending) {
        clearTimeout(pending.timer);
        this.pendingRequests.delete(message.id);

        // Resolve with the full message for waitForResponse
        pending.resolve(message);
      }
    }

    // Forward all messages to the client
    if (this.onmessage) {
      this.onmessage(message);
    }
  }

  private async performInitialization(): Promise<void> {
    // Simple initialization without MCPInitializer
    try {
      // Send initialize request
      const initRequest = {
        jsonrpc: '2.0' as const,
        id: 1,
        method: 'initialize',
        params: {
          protocolVersion: MCP_PROTOCOL_VERSION,
          capabilities: {},
          clientInfo: {
            name: APP_NAME,
            version: APP_VERSION,
          },
        },
      };

      await this.send(initRequest);

      // Wait for response with timeout
      const timeoutMs = this.options.initTimeoutMs || 30000;
      const response = await this.waitForResponse(1, timeoutMs);

      if ('error' in response) {
        throw new Error(`Initialization error: ${response.error.message}`);
      }

      // Store negotiated protocol
      this.negotiatedProtocol = {
        protocol: '2024-11-05',
        serverInfo: (response as any).result?.serverInfo,
        features: {
          notifications: true,
          resources: true,
          prompts: true,
          tools: true,
        },
        capabilities: (response as any).result?.capabilities || {},
      };

      // Send initialized notification
      await this.send({
        jsonrpc: '2.0',
        method: 'initialized',
        params: {},
      });

      console.log(
        `✅ Server initialized with protocol: ${this.negotiatedProtocol.protocol}`,
      );
      if (this.negotiatedProtocol.serverInfo) {
        console.log(
          `   Server: ${this.negotiatedProtocol.serverInfo.name} v${this.negotiatedProtocol.serverInfo.version}`,
        );
      }
    } catch (error) {
      const timeout = this.options.initTimeoutMs || 30000;
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      console.error(
        `Failed to initialize ${this.options.command}: ${errorMessage}`,
      );
      throw ErrorHelpers.mcpInitTimeout(this.options.command, timeout);
    }
  }

  // Simple implementation of waitForResponse
  async waitForResponse(
    id: number | string,
    timeoutMs: number,
  ): Promise<JSONRPCMessage> {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pendingRequests.delete(id);
        reject(
          new Error(`Response timeout for request ${id} after ${timeoutMs}ms`),
        );
      }, timeoutMs);

      this.pendingRequests.set(id, {
        resolve: (result: JSONRPCMessage) => resolve(result),
        reject,
        timer,
      });
    });
  }

  private sendFrame(message: JSONRPCMessage): void {
    if (!this.child || !this.child?.stdin) {
      throw ErrorHelpers.transportNotStarted();
    }

    // MCP uses newline-delimited JSON, not Content-Length headers
    const payload = `${JSON.stringify(message)}\n`;

    this.child?.stdin.write(payload);
  }

  async send(message: JSONRPCMessage): Promise<void> {
    if (!this.child || !this.child?.stdin) {
      throw ErrorHelpers.transportNotStarted();
    }

    // Assign ID if needed
    if ('method' in message && !('id' in message)) {
      const requestMessage = message as JSONRPCMessage & {
        id?: number | string;
      };
      requestMessage.id = ++this.requestId;
    }

    this.sendFrame(message);
  }

  async stop(): Promise<void> {
    return this.close();
  }

  async close(): Promise<void> {
    this.closed = true;

    // Clear all pending requests
    for (const [_id, pending] of this.pendingRequests) {
      clearTimeout(pending.timer);
      pending.reject(new Error('Transport closed'));
    }
    this.pendingRequests.clear();

    // Kill the child process
    if (this.child) {
      this.child.kill('SIGTERM');
      this.child = null;
    }

    if (this.onclose) {
      this.onclose();
    }
  }

  private handleError(error: Error): void {
    console.error('Transport error:', error);
    if (this.onerror) {
      this.onerror(error);
    }
    this.close();
  }

  /**
   * Get the negotiated protocol information
   */
  getNegotiatedProtocol(): NegotiatedProtocol | null {
    return this.negotiatedProtocol;
  }
}
