/**
 * Hatago MCP Hub - Simple Cloudflare Workers Example
 *
 * This is a minimal example of running Hatago MCP Hub on Cloudflare Workers.
 * Features:
 * - ✅ Simple configuration via TypeScript file
 * - ✅ Support for remote MCP servers
 * - ✅ Basic MCP protocol endpoints
 * - ❌ No progress notifications (keeps it simple)
 * - ❌ No session persistence (stateless)
 */

import { createHub, handleMCPEndpoint } from '@himorishige/hatago-mcp-hub/workers';
import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { hatagoConfig } from './hatago.config.js';

// Create Hono app
const app = new Hono();

// Enable CORS for local development
app.use(
  '*',
  cors({
    origin: ['http://localhost:*', 'http://127.0.0.1:*', 'https://*.workers.dev'],
    credentials: true,
    allowHeaders: ['Content-Type', 'Accept', 'mcp-session-id']
  })
);

// Health check endpoint
app.get('/health', (c) => {
  return c.json({
    status: 'healthy',
    runtime: 'cloudflare-workers',
    servers: Object.keys(hatagoConfig.mcpServers),
    endpoints: {
      mcp: '/mcp',
      health: '/health'
    }
  });
});

// Root endpoint - API information
app.get('/', (c) => {
  return c.json({
    name: 'Hatago MCP Hub - Simple Worker',
    version: '0.1.0',
    description: 'Minimal MCP Hub server running on Cloudflare Workers',
    endpoints: {
      '/': 'This information',
      '/health': 'Health check',
      '/mcp': 'MCP protocol endpoint (POST)'
    },
    servers: Object.keys(hatagoConfig.mcpServers)
  });
});

// MCP protocol endpoint
app.all('/mcp', async (c) => {
  try {
    // Create a new hub instance for this request
    const hub = createHub();

    // Add configured servers
    for (const [id, serverConfig] of Object.entries(hatagoConfig.mcpServers)) {
      try {
        // Convert config to hub format
        const spec = {
          url: serverConfig.url,
          type: serverConfig.transport
        };
        await hub.addServer(id, spec);
      } catch (error) {
        console.error(`Failed to add server ${id}:`, error);
        // Continue with other servers even if one fails
      }
    }

    // Handle the MCP request
    return handleMCPEndpoint(hub, c);
  } catch (error) {
    console.error('MCP endpoint error:', error);
    return c.json(
      {
        jsonrpc: '2.0',
        error: {
          code: -32603,
          message: 'Internal error',
          data: error instanceof Error ? error.message : String(error)
        }
      },
      500
    );
  }
});

// Export Workers handler with proper types
export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    return app.fetch(request, env, ctx);
  }
} satisfies ExportedHandler<Env>;
