/**
 * Cloudflare Workers-specific entry point
 *
 * This file serves as the clean entry point for Workers builds,
 * ensuring no Node.js dependencies are imported.
 */

// Re-export types that might be needed
export type { Env } from './index.workers.js';
// Only import the Workers-specific implementation
export { default } from './index.workers.js';
