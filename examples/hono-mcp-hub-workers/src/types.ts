/**
 * Type definitions for Cloudflare Workers environment
 */

import type { KVNamespace, DurableObjectNamespace } from '@cloudflare/workers-types';

/**
 * Environment bindings for the Worker
 */
export interface Env {
  // KV Namespaces
  CONFIG_KV: KVNamespace;
  CACHE_KV: KVNamespace;
  
  // Durable Objects
  SESSION_DO: DurableObjectNamespace;
  
  // Service Bindings (optional)
  CONNECTOR_HTTP?: Fetcher;
  
  // Environment variables
  LOG_LEVEL?: string;
  HUB_VERSION?: string;
}

/**
 * Fetcher interface for Service Bindings
 */
export interface Fetcher {
  fetch(request: Request): Promise<Response>;
}