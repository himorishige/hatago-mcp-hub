/**
 * @hatago/hub - User-friendly facade for Hatago MCP Hub
 *
 * This package provides a simplified API for working with MCP servers,
 * tools, and resources.
 */

import { HatagoHub } from './hub.js';
import type { HubOptions, ServerSpec } from './types.js';

/**
 * Create a new Hatago Hub instance
 */
export function createHub(options?: HubOptions): HatagoHub {
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
  },
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
  },
): [string, ServerSpec] {
  return [
    id,
    {
      url,
      type: 'http',
      ...options,
    },
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
  },
): [string, ServerSpec] {
  return [
    id,
    {
      url,
      type: 'sse',
      ...options,
    },
  ];
}

// Export error classes
export {
  ConfigError,
  HatagoError,
  SessionError,
  TimeoutError,
  ToolInvocationError,
  TransportError,
  toHatagoError,
} from './errors.js';
// Export main class and types
export { HatagoHub } from './hub.js';
// Export streamable HTTP helpers
export {
  createEventsEndpoint,
  handleMCPEndpoint,
  handleSSEEndpoint,
} from './hub-streamable.js';
export type {
  CallOptions,
  ConnectedServer,
  HubEvent,
  HubEventHandler,
  HubOptions,
  ListOptions,
  ReadOptions,
  ServerSpec,
} from './types.js';
