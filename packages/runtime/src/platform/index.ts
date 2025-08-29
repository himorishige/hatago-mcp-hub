/**
 * Platform abstraction layer
 * 
 * Provides a unified interface for platform-specific features.
 * Uses dependency injection pattern to avoid runtime detection issues.
 */

import type { Platform, PlatformOptions } from './types.js';

// Global platform instance (injected at startup)
let _platform: Platform | null = null;

/**
 * Set the platform implementation
 * Should be called once at application startup
 */
export function setPlatform(platform: Platform): void {
  if (_platform) {
    console.warn('Platform already initialized. Overwriting...');
  }
  _platform = platform;
}

/**
 * Get the current platform implementation
 * Throws if platform hasn't been initialized
 */
export function getPlatform(): Platform {
  if (!_platform) {
    throw new Error(
      'Platform not initialized. Call setPlatform() with appropriate platform implementation.'
    );
  }
  return _platform;
}

/**
 * Check if platform is initialized
 */
export function isPlatformInitialized(): boolean {
  return _platform !== null;
}

/**
 * Reset platform (mainly for testing)
 */
export function resetPlatform(): void {
  _platform = null;
}

// Re-export types
export type { 
  Platform,
  PlatformOptions,
  ConfigStore,
  SessionStore,
  SpawnOptions
} from './types.js';
export { UnsupportedFeatureError } from './types.js';