/**
 * Cloudflare Workers MCP Transport implementation
 */
import type {
  MCPConnection,
  MCPTransport,
  MCPTransportOptions,
} from '../types.js';

/**
 * Simple SSE parser for Workers
 */
class SSEParser {
  private buffer = '';
  private lastEventId?: string;

  parse(chunk: string): Array<{ event?: string; data?: string; id?: string }> {
    this.buffer += chunk;
    const lines = this.buffer.split('\n');
    const messages: Array<{ event?: string; data?: string; id?: string }> = [];

    let currentMessage: { event?: string; data?: string; id?: string } = {};
    let hasData = false;

    // Keep last incomplete line in buffer
    this.buffer = lines[lines.length - 1];

    for (let i = 0; i < lines.length - 1; i++) {
      const line = lines[i].trim();

      if (line === '') {
        // Empty line signals end of message
        if (hasData) {
          if (currentMessage.id) {
            this.lastEventId = currentMessage.id;
          }
          messages.push(currentMessage);
          currentMessage = {};
          hasData = false;
        }
        continue;
      }

      if (line.startsWith(':')) {
        // Comment line, ignore
        continue;
      }

      const colonIndex = line.indexOf(':');
      if (colonIndex === -1) {
        // Line with just field name
        continue;
      }

      const field = line.substring(0, colonIndex);
      const value = line.substring(colonIndex + 1).trimStart();

      switch (field) {
        case 'event':
          currentMessage.event = value;
          break;
        case 'data':
          if (currentMessage.data) {
            currentMessage.data += `\n${value}`;
          } else {
            currentMessage.data = value;
          }
          hasData = true;
          break;
        case 'id':
          currentMessage.id = value;
          break;
      }
    }

    return messages;
  }

  getLastEventId(): string | undefined {
    return this.lastEventId;
  }
}

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
 * SSE-based MCP connection for Workers
 */
class WorkersSSEConnection implements MCPConnection {
  private url: string;
  private headers: Record<string, string>;
  private _connected: boolean = false;
  private messageHandler?: (message: Uint8Array) => void;
  private abortController?: AbortController;
  private parser = new SSEParser();
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 5;
  private reconnectDelay = 1000; // Start with 1 second

  constructor(url: string, headers: Record<string, string> = {}) {
    this.url = url;
    this.headers = headers;
  }

  async connect(): Promise<void> {
    this.abortController = new AbortController();

    try {
      const headers: Record<string, string> = {
        Accept: 'text/event-stream',
        'Cache-Control': 'no-cache',
        ...this.headers,
      };

      // Add Last-Event-ID for reconnection
      const lastEventId = this.parser.getLastEventId();
      if (lastEventId) {
        headers['Last-Event-ID'] = lastEventId;
      }

      const response = await fetch(this.url, {
        method: 'GET',
        headers,
        signal: this.abortController.signal,
      });

      if (!response.ok) {
        throw new Error(`SSE connection failed: ${response.status}`);
      }

      if (!response.body) {
        throw new Error('SSE response has no body');
      }

      this._connected = true;
      this.reconnectAttempts = 0;
      this.reconnectDelay = 1000;

      // Process the stream
      const reader = response.body.getReader();
      const decoder = new TextDecoder();

      (async () => {
        try {
          while (this._connected) {
            const { done, value } = await reader.read();

            if (done) {
              // Stream ended, attempt reconnection
              if (this._connected) {
                await this.reconnect();
              }
              break;
            }

            const chunk = decoder.decode(value, { stream: true });
            const messages = this.parser.parse(chunk);

            for (const message of messages) {
              if (message.data && this.messageHandler) {
                const encoder = new TextEncoder();
                this.messageHandler(encoder.encode(message.data));
              }
            }
          }
        } catch (error) {
          if (this._connected && !this.abortController?.signal.aborted) {
            console.error('SSE stream error:', error);
            await this.reconnect();
          }
        } finally {
          reader.releaseLock();
        }
      })();
    } catch (error) {
      this._connected = false;
      throw error;
    }
  }

  private async reconnect(): Promise<void> {
    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      console.error('Max reconnection attempts reached');
      this._connected = false;
      return;
    }

    this.reconnectAttempts++;

    // Exponential backoff with jitter
    const jitter = Math.random() * 1000;
    const delay = Math.min(
      this.reconnectDelay * 2 ** (this.reconnectAttempts - 1) + jitter,
      30000,
    );

    console.log(
      `Reconnecting SSE in ${delay}ms (attempt ${this.reconnectAttempts})`,
    );

    await new Promise((resolve) => setTimeout(resolve, delay));

    if (this._connected) {
      try {
        await this.connect();
      } catch (error) {
        console.error('SSE reconnection failed:', error);
      }
    }
  }

  async send(message: Uint8Array): Promise<void> {
    // SSE is receive-only, send via separate HTTP request
    const response = await fetch(this.url.replace('/stream', ''), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...this.headers,
      },
      body: message,
    });

    if (!response.ok) {
      throw new Error(`Failed to send message: ${response.status}`);
    }
  }

  onMessage(handler: (message: Uint8Array) => void): void {
    this.messageHandler = handler;
  }

  async close(): Promise<void> {
    this._connected = false;

    if (this.abortController) {
      this.abortController.abort();
      this.abortController = undefined;
    }
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
    type: 'stdio' | 'ws' | 'http' | 'sse',
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

      case 'sse': {
        if (!opts.url) {
          throw new Error('URL is required for SSE transport');
        }

        const connection = new WorkersSSEConnection(opts.url, opts.headers);
        await connection.connect();
        return connection;
      }

      default:
        throw new Error(`Unsupported transport type: ${type}`);
    }
  }
}
