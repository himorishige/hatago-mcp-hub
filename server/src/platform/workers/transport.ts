/**
 * Cloudflare Workers MCP Transport implementation
 */
import type {
  MCPConnection,
  MCPTransport,
  MCPTransportOptions,
} from '../types.js';

/**
 * HTTP-based MCP connection for Workers
 */
class WorkersHttpConnection implements MCPConnection {
  private url: string;
  private headers: Record<string, string>;
  private _connected: boolean = true;
  private messageHandler?: (message: Uint8Array) => void;

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
      body: message,
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
  }

  async close(): Promise<void> {
    this._connected = false;
  }

  get connected(): boolean {
    return this._connected;
  }
}

/**
 * WebSocket-based MCP connection for Workers
 */
class WorkersWebSocketConnection implements MCPConnection {
  private ws?: WebSocket;
  private _connected: boolean = false;
  private messageHandler?: (message: Uint8Array) => void;
  private url: string;

  // Store event handlers for cleanup
  private openHandler?: () => void;
  private messageEventHandler?: (event: MessageEvent) => void;
  private closeHandler?: () => void;
  private errorHandler?: (error: Event) => void;

  constructor(url: string) {
    this.url = url;
  }

  async connect(): Promise<void> {
    return new Promise((resolve, reject) => {
      this.ws = new WebSocket(this.url);

      this.openHandler = () => {
        this._connected = true;
        resolve();
      };

      this.messageEventHandler = (event) => {
        if (this.messageHandler) {
          if (typeof event.data === 'string') {
            const encoder = new TextEncoder();
            this.messageHandler(encoder.encode(event.data));
          } else if (event.data instanceof ArrayBuffer) {
            this.messageHandler(new Uint8Array(event.data));
          }
        }
      };

      this.closeHandler = () => {
        this._connected = false;
      };

      this.errorHandler = (error) => {
        console.error('WebSocket error:', error);
        reject(error);
      };

      this.ws.addEventListener('open', this.openHandler);
      this.ws.addEventListener('message', this.messageEventHandler);
      this.ws.addEventListener('close', this.closeHandler);
      this.ws.addEventListener('error', this.errorHandler);
    });
  }

  async send(message: Uint8Array): Promise<void> {
    if (!this._connected || !this.ws) {
      throw new Error('WebSocket is not connected');
    }

    this.ws.send(message);
  }

  onMessage(handler: (message: Uint8Array) => void): void {
    this.messageHandler = handler;
  }

  async close(): Promise<void> {
    this._connected = false;

    // Remove event listeners
    if (this.ws) {
      if (this.openHandler) {
        this.ws.removeEventListener('open', this.openHandler);
      }
      if (this.messageEventHandler) {
        this.ws.removeEventListener('message', this.messageEventHandler);
      }
      if (this.closeHandler) {
        this.ws.removeEventListener('close', this.closeHandler);
      }
      if (this.errorHandler) {
        this.ws.removeEventListener('error', this.errorHandler);
      }

      this.ws.close();
    }

    // Clear references
    this.ws = undefined;
    this.openHandler = undefined;
    this.messageEventHandler = undefined;
    this.closeHandler = undefined;
    this.errorHandler = undefined;
  }

  get connected(): boolean {
    return this._connected;
  }
}

/**
 * Workers MCP Transport implementation
 * Only supports HTTP and WebSocket (no stdio support)
 */
export class WorkersMCPTransport implements MCPTransport {
  async open(
    type: 'stdio' | 'ws' | 'http',
    opts: MCPTransportOptions,
  ): Promise<MCPConnection> {
    switch (type) {
      case 'stdio':
        throw new Error(
          'STDIO transport is not supported in Workers environment',
        );

      case 'http': {
        if (!opts.url) {
          throw new Error('URL is required for http transport');
        }

        return new WorkersHttpConnection(opts.url, opts.headers);
      }

      case 'ws': {
        if (!opts.url) {
          throw new Error('URL is required for websocket transport');
        }

        const connection = new WorkersWebSocketConnection(opts.url);
        await connection.connect();
        return connection;
      }

      default:
        throw new Error(`Unsupported transport type: ${type}`);
    }
  }
}
