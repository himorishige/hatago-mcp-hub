/**
 * Node.js entry point for @himorishige/hatago-hub
 *
 * Initializes the platform with Node.js-specific implementations
 * before exporting the main hub functionality.
 */

import { setPlatform } from '@himorishige/hatago-runtime';
import { createNodePlatform } from '@himorishige/hatago-runtime/platform/node';

// Initialize Node.js platform
setPlatform(createNodePlatform());

// Export hub functionality
export * from './errors.js';
export { HatagoHub } from './hub.js';
// Export hub-streamable for HTTP handling
export { createEventsEndpoint, handleMCPEndpoint, handleSSEEndpoint } from './hub-streamable.js';
export { createHub } from './index.js';
export * from './types.js';
// Export HubConfig as an alias for HubOptions
export type { HubOptions as HubConfig } from './types.js';
