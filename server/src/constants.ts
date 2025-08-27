/**
 * Centralized constants for Hatago MCP Hub
 *
 * This file contains all shared constants used throughout the application
 * to ensure consistency and make updates easier.
 */

/**
 * Application version
 * Update this when releasing new versions
 */
export const APP_VERSION = '0.0.1';

/**
 * Application name used in various contexts
 */
export const APP_NAME = 'hatago-mcp-hub';

/**
 * MCP Protocol version
 * This should match the MCP SDK version we're compatible with
 */
export const MCP_PROTOCOL_VERSION = '2024-11-05';

/**
 * Default timeouts (in milliseconds)
 */
export const TIMEOUTS = {
  INIT: 30000, // Initialization timeout for MCP connections
  REQUEST: 60000, // Default request timeout
  SHUTDOWN: 10000, // Graceful shutdown timeout
} as const;

/**
 * Default server configuration
 */
export const DEFAULT_SERVER_CONFIG = {
  PORT: 3000,
  HOST: 'localhost',
} as const;

/**
 * Feature flags indicate the current capabilities of this Hatago build
 * These can be used by consumers to check what features are available
 *
 * Usage example:
 * ```typescript
 * import { FEATURES } from '@himorishige/hatago';
 *
 * if (FEATURES.security === 'minimal') {
 *   // Use basic security features
 * } else if (FEATURES.security === 'full') {
 *   // Use advanced security features like JWT auth
 * }
 * ```
 */
export const FEATURES = {
  core: true, // Core MCP hub functionality is always enabled
  security: 'minimal', // 'minimal' | 'full' - Current security level
  observability: 'minimal', // 'minimal' | 'full' - Logging and monitoring level
  errorRecovery: true, // Automatic error recovery and retry logic
  connectionManagement: true, // Connection pooling and lifecycle management
  enterprise: false, // Enterprise features (auth, metrics, tracing) not included
} as const;
