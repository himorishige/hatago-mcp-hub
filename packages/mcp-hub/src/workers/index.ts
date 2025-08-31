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
  type ServerSpec
} from '@himorishige/hatago-hub/workers';

// Re-export HubConfig as an alias for HubOptions
export type { HubOptions as HubConfig } from '@himorishige/hatago-hub/workers';

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
  ServerInfo,
  ConnectionResult
} from '@himorishige/hatago-core';

// Re-export env utilities for configuration expansion/validation
export {
  expandConfig,
  validateEnvironmentVariables
} from '@himorishige/hatago-core';
export type { GetEnv } from '@himorishige/hatago-core';

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
export function createWorkersApp(_config?: unknown): Hono {
  const app = new Hono();

  // Enable CORS
  app.use(
    '*',
    cors({
      origin: ['http://localhost:*', 'http://127.0.0.1:*', 'https://*.workers.dev'],
      credentials: true
    })
  );

  // Note: createHub, handleMCPEndpoint, and createEventsEndpoint are imported at the top of this file
  // from '@himorishige/hatago-hub/workers' - they should be available here.
  // However, this is a placeholder implementation for Workers environment.

  // Health check only for now - full implementation requires proper hub setup
  app.get('/health', (c) => {
    return c.json({ status: 'ok', service: 'hatago-mcp-hub-workers' });
  });

  // Placeholder endpoints
  app.post('/mcp', (c) => {
    return c.json({ error: 'Workers implementation pending' }, 501);
  });

  app.get('/events', (c) => {
    return c.json({ error: 'Workers implementation pending' }, 501);
  });

  return app;
}

// Re-export Hono for convenience
export { Hono } from 'hono';
export { cors } from 'hono/cors';
