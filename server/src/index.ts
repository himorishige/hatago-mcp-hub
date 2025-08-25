/**
 * Hatago MCP Hub
 *
 * Main entry point for the new architecture.
 */

// Client layer
export * from './client/index.js';
// Re-export the main hub class as default
// export { HatagoHub as default } from './composition/hub.js';
// Composition layer
// export * from './composition/index.js';
// Legacy exports for backward compatibility during migration
export * from './config/loader.js';
export * from './config/types.js';
export * from './core/mcp-hub.js';
export * from './core/resource-registry.js';
export * from './core/tool-registry.js';

// Transport layer
export * from './transport/index.js';
export * from './transport/stdio.js';
