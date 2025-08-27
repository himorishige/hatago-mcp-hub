/**
 * Runtime detection and platform factory
 */
import type { Platform, PlatformConfig } from './types.js';

/**
 * Detects the current runtime environment
 */
export function detectRuntime():
  | 'node'
  | 'workers'
  | 'deno'
  | 'bun'
  | 'unknown' {
  // Check for Cloudflare Workers
  if (typeof globalThis !== 'undefined' && 'CloudflareWorker' in globalThis) {
    return 'workers';
  }

  // Check for Deno
  if (typeof (globalThis as any).Deno !== 'undefined') {
    return 'deno';
  }

  // Check for Bun
  if (typeof (globalThis as any).Bun !== 'undefined') {
    return 'bun';
  }

  // Check for Node.js
  if (typeof process !== 'undefined' && process.versions?.node) {
    return 'node';
  }

  // Check for Workers environment (alternative detection)
  if (
    typeof navigator !== 'undefined' &&
    navigator.userAgent === 'Cloudflare-Workers'
  ) {
    return 'workers';
  }

  return 'unknown';
}

/**
 * Creates a platform instance based on the current runtime
 */
export async function createPlatform(
  config?: PlatformConfig,
): Promise<Platform> {
  const runtime = detectRuntime();

  switch (runtime) {
    case 'node': {
      const { createNodePlatform } = await import('./node/index.js');
      return createNodePlatform(config);
    }

    case 'workers': {
      const { createWorkersPlatform } = await import('./workers/index.js');
      return createWorkersPlatform(config);
    }

    case 'deno': {
      // For now, use Node.js implementation for Deno
      const { createNodePlatform: createDenoPlatform } = await import(
        './node/index.js'
      );
      return createDenoPlatform(config);
    }

    case 'bun': {
      // For now, use Node.js implementation for Bun
      const { createNodePlatform: createBunPlatform } = await import(
        './node/index.js'
      );
      return createBunPlatform(config);
    }

    default:
      throw new Error(`Unsupported runtime: ${runtime}`);
  }
}

/**
 * Check if a specific feature is available in the current runtime
 */
export function isFeatureAvailable(
  feature: 'fileSystem' | 'childProcess' | 'websocket',
): boolean {
  const runtime = detectRuntime();

  switch (runtime) {
    case 'node':
    case 'deno':
    case 'bun':
      return true; // All features available

    case 'workers':
      // Workers only supports websocket
      return feature === 'websocket';

    default:
      return false;
  }
}

/**
 * Get supported MCP server types for the current runtime
 */
export function getSupportedMCPTypes(): ('local' | 'npx' | 'remote')[] {
  const runtime = detectRuntime();

  switch (runtime) {
    case 'node':
    case 'deno':
    case 'bun':
      return ['local', 'npx', 'remote'];

    case 'workers':
      return ['remote']; // Workers only supports remote MCP servers

    default:
      return [];
  }
}
