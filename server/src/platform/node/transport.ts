/**
 * Node.js MCP Transport implementation
 */
import { type ChildProcess, spawn } from 'node:child_process';
import type { WebSocket as NodeWebSocket } from 'ws';
import type {
  MCPConnection,
  MCPTransport,
  MCPTransportOptions,
} from '../types.js';

/**
 * STDIO-based MCP connection for Node.js
 */
class StdioConnection implements MCPConnection {
  private child: ChildProcess;
  private _connected: boolean = false;
  private messageHandler?: (message: Uint8Array) => void;

  constructor(child: ChildProcess) {
    this.child = child;
    this._connected = true;

    // Handle stdout messages
    this.child.stdout?.on('data', (data: Buffer) => {
      if (this.messageHandler) {
        this.messageHandler(new Uint8Array(data));
      }
    });

    // Handle process exit
    this.child.on('exit', () => {
      this._connected = false;
    });

    this.child.on('error', (error) => {
      console.error('STDIO process error:', error);
      this._connected = false;
    });
  }

  async send(message: Uint8Array): Promise<void> {
    if (!this._connected) {
      throw new Error('Connection is closed');
    }

    return new Promise((resolve, reject) => {
      this.child.stdin?.write(message, (error) => {
        if (error) {
          reject(error);
        } else {
          resolve();
        }
      });
    });
  }

  onMessage(handler: (message: Uint8Array) => void): void {
    this.messageHandler = handler;
  }

  async close(): Promise<void> {
    this._connected = false;
    this.child.kill();
  }

  get connected(): boolean {
    return this._connected;
  }
}

/**
 * HTTP-based MCP connection
 */
class HttpConnection implements MCPConnection {
  private url: string;
  private headers: Record<string, string>;
  private _connected: boolean = true;
  private messageHandler?: (message: Uint8Array) => void;
  private eventSource?: EventSource;

  constructor(url: string, headers: Record<string, string> = {}) {
    this.url = url;
    this.headers = headers;
  }

  async send(message: Uint8Array): Promise<void> {
    if (!this._connected) {
      throw new Error('Connection is closed');
    }

    const response = await fetch(this.url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...this.headers,
      },
      body: Buffer.from(message),
    });

    if (!response.ok) {
      throw new Error(`HTTP error: ${response.status}`);
    }

    // Handle response
    const responseData = await response.arrayBuffer();
    if (responseData.byteLength > 0 && this.messageHandler) {
      this.messageHandler(new Uint8Array(responseData));
    }
  }

  onMessage(handler: (message: Uint8Array) => void): void {
    this.messageHandler = handler;

    // Set up SSE for receiving server-sent events
    if (typeof EventSource !== 'undefined') {
      this.eventSource = new EventSource(this.url);

      this.eventSource.onmessage = (event) => {
        const data = new TextEncoder().encode(event.data);
        handler(data);
      };

      this.eventSource.onerror = () => {
        this._connected = false;
      };
    }
  }

  async close(): Promise<void> {
    this._connected = false;
    this.eventSource?.close();
  }

  get connected(): boolean {
    return this._connected;
  }
}

/**
 * WebSocket-based MCP connection
 */
class WebSocketConnection implements MCPConnection {
  private ws?: NodeWebSocket;
  private _connected: boolean = false;
  private messageHandler?: (message: Uint8Array) => void;
  private url: string;

  constructor(url: string) {
    this.url = url;
  }

  async connect(): Promise<void> {
    return new Promise((resolve, reject) => {
      // Dynamic import for WebSocket support
      import('ws')
        .then((wsModule) => {
          const WebSocket = wsModule.default;
          this.ws = new WebSocket(this.url) as any;

          this.ws?.on('open', () => {
            this._connected = true;
            resolve();
          });

          this.ws?.on('message', (data: Buffer) => {
            if (this.messageHandler) {
              this.messageHandler(new Uint8Array(data));
            }
          });

          this.ws?.on('close', () => {
            this._connected = false;
          });

          this.ws?.on('error', (error: Error) => {
            console.error('WebSocket error:', error);
            reject(error);
          });
        })
        .catch(reject);
    });
  }

  async send(message: Uint8Array): Promise<void> {
    if (!this._connected || !this.ws) {
      throw new Error('WebSocket is not connected');
    }

    return new Promise((resolve, _reject) => {
      this.ws?.send(message);
      resolve();
    });
  }

  onMessage(handler: (message: Uint8Array) => void): void {
    this.messageHandler = handler;
  }

  async close(): Promise<void> {
    this._connected = false;
    this.ws?.close();
  }

  get connected(): boolean {
    return this._connected;
  }
}

/**
 * Node.js MCP Transport implementation
 */
export class NodeMCPTransport implements MCPTransport {
  async open(
    type: 'stdio' | 'ws' | 'http',
    opts: MCPTransportOptions,
  ): Promise<MCPConnection> {
    switch (type) {
      case 'stdio': {
        if (!opts.command) {
          throw new Error('Command is required for stdio transport');
        }

        const child = spawn(opts.command, opts.args ?? [], {
          cwd: opts.cwd,
          env: opts.env ? { ...process.env, ...opts.env } : process.env,
          stdio: 'pipe',
        });

        return new StdioConnection(child);
      }

      case 'http': {
        if (!opts.url) {
          throw new Error('URL is required for http transport');
        }

        return new HttpConnection(opts.url, opts.headers);
      }

      case 'ws': {
        if (!opts.url) {
          throw new Error('URL is required for websocket transport');
        }

        const connection = new WebSocketConnection(opts.url);
        await connection.connect();
        return connection;
      }

      default:
        throw new Error(`Unsupported transport type: ${type}`);
    }
  }
}
