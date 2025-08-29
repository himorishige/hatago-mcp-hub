/**
 * Hatago MCP Hub for Cloudflare Workers
 * 
 * This implementation leverages Workers' streaming capabilities
 * to handle long-running MCP operations without the 30-second
 * CPU time limitation (wall-clock time is unlimited for streaming).
 */

import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { streamSSE } from 'hono/streaming';
import type { Env } from './types.js';
import { loadConfig } from './config.js';
import { createHubAdapter } from './hub-adapter.js';

// Export Durable Object class
export { SessionDurableObject } from './session.do.js';

// Main Worker entry point
export default {
  async fetch(
    request: Request,
    env: Env,
    ctx: ExecutionContext
  ): Promise<Response> {
    const app = new Hono<{ Bindings: Env }>();

    // CORS middleware
    app.use(
      '*',
      cors({
        origin: ['http://localhost:*', 'http://127.0.0.1:*', 'https://*'],
        credentials: true,
        allowHeaders: ['Content-Type', 'Accept', 'mcp-session-id'],
      })
    );

    // Health check endpoint
    app.get('/health', (c) => {
      return c.json({
        status: 'ok',
        runtime: 'cloudflare-workers',
        version: c.env.HUB_VERSION || '0.1.0',
      });
    });

    // Load configuration from KV
    app.get('/config', async (c) => {
      try {
        const config = await loadConfig(c.env.CONFIG_KV);
        return c.json(config);
      } catch (error) {
        return c.json({ error: 'Failed to load configuration' }, 500);
      }
    });

    // MCP endpoint with streaming support
    app.post('/mcp', async (c) => {
      const sessionId = c.req.header('mcp-session-id') || crypto.randomUUID();
      const body = await c.req.json();

      // Get or create session using Durable Object
      const doId = c.env.SESSION_DO.idFromName(sessionId);
      const sessionDO = c.env.SESSION_DO.get(doId);

      // Create hub adapter with Workers-specific implementations
      const hub = await createHubAdapter(c.env, sessionDO);

      // Handle JSON-RPC request with streaming support
      const stream = new ReadableStream({
        async start(controller) {
          try {
            // Process the request
            const result = await hub.handleJsonRpcRequest(body, sessionId);
            
            // Write response
            const encoder = new TextEncoder();
            controller.enqueue(encoder.encode(JSON.stringify(result)));
            controller.close();
          } catch (error) {
            controller.error(error);
          }
        },
      });

      return new Response(stream, {
        headers: {
          'Content-Type': 'application/json',
          'mcp-session-id': sessionId,
        },
      });
    });

    // SSE endpoint for progress notifications (unlimited wall-clock time)
    app.get('/events', async (c) => {
      const clientId = c.req.query('clientId') || `client-${Date.now()}`;
      const sessionId = c.req.header('mcp-session-id') || c.req.query('sessionId');

      if (!sessionId) {
        return c.text('Session ID required', 400);
      }

      // Connect to session DO for real-time updates
      const doId = c.env.SESSION_DO.idFromName(sessionId);
      const sessionDO = c.env.SESSION_DO.get(doId);

      return streamSSE(c, async (stream) => {
        // Send initial connection message
        await stream.writeSSE({
          data: JSON.stringify({ type: 'connected', clientId }),
          event: 'connection',
        });

        // Set up event forwarding from Durable Object
        const eventForwarder = await sessionDO.subscribeToEvents(clientId);

        // Keep connection alive with periodic pings
        const keepAliveInterval = setInterval(() => {
          try {
            stream.writeSSE({ comment: 'keepalive' });
          } catch (error) {
            console.error(`SSE keepalive error for ${clientId}:`, error);
            clearInterval(keepAliveInterval);
          }
        }, 30000); // Every 30 seconds

        // Clean up on disconnect
        stream.onAbort(() => {
          console.log(`SSE client disconnected: ${clientId}`);
          clearInterval(keepAliveInterval);
          sessionDO.unsubscribeFromEvents(clientId);
        });

        // Forward events from DO to SSE stream
        eventForwarder.on('progress', (data: any) => {
          stream.writeSSE({
            data: JSON.stringify(data),
            event: 'progress',
          });
        });

        // Keep stream open (unlimited wall-clock time for streaming)
        await new Promise(() => {}); // Never resolves
      });
    });

    // WebSocket endpoint for bidirectional communication (optional)
    app.get('/ws', async (c) => {
      const sessionId = c.req.query('sessionId');
      if (!sessionId) {
        return c.text('Session ID required', 400);
      }

      // Upgrade to WebSocket through Durable Object
      const doId = c.env.SESSION_DO.idFromName(sessionId);
      const sessionDO = c.env.SESSION_DO.get(doId);

      // Forward to DO for WebSocket handling
      return sessionDO.fetch(c.req.raw);
    });

    // Handle the request
    return app.fetch(request, env, ctx);
  },
};