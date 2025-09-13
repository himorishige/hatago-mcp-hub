/**
 * Relay Transport for Hatago MCP Hub
 *
 * Lightweight transport that relays requests through StreamableHTTPTransport
 * while maintaining a thin interface for better architecture alignment
 */

import type {
  ThinHttpTransport,
  ThinHttpRequest,
  ThinHttpResponse,
  StreamChunk,
  ThinTransportOptions,
  ThinJsonRpcTransport
} from './thin-facade.js';
import type {
  JSONRPCRequest,
  JSONRPCResponse,
  JSONRPCNotification
} from '@modelcontextprotocol/sdk/types.js';
import { StreamableHTTPTransport } from './streamable-http/streamable-http-transport.js';

import {
  createTraceContext,
  startSpan,
  endSpan,
  traceLogger,
  addCorrelationHeader
} from './tracing.js';

/**
 * Relay Transport implementation
 * Transparently relays requests while maintaining minimal overhead
 */
export class RelayTransport implements ThinHttpTransport {
  // Method overloads for send
  send(request: ThinHttpRequest): Promise<ThinHttpResponse>;
  send(message: JSONRPCRequest | JSONRPCNotification): Promise<void>;
  send(arg: unknown): Promise<unknown>;
  private transport: StreamableHTTPTransport;
  private debug: boolean;

  // Additional properties for compatibility
  public onmessage?: (message: unknown) => void;
  public onerror?: (error: Error) => void;
  public onclose?: () => void;

  constructor(options: ThinTransportOptions = {}) {
    this.debug = options.debug ?? false;

    // Create underlying transport with existing options
    this.transport = new StreamableHTTPTransport({
      sessionIdGenerator: () => options.sessionId ?? crypto.randomUUID()
    });

    // Forward onmessage to underlying transport
    Object.defineProperty(this, 'onmessage', {
      get: () => this.transport.onmessage,
      set: (handler) => {
        this.transport.onmessage = handler;
      }
    });

    if (this.debug) {
      console.error('[RelayTransport] Created with options:', options);
    }
  }

  async send(
    request: ThinHttpRequest | JSONRPCRequest | JSONRPCNotification
  ): Promise<ThinHttpResponse | void> {
    // Handle JSONRPCMessage
    if (request && typeof request === 'object' && 'jsonrpc' in request) {
      if (this.debug) {
        console.error('[RelayTransport] Forwarding JSONRPCMessage to transport.send');
      }
      return this.transport.send(request as unknown);
    }

    // Handle ThinHttpRequest
    // Create trace context
    const context = createTraceContext();
    const span = startSpan('send', {
      method: request.method,
      path: request.path
    });

    if (this.debug) {
      console.error('[RelayTransport] send:', request.method, request.path);
    }

    // Add correlation ID to headers
    const tracedRequest = {
      ...request,
      headers: addCorrelationHeader(request.headers ?? {}, context.correlationId)
    };

    try {
      traceLogger.trace(context, 'transport.send.start', {
        method: request.method,
        path: request.path
      });

      // For GET requests, we need to handle SSE differently
      let result;
      if (tracedRequest.method === 'GET') {
        // GET requests don't have a simple request/response pattern with StreamableHTTPTransport
        // We'll return a mock response for now
        result = {
          status: 200,
          headers: { 'content-type': 'text/event-stream' },
          body: undefined
        };
      } else {
        // Delegate to existing transport for POST/DELETE
        result = await this.transport.handleHttpRequest(
          tracedRequest.method,
          tracedRequest.headers,
          tracedRequest.body
        );
      }

      // Use the actual result from handleHttpRequest
      const response: ThinHttpResponse = {
        status: result?.status ?? 200,
        headers: result?.headers ?? {},
        body: result?.body ? JSON.stringify(result.body) : undefined
      };

      const completedSpan = endSpan(span);
      traceLogger.span(context, completedSpan);
      traceLogger.trace(context, 'transport.send.success', {
        status: response.status
      });

      if (this.debug) {
        console.error('[RelayTransport] response:', response.status);
      }

      return response;
    } catch (error) {
      const completedSpan = endSpan(span);
      traceLogger.span(context, completedSpan);
      traceLogger.trace(context, 'transport.send.error', error);

      // Pass through errors without transformation
      throw error;
    }
  }

