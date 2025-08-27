/**
 * Example Hono application with Platform support
 * This demonstrates how to use the Platform abstraction in a Hono app
 */
import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { logger as honoLogger } from 'hono/logger';
import type { HatagoConfig } from './config/types.js';
import { McpHub } from './core/mcp-hub.js';
import { StreamableHTTPTransport } from './hono-mcp/index.js';
import { createPlatformMiddleware } from './middleware/platform.js';
import type { Platform } from './platform/types.js';

/**
 * Type definition for app context
 */
type AppContext = {
  Variables: {
    platform: Platform;
    mcpHub?: McpHub;
  };
};

/**
 * Creates a Hono application with Platform support
 */
export function createApp(config: HatagoConfig, platform?: Platform) {
  const app = new Hono<AppContext>();

  // Apply middleware
  app.use('*', cors());
  app.use('*', honoLogger());

  // Apply platform middleware
  app.use('*', createPlatformMiddleware({ platform }));

  // Initialize MCP Hub with platform
  app.use('*', async (c, next) => {
    if (!c.var.mcpHub) {
      const platform = c.var.platform;
      const hub = new McpHub({
        config,
        platform,
      });

      await hub.initialize();
      c.set('mcpHub', hub);

      // Log platform info
      const logger = platform.logger;
      logger.info(`Running on ${platform.capabilities.name} runtime`);
      logger.info(
        `Supported MCP types: ${platform.capabilities.supportedMCPTypes.join(', ')}`,
      );
    }

    await next();
  });

  // Health check endpoint
  app.get('/health', (c) => {
    const platform = c.var.platform;

    return c.json({
      status: 'healthy',
      runtime: platform.capabilities.name,
      capabilities: platform.capabilities,
      timestamp: new Date().toISOString(),
    });
  });

  // MCP endpoint
  app.post('/mcp', async (c) => {
    const hub = c.var.mcpHub;
    const _platform = c.var.platform;

    if (!hub) {
      return c.json({ error: 'MCP Hub not initialized' }, 500);
    }

    // Create transport for this request
    const transport = new StreamableHTTPTransport(c);

    // Serve MCP request
    await hub.serve(transport);

    // Response is handled by transport
    return c.body(null, 200);
  });

  // Platform info endpoint
  app.get('/platform', (c) => {
    const platform = c.var.platform;

    return c.json({
      runtime: platform.capabilities.name,
      features: {
        fileSystem: platform.capabilities.fileSystem,
        childProcess: platform.capabilities.childProcess,
        tcpSocket: platform.capabilities.tcpSocket,
        websocket: platform.capabilities.websocket,
      },
      supportedMCPTypes: platform.capabilities.supportedMCPTypes,
    });
  });

  // Storage test endpoint (for demonstration)
  app.get('/storage-test', async (c) => {
    const platform = c.var.platform;
    const key = 'test-key';
    const value = new TextEncoder().encode(
      `Hello from ${platform.capabilities.name}`,
    );

    // Store value
    await platform.storage.put(key, value, { ttlSeconds: 60 });

    // Retrieve value
    const stored = await platform.storage.get(key);

    return c.json({
      stored: stored ? new TextDecoder().decode(stored) : null,
      runtime: platform.capabilities.name,
    });
  });

  return app;
}

/**
 * Export for different runtime environments
 */

// For Node.js
export async function createNodeApp(config: HatagoConfig) {
  const { createNodePlatform } = await import('./platform/node/index.js');
  const platform = await createNodePlatform();
  return createApp(config, platform);
}

// For Cloudflare Workers
export async function createWorkersApp(
  config: HatagoConfig,
  env?: { KV?: KVNamespace },
) {
  const { createWorkersPlatform } = await import('./platform/workers/index.js');
  const platform = await createWorkersPlatform({ kv: env?.KV });
  return createApp(config, platform);
}

// Auto-detect runtime
export async function createAutoApp(config: HatagoConfig) {
  return createApp(config); // Platform will be auto-detected
}
