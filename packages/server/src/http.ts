/**
 * HTTP Mode Implementation
 *
 * Provides HTTP/SSE endpoints for development and debugging.
 * Based on the proven hono-mcp-hub implementation.
 */

import { createEventsEndpoint } from '@himorishige/hatago-hub';
import { createHub, handleMCPEndpoint } from '@himorishige/hatago-hub/node';
import type { IHub } from '@himorishige/hatago-hub';
import { serve } from '@hono/node-server';
// Intentionally avoid importing concrete server/socket types to keep compatibility
import { Hono } from 'hono';
import { maybeRegisterMetricsEndpoint, registerHubMetrics } from './metrics.js';
import { cors } from 'hono/cors';
import type { Logger } from './logger.js';
import type { HatagoConfig } from '@himorishige/hatago-core';

type HttpOptions = {
  config: { path?: string; data: HatagoConfig };
  host: string;
  port: number;
  logger: Logger;

  tags?: string[];
};

/**
 * Start the MCP server in HTTP mode
 */
export async function startHttp(options: HttpOptions): Promise<void> {
  const { config, host, port, logger, tags } = options;

  // Create hub instance
  // If the config file does not exist, do not pass `configFile`.
  const maybeExists = (config as unknown as { exists?: boolean }).exists;
  const hub = createHub({
    configFile: maybeExists ? config.path : undefined,
    preloadedConfig: { path: config.path, data: config.data },

    tags
  });
  await hub.start();
  // Register metrics via hub events (opt-in)
  // Register metrics via minimal hub interface (no runtime change)
  registerHubMetrics(hub as unknown as Pick<IHub, 'on'>);

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

  // Metrics endpoint (opt-in)
  maybeRegisterMetricsEndpoint(app);

  // MCP protocol endpoint
  app.all('/mcp', async (c) => {
    return handleMCPEndpoint(hub, c);
  });

  // SSE endpoint for progress notifications
  app.get('/sse', createEventsEndpoint(hub));

  // Start HTTP server
  const srv = serve({
    fetch: app.fetch,
    port,
    hostname: host
  });
  // Normalize Hono server: some versions expose `{ server }`, others return the Node server directly
  const server =
    (srv as unknown as { server?: MinimalServer }).server ?? (srv as unknown as MinimalServer);

  logger.info(`Hatago MCP Hub started in HTTP mode`);
  logger.info(`Server: http://${host}:${port}`);
  logger.info(`MCP endpoint: http://${host}:${port}/mcp`);
  logger.info(`SSE endpoint: http://${host}:${port}/sse`);
  logger.info(`Health check: http://${host}:${port}/health`);

  setupGracefulShutdown({ server, hub, logger });
}

/**
 * Graceful shutdown helper for HTTP server
 */
type MinimalSocket = { on: (ev: 'close', fn: () => void) => void; destroy?: () => void };
type MinimalServer = {
  close: (cb: () => void) => void;
  on: (ev: 'connection', fn: (s: MinimalSocket) => void) => void;
};

export function setupGracefulShutdown(args: {
  server: MinimalServer;
  hub: { stop: () => Promise<void> };
  logger: { info: (...a: unknown[]) => void; error: (...a: unknown[]) => void };
  timeoutMs?: number;
}): void {
  const { server, hub, logger, timeoutMs } = args;
  const sockets = new Set<MinimalSocket>();

  server.on('connection', (socket: MinimalSocket) => {
    sockets.add(socket);
    socket.on('close', () => sockets.delete(socket));
  });

  const shutdown = async (signal: string) => {
    const to = Number(timeoutMs ?? process.env.HATAGO_SHUTDOWN_TIMEOUT_MS ?? 5000);
    logger.info(`Received ${signal}, starting graceful shutdown (timeout=${to}ms)...`);

    try {
      const closePromise = new Promise<void>((resolve) => server.close(() => resolve()));
      await hub.stop();
      await Promise.race([closePromise, new Promise<void>((r) => setTimeout(r, to))]);

      if (sockets.size > 0) {
        logger.info(`Forcing close of ${sockets.size} sockets`);
        for (const s of sockets) {
          if (typeof s.destroy === 'function') {
            s.destroy();
          }
        }
      }

      logger.info('Shutdown complete');
      process.exit(0);
    } catch (error) {
      logger.error('Error during shutdown:', error);
      process.exit(1);
    }
  };

  process.on('SIGINT', () => {
    void shutdown('SIGINT');
  });
  process.on('SIGTERM', () => {
    void shutdown('SIGTERM');
  });
}
