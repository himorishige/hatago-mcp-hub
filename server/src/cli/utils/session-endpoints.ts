/**
 * Session Management Endpoints
 * Handles MCP session lifecycle and request routing
 */

import type { Hono } from 'hono';
import { HTTPException } from 'hono/http-exception';
import type { Logger } from 'pino';
import type { McpHub } from '../../core/mcp-hub.js';
import { StreamableHTTPTransport } from '../../hono-mcp/index.js';

/**
 * Setup MCP session management endpoints
 */
export function setupSessionEndpoints(
  app: Hono,
  hub: McpHub,
  logger: Logger,
): void {
  const sessionManager = hub.getSessionManager();

  // POST endpoint (JSON-RPC)
  app.post('/mcp', async (c) => {
    // Create new transport for each request (stateless)
    const transport = new StreamableHTTPTransport({
      sessionIdGenerator: undefined, // Stateless mode
      enableJsonResponse: true, // Enable JSON response
    });

    try {
      // Temporarily connect to server
      process.stderr.write('[DEBUG] Connecting transport to server...\n');
      await hub.getServer().server.connect(transport);
      process.stderr.write('[DEBUG] Transport connected successfully\n');

      const body = await c.req.json();

      // MCP spec: If server returns Mcp-Session-Id, it's required for subsequent requests
      const clientSessionId = c.req.header('mcp-session-id');

      // Session validation
      let currentSession = null;
      if (clientSessionId) {
        // Get existing session (also updates last access time)
        currentSession = await sessionManager.getSession(clientSessionId);

        // Return error if session not found
        if (!currentSession) {
          return c.json(
            {
              jsonrpc: '2.0',
              error: {
                code: -32001,
                message: 'Session not found',
              },
              id: null,
            },
            404,
          );
        }
      }

      const result = await transport.handleRequest(c, body);

      // If handleRequest returns undefined, response was already sent
      if (!result) {
        return new Response(null, { status: 200 });
      }

      // Add MCP-Protocol-Version header
      const headers = new Headers(result.headers);
      headers.set('MCP-Protocol-Version', '2024-11-05');

      // Check for Mcp-Session-Id header in response
      if (result?.headers) {
        const serverSessionId = result.headers.get('mcp-session-id');
        if (serverSessionId && !currentSession) {
          // Create new session (using central SessionManager)
          await sessionManager.createSession(serverSessionId);
          headers.set('Mcp-Session-Id', serverSessionId);
          logger.info(`New session created: ${serverSessionId}`);
        } else if (serverSessionId && currentSession) {
          // Confirm existing session
          headers.set('Mcp-Session-Id', currentSession.id);
        }
      }

      // Rebuild response with new headers
      return new Response(result.body, {
        status: result.status,
        statusText: result.statusText,
        headers,
      });
    } catch (error) {
      // Error handling
      logger.error({ error }, 'MCP request error');

      // Return HTTPException as-is
      if (error instanceof HTTPException) {
        const response = error.getResponse();
        return response;
      }

      return c.json(
        {
          jsonrpc: '2.0',
          error: {
            code: -32603,
            message: 'Internal error',
            data: error instanceof Error ? error.message : String(error),
          },
          id: null,
        },
        500,
      );
    } finally {
      // Cleanup
      try {
        await transport.close();
      } catch {
        // Ignore close errors
      }
    }
  });

  // DELETE endpoint (session termination)
  app.delete('/mcp', async (c) => {
    const clientSessionId = c.req.header('mcp-session-id');

    if (clientSessionId) {
      // Get and delete session (using central SessionManager)
      const session = await sessionManager.getSession(clientSessionId);

      if (!session) {
        return c.json(
          {
            jsonrpc: '2.0',
            error: {
              code: -32001,
              message: 'Session not found',
            },
            id: null,
          },
          404,
        );
      }

      // Delete session
      await sessionManager.deleteSession(clientSessionId);
      logger.info(`Session ${clientSessionId} terminated`);
    }

    // 200 OK with empty body
    return c.body(null, 200);
  });

  // GET endpoint (SSE - not supported in stateless mode)
  app.get('/mcp', async (c) => {
    return c.json(
      {
        jsonrpc: '2.0',
        error: {
          code: -32000,
          message: 'SSE not supported in stateless mode',
        },
        id: null,
      },
      405, // Method Not Allowed
    );
  });
}
