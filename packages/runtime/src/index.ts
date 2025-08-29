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

// Platform abstraction
export { 
  setPlatform, 
  getPlatform, 
  isPlatformInitialized,
  resetPlatform,
  UnsupportedFeatureError
} from './platform/index.js';
export type { 
  Platform, 
  PlatformOptions, 
  ConfigStore, 
  SessionStore,
  SpawnOptions 
} from './platform/index.js';

// Session management
export * from './session/index.js';

// Registry system
export * from './registry/index.js';

// Tool Invoker
export * from './tool-invoker/index.js';

// Mutex utility (needed by session and other components)
export { createMutex, createKeyedMutex } from './mutex.js';
export type { Mutex, KeyedMutex } from './mutex.js';

// Router system
export * from './router/index.js';

// Error recovery system
export * from './error-recovery/index.js';