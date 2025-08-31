#!/usr/bin/env node
/**
 * Minimal Node.js example for Hatago MCP Hub
 *
 * This example demonstrates a simple MCP Hub server with:
 * - MCP protocol endpoint
 * - SSE endpoint for progress notifications
 * - Automatic connection to configured MCP servers
 */

import {
  createHub,
  handleMCPEndpoint,
  createEventsEndpoint
} from '@himorishige/hatago-mcp-hub/node';
import { serve } from '@hono/node-server';
import { Hono } from 'hono';
import { cors } from 'hono/cors';

async function main() {
  console.log('🏮 Starting Hatago Hub (Node.js)...\n');

  // Create hub instance with config
  const configPath = process.env.HATAGO_CONFIG || './hatago.config.json';
  const hub = (createHub as (options: { configFile: string }) => unknown)({
    configFile: configPath
  });

  // Initialize hub (loads config and connects to servers)
  await (hub as { start: () => Promise<void> }).start();

  // Create Hono app
  const app = new Hono();

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
  app.get('/health', (c) =>
    c.json({
      status: 'healthy',
      runtime: 'node',
      uptime: process.uptime()
    })
  );

  // MCP protocol endpoint
  app.all('/mcp', async (c) => {
    return (handleMCPEndpoint as (hub: unknown, c: unknown) => Promise<Response>)(hub, c);
  });

  // SSE endpoint for progress notifications
  app.get('/sse', (createEventsEndpoint as (hub: unknown) => unknown)(hub) as unknown);

  // Start HTTP server
  const port = Number(process.env.PORT || 3000);
  const hostname = process.env.HOST || '127.0.0.1';

  const server = serve({
    fetch: app.fetch,
    port,
    hostname
  });

  console.log('✅ Hatago Hub is running!');
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
      await (hub as { stop: () => Promise<void> }).stop();
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

// Run the example
main().catch((error) => {
  console.error('❌ Failed to start server:', error);
  process.exit(1);
});
