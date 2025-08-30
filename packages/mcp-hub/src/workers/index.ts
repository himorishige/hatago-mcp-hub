/**
 * Hatago MCP Hub - Cloudflare Workers API
 *
 * Exports for Cloudflare Workers environments.
 */

// Core functionality from hub (Workers-compatible)
export {
  createHub,
  handleMCPEndpoint,
  createEventsEndpoint,
  type HatagoHub,
  type HubConfig,
  type ServerSpec,
} from '@himorishige/hatago-hub/workers';

// Core types (platform-agnostic)
export type {
  // MCP Protocol types
  McpServer,
  ProtocolFeatures,
  NegotiatedProtocol,
  // Tool types
  Tool,
  ToolMetadata,
  ToolNamingConfig,
  ToolNamingStrategy,
  ToolCallResult,
  // Resource types
  Resource,
  ResourceMetadata,
  ResourceTemplate,
  // Prompt types
  Prompt,
  PromptMetadata,
  PromptArgument,
  // Session types
  SessionData,
  SessionOptions,
  // Error types
  ErrorCode,
  HatagoError,
  // Server types
  ServerType,
  ServerStatus,
  ServerInfo,
  ConnectionResult,
} from '@himorishige/hatago-core';

// Workers-specific utilities (if available)
// Note: These may not exist yet
// export {
//   createWorkersHub,
//   type WorkersHubOptions,
//   type WorkersBindings
// } from '@himorishige/hatago-hub/workers';

// Hono utilities for Workers
import { Hono } from 'hono';
import { cors } from 'hono/cors';

/**
 * Create a pre-configured Hono app for Workers
 */
export function createWorkersApp(config?: HubConfig): Hono {
  const app = new Hono();

  // Enable CORS
  app.use(
    '*',
    cors({
      origin: [
        'http://localhost:*',
        'http://127.0.0.1:*',
        'https://*.workers.dev',
      ],
      credentials: true,
    }),
  );

  // Create hub
  const hub = createHub(config);

  // MCP endpoint
  app.post('/mcp', async (c) => {
    const sessionId = c.req.header('mcp-session-id') || 'default';
    const body = await c.req.json();
    return handleMCPEndpoint(hub, body, sessionId);
  });

  // SSE events endpoint
  app.get('/events', (c) => {
    return createEventsEndpoint(hub, c);
  });

  // Health check
  app.get('/health', (c) => {
    return c.json({ status: 'ok', service: 'hatago-mcp-hub' });
  });

  return app;
}

// Re-export Hono for convenience
export { Hono, cors } from 'hono';
