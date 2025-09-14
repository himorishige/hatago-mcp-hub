/**
 * Relay Transport for Hatago MCP Hub
 *
 * Thin wrapper around StreamableHTTPTransport following the philosophy:
 * - Don't add, remove
 * - Don't transform, relay
 * - Don't judge, pass through
 * - Don't thicken, stay thin
 */

// Type definitions moved from thin-facade.ts (deleted for simplicity)
// Following Hatago philosophy: "Don't add, remove"

/**
 * Minimal HTTP request representation
 */
export type ThinHttpRequest = {
  method: 'GET' | 'POST' | 'DELETE';
  path: string;
  headers?: Record<string, string>;
  body?: string;
  sessionId?: string;
};

/**
 * Minimal HTTP response representation
 */
export type ThinHttpResponse = {
  status: number;
  headers?: Record<string, string>;
  body?: string;
};

/**
 * Stream chunk for SSE/streaming responses
 */
export type StreamChunk = {
  data: string;
  event?: string;
  id?: string;
};

/**
 * Thin HTTP Transport Interface
 *
 * Core principle: Pure relay without judgment
 * - No retry logic (handled by policy layer)
 * - No error transformation (pass through as-is)
 * - No data processing (transparent relay)
 */
export type ThinHttpTransport = {
  send(request: ThinHttpRequest): Promise<ThinHttpResponse>;
  stream(request: ThinHttpRequest): AsyncIterable<StreamChunk>;
  close(): Promise<void>;
};

/**
 * Transport options - minimal configuration
 */
export type ThinTransportOptions = {
  baseUrl?: string;
  sessionId?: string;
  headers?: Record<string, string>;
  debug?: boolean;
};
import type {
  JSONRPCRequest,
  JSONRPCNotification,
  JSONRPCMessage
} from '@modelcontextprotocol/sdk/types.js';
import { StreamableHTTPTransport } from './streamable-http/streamable-http-transport.js';
import type { SSEStream } from './streamable-http/index.js';

/**
 * Relay Transport - Minimal wrapper around StreamableHTTPTransport
 */
export class RelayTransport implements ThinHttpTransport {
  private transport: StreamableHTTPTransport;

  constructor(options: ThinTransportOptions = {}) {
    this.transport = new StreamableHTTPTransport({
      sessionIdGenerator: () => options.sessionId ?? crypto.randomUUID()
    });
  }

  // Simple property forwarding
  get onmessage() {
    return this.transport.onmessage as ((message: unknown) => void) | undefined;
  }

  set onmessage(handler: ((message: unknown) => void) | undefined) {
    this.transport.onmessage = handler as ((message: JSONRPCMessage) => void) | undefined;
  }

  // Method overloads for send
  send(request: ThinHttpRequest): Promise<ThinHttpResponse>;
  send(message: JSONRPCRequest | JSONRPCNotification): Promise<void>;
  async send(
    request: ThinHttpRequest | JSONRPCRequest | JSONRPCNotification
  ): Promise<ThinHttpResponse | void> {
    // Handle JSONRPCMessage - direct relay
    if (request && typeof request === 'object' && 'jsonrpc' in request) {
      return this.transport.send(request);
    }

    // Handle ThinHttpRequest - relay to handleHttpRequest
    const result = await this.transport.handleHttpRequest(
      request.method,
      request.headers ?? {},
      request.body
    );

    // Return simplified response
    return {
      status: result?.status ?? 200,
      headers: result?.headers ?? {},
      body: result?.body ? JSON.stringify(result.body) : undefined
    };
  }

  async *stream(request: ThinHttpRequest): AsyncIterable<StreamChunk> {
    // Simple conversion from response to stream
    const response = await this.send(request);

    if (response.body) {
      const lines = response.body.split('\n');
      for (const line of lines) {
        if (line.startsWith('data: ')) {
          yield {
            data: line.substring(6),
            event: 'message'
          };
        }
      }
    }
  }

  async close(): Promise<void> {
    await this.transport.close();
  }

  // Compatibility methods
  async start(): Promise<void> {
    await this.transport.start();
  }

  setKeepAliveMs(_ms: number): void {
    // Thin implementation doesn't manage keep-alive
  }

  async sendProgressNotification(
    progressToken: string | number,
    progress: number,
    total?: number,
    message?: string
  ): Promise<void> {
    // Direct delegation to StreamableHTTPTransport method
    const transportWithProgress = this.transport as StreamableHTTPTransport & {
      sendProgressNotification: (
        progressToken: string | number,
        progress: number,
        total?: number,
        message?: string
      ) => Promise<void>;
    };
    await transportWithProgress.sendProgressNotification(progressToken, progress, total, message);
  }

  // HTTP request handler for compatibility
  async handleHttpRequest(
    method: string,
    headers: Record<string, string>,
    body?: string | unknown,
    sseStream?: SSEStream
  ): Promise<{ status: number; headers: Record<string, string>; body?: unknown }> {
    // Parse body if it's a string
    const parsedBody: unknown = typeof body === 'string' && body ? JSON.parse(body) : body;

    const result = await this.transport.handleHttpRequest(method, headers, parsedBody, sseStream);

    return {
      status: result?.status ?? 200,
      headers: result?.headers ?? {},
      body: result?.body
    };
  }
}

/**
 * Create Relay HTTP Transport
 */
export function createRelayHttpTransport(options: ThinTransportOptions = {}): ThinHttpTransport {
  return new RelayTransport(options);
}
