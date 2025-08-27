/**
 * Platform abstraction layer
 *
 * This module provides a unified interface for different runtime environments.
 */

// Export runtime detector
export {
  createPlatform,
  detectRuntime,
  getSupportedMCPTypes,
  isFeatureAvailable,
} from './detector.js';
// Export Node.js implementation (conditional)
export * as node from './node/index.js';
// Export types
export * from './types.js';

// Note: Workers implementation will be added in Phase 3
// export * as workers from './workers/index.js';
