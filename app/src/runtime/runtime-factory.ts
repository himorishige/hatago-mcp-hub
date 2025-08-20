/**
 * Runtime factory - separated to avoid circular dependencies
 */

import type { Runtime, RuntimeEnvironment } from './types.js';

/**
 * Runtime detection helper
 */
export function detectRuntime(): RuntimeEnvironment {
  // Check for Cloudflare Workers
  if (typeof globalThis !== 'undefined' && 'caches' in globalThis) {
    // @ts-expect-error
    if (typeof WebSocketPair !== 'undefined') {
      return 'cloudflare-workers';
    }
  }

  // Check for Deno
  // @ts-expect-error
  if (typeof Deno !== 'undefined') {
    return 'deno';
  }

  // Check for Bun
  // @ts-expect-error
  if (typeof Bun !== 'undefined') {
    return 'bun';
  }

  // Default to Node.js
  return 'node';
}

/**
 * Cached runtime instance for singleton pattern
 */
let cachedRuntime: Runtime | null = null;
let runtimeInitPromise: Promise<Runtime> | null = null;

/**
 * Get runtime instance (singleton pattern)
 * This ensures only one runtime instance is created per process
 */
export async function getRuntime(): Promise<Runtime> {
  if (cachedRuntime) {
    return cachedRuntime;
  }

  // Ensure only one initialization happens even with concurrent calls
  if (!runtimeInitPromise) {
    runtimeInitPromise = createRuntime();
  }

  cachedRuntime = await runtimeInitPromise;
  return cachedRuntime;
}

/**
 * Create runtime instance based on environment (internal)
 */
async function createRuntime(): Promise<Runtime> {
  const environment = detectRuntime();

  switch (environment) {
    case 'cloudflare-workers': {
      const { CloudflareWorkersRuntime } = await import(
        './cloudflare-workers.js'
      );
      return new CloudflareWorkersRuntime();
    }

    case 'deno':
      // Deno runtime not yet implemented
      throw new Error('Deno runtime is not yet implemented');

    case 'bun':
      // Bun runtime not yet implemented
      throw new Error('Bun runtime is not yet implemented');
    default: {
      const { NodeRuntime } = await import('./node.js');
      return new NodeRuntime();
    }
  }
}

/**
 * Reset runtime cache (for testing)
 */
export function resetRuntimeCache(): void {
  cachedRuntime = null;
  runtimeInitPromise = null;
}
