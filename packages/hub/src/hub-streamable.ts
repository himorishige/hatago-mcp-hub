/**
 * Streamable HTTP handler for HatagoHub
 * Provides SSE-based progress notifications
 */

import type { Context } from 'hono';
import { streamSSE } from 'hono/streaming';
import type { HatagoHub } from './hub.js';
import type { SSEStream } from '@hatago/transport';

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
    }
  };
}

/**
 * Handle SSE endpoint for StreamableHTTP
 */
export async function handleSSEEndpoint(hub: HatagoHub, c: Context) {
  const transport = (hub as any).streamableTransport;
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
 * Handle MCP endpoint with StreamableHTTP support
 */
export async function handleMCPEndpoint(hub: HatagoHub, c: Context) {
  const transport = (hub as any).streamableTransport;
  if (!transport) {
    // Fallback to original implementation
    return hub.handleHttpRequest(c.req.raw);
  }

  const method = c.req.method;
  
  // Handle SSE request
  if (method === 'GET' && c.req.header('Accept')?.includes('text/event-stream')) {
    return handleSSEEndpoint(hub, c);
  }
  
  // Handle POST request with potential SSE response
  if (method === 'POST') {
    // Parse body
    let body;
    try {
      body = await c.req.json();
    } catch {
      return c.json({
        jsonrpc: '2.0',
        error: {
          code: -32700,
          message: 'Parse error'
        },
        id: null
      }, 400);
    }
    
    // Check if SSE response is needed
    const hasProgressToken = body.params?._meta?.progressToken;
    const isToolCall = body.method === 'tools/call';
    const acceptsSSE = c.req.header('Accept')?.includes('text/event-stream');
    
    if ((hasProgressToken || isToolCall) && acceptsSSE) {
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
    
    const result = await transport.handleHttpRequest('POST', headers, body);
    
    if (result) {
      // Set response headers
      if (result.headers) {
        Object.entries(result.headers).forEach(([key, value]) => {
          if (typeof value === 'string') {
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