/**
 * Streamable HTTP handler for HatagoHub
 * Provides SSE-based progress notifications
 */

import type { SSEStream } from "@hatago/transport";
import type { Context } from "hono";
import { streamSSE } from "hono/streaming";
import type { HatagoHub } from "./hub.js";

/**
 * Create SSE adapter for StreamableHTTP
 */
function createSSEAdapter(stream: any): SSEStream {
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
    },
  };
}

/**
 * Handle SSE endpoint for StreamableHTTP
 */
export async function handleSSEEndpoint(hub: HatagoHub, c: Context) {
  const transport = (hub as any).streamableTransport;
  if (!transport) {
    return c.text("StreamableHTTP not initialized", 500);
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
    await transport.handleHttpRequest("GET", headers, undefined, sseStream);

    // Keep connection alive
    await new Promise(() => {}); // Never resolves
  });
}

/**
 * Create a simple SSE events endpoint with Hatago hub integration
 * This provides similar functionality to the example /events endpoint
 */
export function createEventsEndpoint(hub: HatagoHub) {
  return async (c: Context) => {
    const clientId = c.req.query("clientId") || `client-${Date.now()}`;
    const sseManager = hub.getSSEManager();

    console.log(`📡 SSE client connected: ${clientId}`);

    return streamSSE(c, async (stream) => {
      // Register client with SSE manager (enhanced with stream support)
      (sseManager as any).addClient(clientId, null as any, stream);

      // Clean up on disconnect
      stream.onAbort(() => {
        console.log(`📡 SSE client disconnected: ${clientId}`);
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
  const transport = (hub as any).streamableTransport;
  if (!transport) {
    // Fallback to original implementation
    return hub.handleHttpRequest(c.req.raw);
  }

  const method = c.req.method;
  const acceptHeader = c.req.header("Accept");
  const sessionId = c.req.header("mcp-session-id");

  // Debug logging for MCP Inspector
  console.log("[Hub] Incoming request:", {
    method,
    path: c.req.path,
    acceptHeader,
    sessionId,
    headers: Object.fromEntries(c.req.raw.headers.entries()),
  });

  // Handle SSE request
  if (
    method === "GET" &&
    c.req.header("Accept")?.includes("text/event-stream")
  ) {
    return handleSSEEndpoint(hub, c);
  }

  // Handle POST request with potential SSE response
  if (method === "POST") {
    // Parse body
    let body;
    try {
      body = await c.req.json();
    } catch {
      return c.json(
        {
          jsonrpc: "2.0",
          error: {
            code: -32700,
            message: "Parse error",
          },
          id: null,
        },
        400
      );
    }

    // Check if SSE response is needed
    const hasProgressToken = body.params?._meta?.progressToken;
    const isToolCall = body.method === "tools/call";
    const acceptsSSE = c.req.header("Accept")?.includes("text/event-stream");

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
        const result = await transport.handleHttpRequest(
          "POST",
          headers,
          body,
          sseStream
        );

        if (result?.body) {
          // Send final response via SSE
          await stream.write(`data: ${JSON.stringify(result.body)}\n\n`);
        }

        await stream.close();
      });
    }

    // Regular JSON response
    const headers: Record<string, string | undefined> = {};
    c.req.raw.headers.forEach((value: string, key: string) => {
      headers[key] = value;
    });

    const result = await transport.handleHttpRequest("POST", headers, body);

    if (result) {
      // Set response headers
      if (result.headers) {
        Object.entries(result.headers).forEach(([key, value]) => {
          if (typeof value === "string") {
            c.header(key, value);
          }
        });
      }
      return result.body
        ? c.json(result.body, result.status || 200)
        : c.body(null, result.status || 200);
    }
  }

  // Fallback to original implementation
  return hub.handleHttpRequest(c.req.raw);
}
