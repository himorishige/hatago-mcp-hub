/**
 * Thin HTTP handler extracted from hub.ts [SF][CA]
 */
import type { HatagoHub } from '../hub.js';
import type { LogData } from '@himorishige/hatago-core';
import type { Logger } from '../logger.js';
import type { Context } from 'hono';

type HubForHttp = {
  logger: Logger;
  handleJsonRpcRequest: (body: unknown, sessionId?: string) => Promise<unknown>;
  getOrCreateSessionId: (req: { headers: { get: (key: string) => string | null } }) => string;
  sessions: { destroy: (id: string) => Promise<void> };
};

export async function handleHttpRequest(hub: HatagoHub, context: unknown): Promise<Response> {
  const ctx = context as Partial<Context> &
    Partial<{
      req: Request;
      request: Request;
    }>;

  const request = (ctx.req as Request) ?? (ctx.request as Request) ?? (ctx as unknown as Request);
  const method = (request as { method: string }).method;
  const url = new URL((request as { url: string }).url);

  const h = hub as unknown as HubForHttp;
  h.logger.debug('[Hub] HTTP request received', { method, url: url.toString() });

  if (method === 'POST') {
    try {
      const body = await (request as { json: () => Promise<unknown> }).json();
      const sessionId =
        (request as { headers: { get: (key: string) => string | null } }).headers.get(
          'mcp-session-id'
        ) ?? 'default';
      h.logger.debug('[Hub] Request body', body as LogData);
      const result = await h.handleJsonRpcRequest(body, sessionId);
      h.logger.debug('[Hub] Response', result as LogData);

      return new Response(JSON.stringify(result), {
        status: 200,
        headers: {
          'Content-Type': 'application/json',
          'mcp-session-id': h.getOrCreateSessionId(
            request as { headers: { get: (key: string) => string | null } }
          )
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
    const sessionId = (request as { headers: { get: (key: string) => string | null } }).headers.get(
      'mcp-session-id'
    );
    if (sessionId) {
      await h.sessions.destroy(sessionId);
    }
    return new Response(null, { status: 204 });
  }

  return new Response('Method not allowed', { status: 405 });
}
