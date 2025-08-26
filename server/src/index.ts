/**
 * Hatago MCP Hub
 *
 * Lightweight MCP Hub with essential features only.
 * Focused on performance, simplicity, and reliability.
 */

// Configuration
export * from './config/loader.js';
export * from './config/types.js';
export * from './core/error-recovery.js';
export { retryWithBackoff } from './core/error-recovery.js';
// Core functionality
export * from './core/mcp-hub.js';
export * from './core/resource-registry.js';
export * from './core/session-manager.js';
export * from './core/tool-registry.js';
export * from './observability/minimal-logger.js';
// Minimal security and observability
export * from './security/minimal-security.js';
// Server management
export {
  NpxMcpServer,
  ServerState as NpxServerState,
} from './servers/npx-mcp-server.js';
export * from './servers/remote-mcp-server.js';
export type { ServerState } from './storage/types.js';
export * from './transport/connection-manager.js';
// Transport layer
export * from './transport/index.js';
export * from './transport/stdio.js';
// Utilities
export {
  createErrorFromUnknown,
  ErrorCode,
  ErrorHelpers,
  HatagoError,
  isErrorCode,
} from './utils/errors.js';
export * from './utils/result.js';

/**
 * Version information
 */
export const VERSION = '0.3.0-lite';
export const FEATURES = {
  core: true,
  security: 'minimal',
  observability: 'minimal',
  errorRecovery: true,
  connectionManagement: true,
  enterprise: false,
} as const;
