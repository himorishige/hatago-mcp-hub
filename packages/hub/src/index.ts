/**
 * @himorishige/hatago-hub - Thin, transparent MCP Hub
 *
 * This package provides a minimal, efficient hub for MCP servers,
 * following the Hatago philosophy of "Don't add, remove" and "Don't transform, relay".
 */

import type { EnhancedHubOptions } from './enhanced-hub.js';
import { EnhancedHatagoHub } from './enhanced-hub.js';
import { HatagoHub } from './hub.js';
import { HubCoreAdapter } from './hub-core-adapter.js';
import type { IHub } from './hub-interface.js';
import type { HubOptions, ServerSpec } from './types.js';

/**
 * Create a new Hatago Hub instance
 * If a configFile is provided, creates an EnhancedHatagoHub with management features
 */
export function createHub(options?: HubOptions | EnhancedHubOptions): IHub {
  // Default to HubCore (thin implementation) unless explicitly opting for legacy
  if (!options?.useLegacyHub) {
    // HubCore is now the default
    return new HubCoreAdapter(options);
  }

  // Legacy implementation path
  console.warn(
    '[LEGACY] Using legacy HatagoHub implementation.\n' +
      'The legacy hub includes state management, caching, and other "thick" features.\n' +
      'Consider migrating to the default thin implementation (HubCore) for better performance.\n' +
      'Migration guide: https://github.com/himorishige/hatago-mcp-hub/blob/main/docs/migration-to-thin.md'
  );

  // Use EnhancedHatagoHub when config is provided (file or preloaded)
  const hasEnhanced = Boolean(
    (options as EnhancedHubOptions)?.configFile ?? (options as EnhancedHubOptions)?.preloadedConfig
  );

  if (hasEnhanced) {
    return new EnhancedHatagoHub(options as EnhancedHubOptions);
  }

  return new HatagoHub(options);
}

/**
 * Helper to create a CLI server spec
 */
export function cliServer(
  id: string,
  spec: {
    command: string;
    args?: string[];
    env?: Record<string, string>;
    cwd?: string;
  }
): [string, ServerSpec] {
  return [id, spec];
}

/**
 * Helper to create an HTTP server spec
 */
export function httpServer(
  id: string,
  url: string,
  options?: {
    headers?: Record<string, string>;
    timeout?: number;
  }
): [string, ServerSpec] {
  return [
    id,
    {
      url,
      type: 'http',
      ...options
    }
  ];
}

/**
 * Helper to create an SSE server spec
 */
export function sseServer(
  id: string,
  url: string,
  options?: {
    headers?: Record<string, string>;
    timeout?: number;
  }
): [string, ServerSpec] {
  return [
    id,
    {
      url,
      type: 'sse',
      ...options
    }
  ];
}

// Primary exports - Thin implementation (Hatago philosophy)
export { HubCore } from './hub-core.js';
export { HubCoreAdapter } from './hub-core-adapter.js';
export type { IHub } from './hub-interface.js';

// Error handling
export {
  ConfigError,
  HatagoError,
  SessionError,
  TimeoutError,
  ToolInvocationError,
  TransportError,
  toHatagoError
} from './errors.js';

// Streamable HTTP helpers
export { createEventsEndpoint, handleMCPEndpoint, handleSSEEndpoint } from './hub-streamable.js';

// Types
export type {
  CallOptions,
  ConnectedServer,
  HubEvent,
  HubEventHandler,
  HubOptions,
  ListOptions,
  ReadOptions,
  ServerSpec
} from './types.js';

// Legacy exports - Use @himorishige/hatago-hub/legacy instead
// These are kept for minimal backward compatibility but will be removed
export type { EnhancedHubOptions } from './enhanced-hub.js';
