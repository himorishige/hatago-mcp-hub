/**
 * Streamable HTTP handler for HatagoHub
 * Provides SSE-based progress notifications
 */

import type { SSEStream } from '@himorishige/hatago-transport';
import type { Context } from 'hono';
import { streamSSE, type SSEStreamingApi } from 'hono/streaming';
import type { HatagoHub } from './hub.js';

/**
 * Create SSE adapter for StreamableHTTP
 */
function createSSEAdapter(stream: SSEStreamingApi): SSEStream {
  return {
    closed: false,
    async write(data: string) {
      if (!this.closed) {
        await stream.write(data);
      }
    },
    async close() {
      this.closed = true;
      await stream.close();
    },
    onAbort(callback: () => void) {
      stream.onAbort(callback);
    }
  };
}

/**
 * Handle SSE endpoint for StreamableHTTP
 */
export function handleSSEEndpoint(hub: HatagoHub, c: Context) {
  const transport = hub.getStreamableTransport();
  if (!transport) {
    return c.text('StreamableHTTP not initialized', 500);
  }

  return streamSSE(c, async (stream) => {
    // Create SSE adapter
    const sseStream = createSSEAdapter(stream);

    // Get headers
    const headers: Record<string, string | undefined> = {};
    c.req.raw.headers.forEach((value: string, key: string) => {
      headers[key] = value;
    });

    // Handle through StreamableHTTP
    await transport.handleHttpRequest('GET', headers, undefined, sseStream);

    // Keep connection alive
    await new Promise(() => {}); // Never resolves
  });
}

/**
 * Create a simple SSE events endpoint with Hatago hub integration
 * This provides similar functionality to the example /events endpoint
 */
export function createEventsEndpoint(hub: HatagoHub) {
  return (c: Context) => {
    const clientId = c.req.query('clientId') || `client-${Date.now()}`;
    const sseManager = hub.getSSEManager();

    // SSE client connected: ${clientId}

    return streamSSE(c, async (stream) => {
      // Register client with SSE manager (enhanced with stream support)
      // Note: SSEManager expects WritableStreamDefaultWriter, but we pass null and use stream instead
      sseManager.addClient(clientId, null as unknown as WritableStreamDefaultWriter, stream);

      // Clean up on disconnect
      stream.onAbort(() => {
        // SSE client disconnected: ${clientId}
        sseManager.removeClient(clientId);
      });

      // Keep stream open
      await new Promise(() => {}); // Never resolves, keeps connection open
    });
  };
}

/**
 * Handle MCP endpoint with StreamableHTTP support
 */
export async function handleMCPEndpoint(hub: HatagoHub, c: Context) {
  const transport = hub.getStreamableTransport();
  if (!transport) {
    // Fallback to original implementation
    return hub.handleHttpRequest(c.req.raw);
  }

  const method = c.req.method;
  // const _acceptHeader = c.req.header('Accept');
  // const _sessionId = c.req.header('mcp-session-id');

  // Debug logging disabled to prevent stdout pollution in STDIO mode
  // To enable debug logging, use proper logger instance with stderr output

  // Handle SSE request
  if (method === 'GET' && c.req.header('Accept')?.includes('text/event-stream')) {
    return handleSSEEndpoint(hub, c);
  }

  // Handle POST request with potential SSE response
  if (method === 'POST') {
    // Parse body
    let body: unknown;
    try {
      body = (await c.req.json()) as unknown;
    } catch {
      return c.json(
        {
          jsonrpc: '2.0',
          error: {
            code: -32700,
            message: 'Parse error'
          },
          id: null
        },
        400
      );
    }

    // Check if SSE response is needed
    const bodyAsRecord = body as Record<string, unknown>;
    const params = bodyAsRecord.params as Record<string, unknown> | undefined;
    const meta = params?._meta as Record<string, unknown> | undefined;
    const hasProgressToken = meta?.progressToken;
    const isToolCall = bodyAsRecord.method === 'tools/call';
    const acceptsSSE = c.req.header('Accept')?.includes('text/event-stream');

    // Always use SSE if client accepts it and it's a tool call with progress token
    if (acceptsSSE && isToolCall && hasProgressToken) {
      // Use SSE response
      return streamSSE(c, async (stream) => {
        const sseStream = createSSEAdapter(stream);

        // Get headers
        const headers: Record<string, string | undefined> = {};
        c.req.raw.headers.forEach((value: string, key: string) => {
          headers[key] = value;
        });

        // Handle through StreamableHTTP
        const result = await transport.handleHttpRequest('POST', headers, body, sseStream);

        const resultBody = result?.body as unknown;
        if (resultBody) {
          // Send final response via SSE
          await stream.write(`data: ${JSON.stringify(resultBody)}\n\n`);
        }

        await stream.close();
      });
    }

    // Regular JSON response
    const headers: Record<string, string | undefined> = {};
    c.req.raw.headers.forEach((value: string, key: string) => {
      headers[key] = value;
    });

    const result = await transport.handleHttpRequest('POST', headers, body);

    if (result) {
      // Set response headers
      const resultHeaders = result.headers as Record<string, unknown> | undefined;
      if (resultHeaders) {
        Object.entries(resultHeaders).forEach(([key, value]) => {
          if (typeof value === 'string') {
            c.header(key, value);
          }
        });
      }
      const resultBody = result.body as unknown;
      const resultStatus = result.status as number | undefined;
      // Using 'any' for Hono framework compatibility - status code type mismatch
      return resultBody
        ? // eslint-disable-next-line @typescript-eslint/no-explicit-any
          c.json(resultBody as any, (resultStatus || 200) as any)
        : // eslint-disable-next-line @typescript-eslint/no-explicit-any
          c.body(null, (resultStatus || 200) as any);
    }
  }

  // Fallback to original implementation
  return hub.handleHttpRequest(c.req.raw);
}
