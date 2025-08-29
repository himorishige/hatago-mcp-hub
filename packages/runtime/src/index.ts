/**
 * @hatago/runtime - Runtime components for Hatago MCP Hub
 *
 * This package provides core runtime functionality including:
 * - Platform abstraction layer
 * - Session management
 * - Registry management (tools, resources, prompts)
 * - Message routing
 * - Error recovery and retry logic
 *
 * Dependency direction: core → runtime → transport → cli
 */

// Error recovery system
export * from './error-recovery/index.js';
// Logger implementations
export * from './logger/index.js';
export type { KeyedMutex, Mutex } from './mutex.js';
// Mutex utility (needed by session and other components)
export { createKeyedMutex, createMutex } from './mutex.js';
export type {
  ConfigStore,
  Platform,
  PlatformOptions,
  SessionStore,
  SpawnOptions,
} from './platform/index.js';
// Platform abstraction
export {
  getPlatform,
  isPlatformInitialized,
  resetPlatform,
  setPlatform,
  UnsupportedFeatureError,
} from './platform/index.js';
// Registry system
export * from './registry/index.js';

// Router system
export * from './router/index.js';
// Session management
export * from './session/index.js';
// Tool Invoker
export * from './tool-invoker/index.js';
