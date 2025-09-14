/**
 * @himorishige/hatago-hub - User-friendly facade for Hatago MCP Hub
 *
 * This package provides a simplified API for working with MCP servers,
 * tools, and resources.
 */

import type { EnhancedHubOptions } from './enhanced-hub.js';
import { EnhancedHatagoHub } from './enhanced-hub.js';
import { HatagoHub } from './hub.js';
import type { HubOptions, ServerSpec } from './types.js';

/**
 * Create a new Hatago Hub instance
 * If a configFile is provided, creates an EnhancedHatagoHub with management features
 */
export function createHub(options?: HubOptions | EnhancedHubOptions): HatagoHub {
  // Check if config is provided (triggers enhanced features)
  const hasConfig = Boolean(
    (options as EnhancedHubOptions)?.configFile ?? (options as EnhancedHubOptions)?.preloadedConfig
  );
  
  if (hasConfig) {
    // Feature flag: Use basic Hub if enabled
    const useBasicHub = 
      process.env.HATAGO_USE_BASIC_HUB === '1' ||
      process.env.HATAGO_FEATURE_BASIC_ONLY === '1';
    
    if (useBasicHub) {
      // Silently use basic Hub with feature flag
      return new HatagoHub(options);
    }
    
    // Default: still use EnhancedHub (no warning for silent migration)
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

export type { EnhancedHubOptions } from './enhanced-hub.js';
// Export enhanced hub with management features
export { EnhancedHatagoHub } from './enhanced-hub.js';
// Export error classes
export {
  ConfigError,
  HatagoError,
  SessionError,
  TimeoutError,
  ToolInvocationError,
  TransportError,
  toHatagoError
} from './errors.js';
// Export main class and types
export { HatagoHub } from './hub.js';
// Export streamable HTTP helpers
export { createEventsEndpoint, handleMCPEndpoint, handleSSEEndpoint } from './hub-streamable.js';
// SPI for external management package
export * from './api/management-spi.js';
// Phase 4: remove ambient legacy type aliases
export type {
  CallOptions,
  ConnectedServer,
  IHub,
  HubEvent,
  HubEventHandler,
  HubOptions,
  ListOptions,
  ReadOptions,
  ServerSpec
} from './types.js';
