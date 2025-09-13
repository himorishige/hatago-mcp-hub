/**
 * Thin Adapter for StreamableHTTPTransport
 *
 * Phase 1 implementation: Delegates to existing thick implementation
 * This allows gradual migration without breaking existing functionality
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
 * Adapter that wraps existing StreamableHTTPTransport
 * Provides thin interface while delegating to thick implementation
 */
export class StreamableHttpAdapter implements ThinHttpTransport {
  private transport: StreamableHTTPTransport;
  private debug: boolean;

  constructor(options: ThinTransportOptions = {}) {
    this.debug = options.debug ?? false;

    // Create underlying transport with existing options
    this.transport = new StreamableHTTPTransport({
      sessionIdGenerator: () => options.sessionId ?? crypto.randomUUID()
    });

    if (this.debug) {
      console.error('[ThinAdapter] Created with options:', options);
    }
  }

  async send(request: ThinHttpRequest): Promise<ThinHttpResponse> {
    // Create trace context
    const context = createTraceContext();
    const span = startSpan('send', {
      method: request.method,
      path: request.path
    });

    if (this.debug) {
      console.error('[ThinAdapter] send:', request.method, request.path);
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
          {
            ...tracedRequest.headers,
            'x-session-id': tracedRequest.sessionId
          },
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
        console.error('[ThinAdapter] response:', response.status);
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
      console.error('[ThinAdapter] stream:', request.method, request.path);
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
      console.error('[ThinAdapter] closing');
    }
    await this.transport.close();
  }
}

/**
 * JSON-RPC adapter using thin HTTP transport
 */
export class ThinJsonRpcAdapter implements ThinJsonRpcTransport {
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
 * Factory function with feature flag support
 */
export function createThinHttpTransportWithAdapter(
  options: ThinTransportOptions = {}
): ThinHttpTransport {
  // Feature flag: Use thin implementation when ready
  const useThinImplementation = process.env.HATAGO_THIN_TRANSPORT === 'true';

  if (useThinImplementation) {
    // TODO: Return actual thin implementation in Phase 2
    console.error('[ThinAdapter] Thin implementation not ready, using adapter');
  }

  // Phase 1: Always use adapter
  return new StreamableHttpAdapter(options);
}

/**
 * Create JSON-RPC transport with adapter
 */
export function createThinJsonRpcTransportWithAdapter(
  options: ThinTransportOptions = {}
): ThinJsonRpcTransport {
  const httpTransport = createThinHttpTransportWithAdapter(options);
  return new ThinJsonRpcAdapter(httpTransport, options);
}
