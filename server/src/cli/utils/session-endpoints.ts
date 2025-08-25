/**
 * Session Management Endpoints
 * Handles MCP session lifecycle and request routing
 */

import { randomUUID } from 'node:crypto';
import type { Hono } from 'hono';
import { HTTPException } from 'hono/http-exception';
import type { McpHub } from '../../core/mcp-hub.js';
import { StreamableHTTPTransport } from '../../hono-mcp/index.js';
import { logger } from '../../observability/minimal-logger.js';

/**
 * Setup MCP session management endpoints
 */
export function setupSessionEndpoints(app: Hono, hub: McpHub): void {
  const sessionManager = hub.getSessionManager();

  // Store transports per session for proper connection management
  const transports = new Map<string, StreamableHTTPTransport>();

  // POST endpoint (JSON-RPC)
  app.post('/mcp', async (c) => {
    try {
      const body = await c.req.json();

      // MCP spec: If server returns Mcp-Session-Id, it's required for subsequent requests
      const clientSessionId = c.req.header('mcp-session-id');

      // Determine if this is an initialization request
      const isInitRequest = body?.method === 'initialize';

      let transport: StreamableHTTPTransport;
      let sessionId = clientSessionId;

      if (isInitRequest) {
        // Create new transport for initialization
        // Use client-provided session ID if available, otherwise generate new one
        sessionId = clientSessionId || randomUUID();
        transport = new StreamableHTTPTransport({
          sessionIdGenerator: () => sessionId!,
          enableJsonResponse: true,
          onsessioninitialized: (sid) => {
            logger.info(`Session initialized: ${sid}`);
          },
        });

        // Connect transport to server
        process.stderr.write('[DEBUG] Connecting new transport to server...\n');
        await hub.getServer().server.connect(transport);
        process.stderr.write('[DEBUG] Transport connected successfully\n');

        // Store transport for this session
        transports.set(sessionId, transport);
      } else if (clientSessionId && transports.has(clientSessionId)) {
        // Use existing transport for this session
        const existingTransport = transports.get(clientSessionId);
        if (!existingTransport) {
          throw new Error(`Transport not found for session ${clientSessionId}`);
        }
        transport = existingTransport;
        process.stderr.write(`[DEBUG] Using existing transport for session: ${clientSessionId}
`);
      } else {
        // No session or session not found
        return c.json(
          {
            jsonrpc: '2.0',
            error: {
              code: -32001,
              message: 'Session not found or not initialized',
            },
            id: null,
          },
          400,
        );
      }

      // Session validation
      let currentSession = null;
      if (sessionId && !isInitRequest) {
        // Get existing session (also updates last access time)
        currentSession = await sessionManager.getSession(sessionId);

        // Create session if it doesn't exist
        if (!currentSession) {
          await sessionManager.createSession(sessionId);
          currentSession = await sessionManager.getSession(sessionId);
        }
      }

      // Handle the request through the transport
      const result = await transport.handleRequest(c, body);

      // If handleRequest returns undefined, response was already sent
      if (!result) {
        return new Response(null, { status: 200 });
      }

      // For initialization requests, ensure session ID is in the response
      if (isInitRequest && sessionId) {
        // Session was already created, just return the response
        return result;
      }

      // For other requests, return the result as-is
      return result;
    } catch (error) {
      // Error handling
      logger.error('MCP request error', { error });

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

      // Clean up transport
      const transport = transports.get(clientSessionId);
      if (transport) {
        try {
          await transport.close();
        } catch (error) {
          logger.warn('Error closing transport', {
            error,
            sessionId: clientSessionId,
          });
        }
        transports.delete(clientSessionId);
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
