/**
 * Minimal logger for runtime package
 */

import { getPlatform, isPlatformInitialized } from '../platform/index.js';

export type Logger = {
  debug: (message: string, ...args: unknown[]) => void;
  info: (message: string, ...args: unknown[]) => void;
  warn: (message: string, ...args: unknown[]) => void;
  error: (message: string, ...args: unknown[]) => void;
};

/**
 * Check if debug mode is enabled
 */
function isDebugEnabled(): boolean {
  // Try platform first, fallback to direct check for backward compatibility
  if (isPlatformInitialized()) {
    const platform = getPlatform();
    return platform.getEnv('DEBUG') === 'true' || platform.getEnv('DEBUG') === '*';
  }
  // Fallback for environments where platform isn't initialized yet
  return (
    (typeof process !== 'undefined' &&
      (process.env?.DEBUG === 'true' || process.env?.DEBUG === '*')) ||
    (typeof globalThis !== 'undefined' && Boolean((globalThis as Record<string, unknown>).DEBUG))
  );
}

/**
 * Default console logger
 * All output goes to stderr to keep stdout clean for STDIO protocol
 */
export const logger: Logger = {
  debug: (message: string, ...args: unknown[]) => {
    if (isDebugEnabled()) {
      console.error(`[DEBUG] ${message}`, ...args);
    }
  },
  info: (message: string, ...args: unknown[]) => {
    console.error(`[INFO] ${message}`, ...args);
  },
  warn: (message: string, ...args: unknown[]) => {
    console.error(`[WARN] ${message}`, ...args);
  },
  error: (message: string, ...args: unknown[]) => {
    console.error(`[ERROR] ${message}`, ...args);
  }
};
