#!/usr/bin/env node
/**
 * Simplified Hatago MCP Hub Example
 * Using @hatago/hub for minimal boilerplate
 */

import { createEventsEndpoint } from '@hatago/hub';
import { createHub, handleMCPEndpoint } from '@hatago/hub/node';
import { serve } from '@hono/node-server';
import { Hono } from 'hono';
import { cors } from 'hono/cors';

async function main() {
  console.log('🏮 Starting Hatago Example Hub...');

  // Create Hatago Hub with config
  const configPath = process.env.HATAGO_CONFIG || './hatago-test.config.json';
  const hub = createHub({ configFile: configPath });

  // Initialize hub
  await hub.start();

  // Create Hono app
  const app = new Hono();

  // Middleware
  app.use(
    '*',
    cors({
      origin: ['http://localhost:*', 'http://127.0.0.1:*'],
      credentials: true,
      allowHeaders: ['Content-Type', 'Accept', 'mcp-session-id'],
    }),
  );

  // Health check
  app.get('/health', (c) =>
    c.json({
      status: 'ok',
      uptime: process.uptime(),
    }),
  );

  // MCP endpoint - use StreamableHTTP handler
  app.all('/mcp', async (c) => {
    return await handleMCPEndpoint(hub, c);
  });

  // SSE endpoint for progress notifications
  app.get('/sse', createEventsEndpoint(hub));

  // Start HTTP server
  const port = Number(process.env.PORT || 8787);
  const hostname = process.env.HOST || '127.0.0.1';

  const server = serve({
    fetch: app.fetch,
    port,
    hostname,
  });

  console.log('');
  console.log('✅ Hatago Example Hub is running!');
  console.log(`🌐 Server: http://${hostname}:${port}`);
  console.log(`🔌 MCP endpoint: http://${hostname}:${port}/mcp`);
  console.log(`📡 SSE endpoint: http://${hostname}:${port}/sse`);
  console.log(`📊 Health check: http://${hostname}:${port}/health`);
  console.log('');
  console.log('Press Ctrl+C to stop the server');

  // Graceful shutdown
  const shutdown = async (signal: string) => {
    console.log(`\n👋 Received ${signal}, shutting down gracefully...`);

    try {
      await hub.stop();
      server.close();
      console.log('✅ Shutdown complete');
      process.exit(0);
    } catch (error) {
      console.error('❌ Error during shutdown:', error);
      process.exit(1);
    }
  };

  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));
}

// Start the server
main().catch((error) => {
  console.error('❌ Failed to start server:', error);
  process.exit(1);
});
