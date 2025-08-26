/**
 * HTTP Application Factory
 * Creates and configures the Hono application for the MCP Hub
 */

import { Hono } from 'hono';
import type { HatagoConfig } from '../../config/types.js';
import type { McpHub } from '../../core/mcp-hub.js';

/**
 * Create the base HTTP application with health and debug endpoints
 */
export function createHttpApp(
  hub: McpHub,
  _config: HatagoConfig, // Reserved for future configuration use
): Hono {
  const app = new Hono();

  // Basic health check endpoint
  app.get('/health', (c) =>
    c.json({
      ok: true,
      name: 'hatago-hub',
      version: '0.0.2',
      timestamp: new Date().toISOString(),
    }),
  );

  // Tools list endpoint
  app.get('/tools', (c) => {
    const tools = hub.getRegistry().getAllTools();
    return c.json({ tools });
  });

  // Debug information endpoint
  app.get('/debug', (c) => {
    const debugInfo = hub.getRegistry().getDebugInfo();
    return c.json(debugInfo);
  });

  // Root page
  app.get('/', (c) =>
    c.html(`<!doctype html>
<meta charset="utf-8"/>
<title>🏮 Hatago MCP Hub</title>
<h1>🏮 Hatago MCP Hub v0.0.2</h1>
<p>MCP endpoint: <code>POST /mcp</code></p>
<p>Tools list: <code>GET /tools</code></p>
<p>Health check: <code>GET /health</code></p>
<p>Readiness check: <code>GET /readyz</code></p>
<p>Debug info: <code>GET /debug</code></p>
<p>Powered by Hono + MCP SDK</p>`),
  );

  return app;
}

/**
 * Setup readiness check with health checks
 */
export async function setupReadinessCheck(
  app: Hono,
  hub: McpHub,
  config: HatagoConfig,
): Promise<void> {
  const {
    HealthCheckManager,
    createConfigCheck,
    createWorkspaceCheck,
    createHatagoDirectoryCheck,
    createMCPServersCheck,
    createSystemResourcesCheck,
  } = await import('../../utils/health.js');

  const healthManager = new HealthCheckManager(undefined);

  // Register health checks
  healthManager.register(createConfigCheck(() => !!config));
  healthManager.register(createWorkspaceCheck(undefined));
  healthManager.register(createHatagoDirectoryCheck());
  healthManager.register(
    createMCPServersCheck(() => {
      // Get connection info from MCP hub
      const connections = Array.from(hub.getConnections().entries());
      return connections.map(([id, conn]) => ({
        id,
        state: conn.connected ? 'running' : 'stopped',
        type: conn.type,
      }));
    }),
  );
  healthManager.register(createSystemResourcesCheck());

  // Readiness endpoint
  app.get('/readyz', async (c) => {
    const status = await healthManager.runAll();
    const httpStatus = status.status === 'ready' ? 200 : 503;
    return c.json(status, httpStatus);
  });
}

/**
 * Get port configuration
 */
export function getPort(config: HatagoConfig, portOption?: string): number {
  return portOption ? parseInt(portOption, 10) : config.http?.port || 3000;
}
