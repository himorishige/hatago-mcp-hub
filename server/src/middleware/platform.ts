/**
 * Hono middleware for Platform injection
 */
import type { MiddlewareHandler } from 'hono';
import { createPlatform } from '../platform/detector.js';
import type { Platform } from '../platform/types.js';

/**
 * Context variables added by the platform middleware
 */
interface PlatformVariables {
  platform: Platform;
}

/**
 * Creates a platform middleware for Hono
 * This middleware detects the runtime and creates the appropriate platform
 */
export function platformMiddleware(platform?: Platform): MiddlewareHandler<{
  Variables: PlatformVariables;
}> {
  // Cache the platform instance
  let cachedPlatform: Platform | undefined = platform;

  return async (c, next) => {
    // Create platform if not already cached
    if (!cachedPlatform) {
      cachedPlatform = await createPlatform();
    }

    // Inject platform into context
    c.set('platform', cachedPlatform);

    // Continue to next middleware
    await next();
  };
}

/**
 * Creates a platform middleware with specific configuration
 */
export function createPlatformMiddleware(options?: {
  platform?: Platform;
  autoDetect?: boolean;
}): MiddlewareHandler<{
  Variables: PlatformVariables;
}> {
  const { platform, autoDetect = true } = options ?? {};

  // If platform is provided, use it directly
  if (platform) {
    return async (c, next) => {
      c.set('platform', platform);
      await next();
    };
  }

  // If auto-detect is disabled, throw error
  if (!autoDetect) {
    throw new Error('Platform must be provided when autoDetect is disabled');
  }

  // Otherwise, auto-detect and create platform
  return platformMiddleware();
}
