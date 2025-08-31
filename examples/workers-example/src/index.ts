/**
 * Minimal Cloudflare Workers example for Hatago MCP Hub
 *
 * This example demonstrates a simple MCP Hub server with:
 * - MCP protocol endpoint
 * - SSE endpoint for progress notifications
 * - KV-based configuration storage
 * - Remote MCP server support only (no local processes in Workers)
 */

import {
  createEventsEndpoint,
  createHub,
  handleMCPEndpoint,
  expandConfig,
  validateEnvironmentVariables,
  type GetEnv,
  type ServerSpec
} from '@himorishige/hatago-mcp-hub/workers';
import { Hono } from 'hono';
import { cors } from 'hono/cors';

// Create Hono app with environment bindings
const app = new Hono<{ Bindings: Env }>();

// Enable CORS
app.use(
  '*',
  cors({
    origin: ['http://localhost:*', 'http://127.0.0.1:*'],
    credentials: true,
    allowHeaders: ['Content-Type', 'Accept', 'mcp-session-id']
  })
);

// Health check endpoint
app.get('/health', (c) => {
  return c.json({
    status: 'healthy',
    runtime: 'cloudflare-workers'
  });
});

// Helper function to create Workers-compatible GetEnv
function createWorkersGetEnv(env: Env): GetEnv {
  return (key: string) => {
    // Check direct env bindings
    const value: unknown = Reflect.get(env as object, key);
    if (typeof value === 'string') return value;
    return undefined;
  };
}

// MCP protocol endpoint
app.all('/mcp', async (c) => {
  const hub = createHub();

  // Load and connect servers from KV config
  const rawConfig = await c.env.CONFIG_KV.get('mcp-servers', 'json');
  if (rawConfig && typeof rawConfig === 'object') {
    try {
      // Create Workers-compatible GetEnv function
      const getEnv = createWorkersGetEnv(c.env);

      // Validate required environment variables
      validateEnvironmentVariables(rawConfig, getEnv);

      // Expand environment variables in config
      const config = expandConfig(rawConfig, getEnv) as Record<string, ServerSpec>;

      // Add each server to the hub
      for (const [id, serverSpec] of Object.entries(config)) {
        await hub.addServer(id, serverSpec);
      }
    } catch (error) {
      console.error('Failed to connect servers:', error);
    }
  }

  return handleMCPEndpoint(hub, c);
});

// SSE endpoint for progress notifications
app.get('/sse', (c) => {
  const hub = createHub();
  return createEventsEndpoint(hub)(c);
});

// Export Workers handler with proper types
export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    return app.fetch(request, env, ctx);
  }
} satisfies ExportedHandler<Env>;

// Durable Object for session management
export class SessionDurableObject {
  private sessions: Map<string, unknown> = new Map();

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);
    const sessionId = url.searchParams.get('id');

    if (request.method === 'GET' && sessionId) {
      const session = this.sessions.get(sessionId);
      return new Response(JSON.stringify(session || null), {
        headers: { 'Content-Type': 'application/json' }
      });
    }

    if (request.method === 'POST' && sessionId) {
      const data = await request.json();
      this.sessions.set(sessionId, data);
      return new Response(JSON.stringify({ success: true }), {
        headers: { 'Content-Type': 'application/json' }
      });
    }

    if (request.method === 'DELETE' && sessionId) {
      this.sessions.delete(sessionId);
      return new Response(JSON.stringify({ success: true }), {
        headers: { 'Content-Type': 'application/json' }
      });
    }

    return new Response('Method not allowed', { status: 405 });
  }
}
