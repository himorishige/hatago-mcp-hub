/**
 * Cloudflare Workers entry point for @hatago/hub
 *
 * This module exports the hub functionality for Workers environment.
 * Platform initialization should be done in the actual worker handler.
 */

import { setPlatform } from '@hatago/runtime';
import { createWorkersPlatform } from '@hatago/runtime/platform/workers';
import { HatagoHub } from './hub.js';
import type { HubOptions } from './types.js';

// Workers-specific createHub that initializes Workers platform
export function createHub(options?: HubOptions): HatagoHub {
  // Initialize Workers platform with minimal config
  // Note: This requires a minimal KV namespace for config storage
  // In simple example, we use memory storage instead
  const minimalEnv = {
    CONFIG_KV: {
      get: async () => null,
      put: async () => {},
      delete: async () => {},
      list: async () => ({ keys: [] }),
    } as any,
  };
  
  setPlatform(createWorkersPlatform(minimalEnv));
  return new HatagoHub(options);
}

// Export hub functionality
export * from './errors.js';
export { HatagoHub } from './hub.js';
// Export hub-streamable for HTTP handling
export {
  createEventsEndpoint,
  handleMCPEndpoint,
  handleSSEEndpoint,
} from './hub-streamable.js';
export * from './types.js';