  async *stream(request: ThinHttpRequest): AsyncIterable<StreamChunk> {
    if (this.debug) {
      console.error('[RelayTransport] stream:', request.method, request.path);
    }

    // For now, convert single response to stream
    // This will be properly implemented when we refactor streaming
    const response = await this.send(request);

    if (response.body) {
      // Parse SSE format if present
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
    if (this.debug) {
      console.error('[RelayTransport] closing');
    }
    await this.transport.close();
  }

  // Compatibility methods for StreamableHTTPTransport interface
  async start(): Promise<void> {
    console.error('[RelayTransport] start() called - starting underlying transport');
    // Start the underlying StreamableHTTPTransport
    await this.transport.start();
    console.error('[RelayTransport] transport.start() completed');
  }

  setKeepAliveMs(ms: number): void {
    if (this.debug) {
      console.error('[RelayTransport] setKeepAliveMs() called with:', ms);
    }
    // Thin implementation doesn't manage keep-alive
  }

  async sendProgressNotification(
    progressToken: string | number,
    progress: number,
    total?: number,
    message?: string
  ): Promise<void> {
    if (this.debug) {
      console.error(
        '[RelayTransport] sendProgressNotification:',
        progressToken,
        progress,
        total,
        message
      );
    }

    // Delegate directly to StreamableHTTPTransport's sendProgressNotification
    // with the correct signature
    await (this.transport as unknown).sendProgressNotification(progressToken, progress, total, message);
  }

  // Handle HTTP requests (compatibility with StreamableHTTPTransport)
  async handleHttpRequest(
    method: string,
    headers: Record<string, string>,
    body?: string | unknown,
    sseStream?: unknown
  ): Promise<{ status: number; headers: Record<string, string>; body?: unknown }> {
    if (this.debug) {
      console.error('[RelayTransport] handleHttpRequest called:', {
        method,
        hasBody: !!body,
        bodyType: typeof body
      });
    }

    // Delegate to the actual StreamableHTTPTransport
    // StreamableHTTPTransport expects body as unknown (already parsed)
    let parsedBody: unknown;
    if (body !== undefined) {
      if (typeof body === 'string') {
        try {
          parsedBody = JSON.parse(body);
        } catch {
          // If parsing fails, pass as-is
          parsedBody = body;
        }
      } else {
        // Already an object
        parsedBody = body;
      }
    }

    const result = await this.transport.handleHttpRequest(method, headers, parsedBody, sseStream);

    // StreamableHTTPTransport may return undefined for SSE responses
    if (!result) {
      return {
        status: 200,
        headers: {},
        body: undefined
      };
    }

    return {
      status: result.status,
      headers: result.headers || {},
      body: result.body
    };
  }
}

/**
 * JSON-RPC adapter using thin HTTP transport
 */
export class RelayJsonRpcTransport implements ThinJsonRpcTransport {
  private httpTransport: ThinHttpTransport;
  private notificationHandlers: Array<(notification: JSONRPCNotification) => void> = [];

  constructor(httpTransport: ThinHttpTransport, _options: ThinTransportOptions = {}) {
    this.httpTransport = httpTransport;
  }

  async request(message: JSONRPCRequest): Promise<JSONRPCResponse> {
    const httpRequest: ThinHttpRequest = {
      method: 'POST',
      path: '/rpc',
      headers: {
        'content-type': 'application/json'
      },
      body: JSON.stringify(message)
    };

    const response = await this.httpTransport.send(httpRequest);

    if (!response.body) {
      throw new Error('Empty response body');
    }

    return JSON.parse(response.body) as JSONRPCResponse;
  }

  async notify(message: JSONRPCNotification): Promise<void> {
    const httpRequest: ThinHttpRequest = {
      method: 'POST',
      path: '/rpc',
      headers: {
        'content-type': 'application/json'
      },
      body: JSON.stringify(message)
    };

    await this.httpTransport.send(httpRequest);
  }

  onNotification(handler: (notification: JSONRPCNotification) => void): void {
    this.notificationHandlers.push(handler);
  }

  async close(): Promise<void> {
    await this.httpTransport.close();
  }
}

/**
 * Create Relay HTTP Transport
 */
export function createRelayHttpTransport(options: ThinTransportOptions = {}): ThinHttpTransport {
  return new RelayTransport(options);
}

/**
 * Create Relay JSON-RPC Transport
 */
export function createRelayJsonRpcTransport(
  options: ThinTransportOptions = {}
): ThinJsonRpcTransport {
  const httpTransport = createRelayHttpTransport(options);
  return new RelayJsonRpcTransport(httpTransport, options);
}
