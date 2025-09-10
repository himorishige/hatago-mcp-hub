/**
 * Thin HTTP handler extracted from hub.ts [SF][CA]
 */
import type { HatagoHub } from '../hub.js';
import type { Context } from 'hono';

// No internal hub casting; rely on public HatagoHub methods only.

function resolveRequest(context: unknown): Request {
  if (typeof Request !== 'undefined' && context instanceof Request) return context;
  if (typeof context === 'object' && context !== null) {
    const obj = context as Partial<Context> & { req?: Request; request?: Request };
    if (obj.req instanceof Request) return obj.req;
    if (obj.request instanceof Request) return obj.request;
  }
  throw new Error('Invalid HTTP context: Request not found');
}

export async function handleHttpRequest(hub: HatagoHub, context: unknown): Promise<Response> {
  const request = resolveRequest(context);
  const method = request.method;
  // For routing/diagnostics if needed in future
  // const url = new URL(request.url);

  // Debug logging intentionally omitted in HTTP handler to avoid stdout noise in STDIO mode.

  if (method === 'POST') {
    try {
      const body = await request.json();
      const sessionId = request.headers.get('mcp-session-id') ?? 'default';
      const result = await hub.handleJsonRpcRequest(body, sessionId);

      return new Response(JSON.stringify(result), {
        status: 200,
        headers: {
          'Content-Type': 'application/json',
          'mcp-session-id': hub.getOrCreateSessionId(request)
        }
      });
    } catch (error) {
      return new Response(
        JSON.stringify({
          jsonrpc: '2.0',
          error: {
            code: -32603,
            message: 'Internal error',
            data: error instanceof Error ? error.message : String(error)
          },
          id: null
        }),
        { status: 500, headers: { 'Content-Type': 'application/json' } }
      );
    }
  } else if (method === 'DELETE') {
    // Session termination
    const sessionId = request.headers.get('mcp-session-id');
    if (sessionId) {
      await hub.destroySession(sessionId);
    }
    return new Response(null, { status: 204 });
  }

  return new Response('Method not allowed', { status: 405 });
}
