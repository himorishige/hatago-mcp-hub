/**
 * HTTP Mode Implementation
 *
 * Provides HTTP/SSE endpoints for development and debugging.
 * Based on the proven hono-mcp-hub implementation.
 */

import { createEventsEndpoint } from '@himorishige/hatago-hub';
import { createHub, handleMCPEndpoint } from '@himorishige/hatago-hub/node';
import { serve } from '@hono/node-server';
import { Hono } from 'hono';
import { cors } from 'hono/cors';
import type { Logger } from './logger.js';

interface HttpOptions {
  config: { path?: string };
  host: string;
  port: number;
  logger: Logger;
  watchConfig?: boolean;
}

/**
 * Start the MCP server in HTTP mode
 */
export async function startHttp(options: HttpOptions): Promise<void> {
  const { config, host, port, logger, watchConfig = false } = options;

  // Create hub instance
  const hub = createHub({ configFile: config.path, watchConfig });
  await hub.start();

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
      mode: 'http',
      uptime: process.uptime()
    })
  );

  // MCP protocol endpoint
  app.all('/mcp', async (c) => {
    return handleMCPEndpoint(hub, c);
  });

  // SSE endpoint for progress notifications
  app.get('/sse', createEventsEndpoint(hub));

  // Start HTTP server
  const server = serve({
    fetch: app.fetch,
    port,
    hostname: host
  });

  logger.info(`Hatago MCP Hub started in HTTP mode`);
  logger.info(`Server: http://${host}:${port}`);
  logger.info(`MCP endpoint: http://${host}:${port}/mcp`);
  logger.info(`SSE endpoint: http://${host}:${port}/sse`);
  logger.info(`Health check: http://${host}:${port}/health`);

  // Graceful shutdown
  const shutdown = async (signal: string) => {
    logger.info(`Received ${signal}, shutting down gracefully...`);

    try {
      await hub.stop();
      server.close();
      logger.info('Shutdown complete');
      process.exit(0);
    } catch (error) {
      logger.error('Error during shutdown:', error);
      process.exit(1);
    }
  };

  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));
}
