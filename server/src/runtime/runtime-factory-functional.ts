/**
 * Functional Runtime Factory
 * Following Hatago principles with pure functions and immutable state
 */

import { ErrorHelpers } from '../utils/errors.js';
import { err, ok, type Result, tryCatchAsync } from '../utils/result.js';
import type { Runtime, RuntimeEnvironment } from './types.js';

/**
 * Runtime detection as pure function
 */
export const detectRuntimeEnvironment = (): RuntimeEnvironment => {
  // Check for Cloudflare Workers
  if (typeof globalThis !== 'undefined' && 'caches' in globalThis) {
    // @ts-expect-error Runtime-specific global
    if (typeof WebSocketPair !== 'undefined') {
      return 'cloudflare-workers';
    }
  }

  // Check for Deno
  // @ts-expect-error Runtime-specific global
  if (typeof Deno !== 'undefined') {
    return 'deno';
  }

  // Check for Bun
  // @ts-expect-error Runtime-specific global
  if (typeof Bun !== 'undefined') {
    return 'bun';
  }

  // Default to Node.js
  return 'node';
};

/**
 * Runtime loader functions map
 */
type RuntimeLoader = () => Promise<Result<Runtime>>;

const runtimeLoaders: Record<RuntimeEnvironment, RuntimeLoader> = {
  'cloudflare-workers': async () => {
    return tryCatchAsync(
      async () => {
        const { CloudflareWorkersRuntime } = await import(
          './cloudflare-workers.js'
        );
        return new CloudflareWorkersRuntime();
      },
      (error) => ErrorHelpers.runtimeLoadFailed('cloudflare-workers', error),
    );
  },

  node: async () => {
    return tryCatchAsync(
      async () => {
        const { NodeRuntime } = await import('./node.js');
        return new NodeRuntime();
      },
      (error) => ErrorHelpers.runtimeLoadFailed('node', error),
    );
  },

  // Deno runtime implementation
  // Target: Q2 2025
  // Status: Waiting for stable Deno MCP SDK
  // Feature flag: HATAGO_ENABLE_DENO_RUNTIME
  deno: async () => {
    // TODO: Implement when Deno MCP SDK is stable
    // Will support Deno.spawn, WebSocket, and Deno KV
    return err(ErrorHelpers.runtimeNotImplemented('Deno'));
  },

  // Bun runtime implementation
  // Target: Q3 2025
  // Status: Waiting for Bun.spawn stability improvements
  // Feature flag: HATAGO_ENABLE_BUN_RUNTIME
  bun: async () => {
    // TODO: Implement when Bun runtime APIs stabilize
    // Will support Bun.spawn, WebSocket, and SQLite
    return err(ErrorHelpers.runtimeNotImplemented('Bun'));
  },
};

/**
 * Create runtime factory with caching
 */
export const createRuntimeFactory = () => {
  // Private state (closure)
  let cachedRuntime: Runtime | null = null;
  let initPromise: Promise<Result<Runtime>> | null = null;

  /**
   * Get or create runtime instance
   */
  const getRuntime = async (): Promise<Result<Runtime>> => {
    // Return cached instance if available
    if (cachedRuntime) {
      return ok(cachedRuntime);
    }

    // Ensure single initialization
    if (!initPromise) {
      initPromise = loadRuntime();
    }

    const result = await initPromise;

    // Cache successful result and clear promise
    if (result.ok) {
      cachedRuntime = result.value;
      initPromise = null; // Clear after successful caching
    }

    return result;
  };

  /**
   * Load runtime based on detected environment
   */
  const loadRuntime = async (): Promise<Result<Runtime>> => {
    const environment = detectRuntimeEnvironment();
    const loader = runtimeLoaders[environment];

    if (!loader) {
      return err(ErrorHelpers.runtimeNotImplemented(environment));
    }

    return loader();
  };

  /**
   * Reset cache (useful for testing)
   */
  const reset = (): void => {
    cachedRuntime = null;
    initPromise = null;
  };

  /**
   * Get current cache state (for debugging)
   */
  const getCacheState = (): { cached: boolean; initializing: boolean } => ({
    cached: cachedRuntime !== null,
    initializing: initPromise !== null && cachedRuntime === null,
  });

  return {
    getRuntime,
    reset,
    getCacheState,
  };
};

/**
 * Default runtime factory instance
 */
export const defaultRuntimeFactory = createRuntimeFactory();

/**
 * Convenience function for getting runtime
 */
export const getRuntime = defaultRuntimeFactory.getRuntime;

/**
 * Reset default factory (for testing)
 */
export const resetRuntime = defaultRuntimeFactory.reset;

/**
 * Create custom runtime factory with override
 */
export const createCustomRuntimeFactory = (
  customLoaders: Partial<Record<RuntimeEnvironment, RuntimeLoader>>,
) => {
  // Merge custom loaders with defaults
  const mergedLoaders = { ...runtimeLoaders, ...customLoaders };

  // Create factory with custom loaders
  let cachedRuntime: Runtime | null = null;
  let initPromise: Promise<Result<Runtime>> | null = null;

  const getRuntime = async (): Promise<Result<Runtime>> => {
    if (cachedRuntime) {
      return ok(cachedRuntime);
    }

    if (!initPromise) {
      const environment = detectRuntimeEnvironment();
      const loader = mergedLoaders[environment];

      if (!loader) {
        initPromise = Promise.resolve(
          err(ErrorHelpers.runtimeNotImplemented(environment)),
        );
      } else {
        initPromise = loader();
      }
    }

    const result = await initPromise;
    if (result.ok) {
      cachedRuntime = result.value;
    }

    return result;
  };

  const reset = (): void => {
    cachedRuntime = null;
    initPromise = null;
  };

  return { getRuntime, reset };
};

/**
 * Runtime capabilities checker
 */
export const checkRuntimeCapabilities = async (
  runtime: Runtime,
): Promise<Result<{ capabilities: string[]; limitations: string[] }>> => {
  return tryCatchAsync(async () => {
    const capabilities: string[] = [];
    const limitations: string[] = [];

    // Check spawn capability
    if (runtime.spawn) {
      capabilities.push('spawn');
    } else {
      limitations.push('spawn');
    }

    // Check WebSocket capability
    if (runtime.createWebSocket) {
      capabilities.push('websocket');
    } else {
      limitations.push('websocket');
    }

    // Check filesystem capability
    if (runtime.readFile && runtime.writeFile) {
      capabilities.push('filesystem');
    } else {
      limitations.push('filesystem');
    }

    // Check crypto capability
    if (runtime.generateId && runtime.hash) {
      capabilities.push('crypto');
    } else {
      limitations.push('crypto');
    }

    return { capabilities, limitations };
  });
};

/**
 * Compose runtime with additional capabilities
 */
export const composeRuntime = (
  base: Runtime,
  extensions: Partial<Runtime>,
): Runtime => {
  return {
    ...base,
    ...extensions,
    // Preserve base runtime's name
    name: base.name,
  };
};
