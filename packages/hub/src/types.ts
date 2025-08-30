/**
 * Hub types and interfaces
 */

import type { Prompt, Resource, Tool } from '@hatago/core';

/**
 * Server specification
 */
export interface ServerSpec {
  // Local server
  command?: string;
  args?: string[];
  env?: Record<string, string>;
  cwd?: string;

  // Remote server
  url?: string;
  type?: 'http' | 'sse' | 'ws' | 'streamable-http';
  headers?: Record<string, string>;

  // Common options
  timeout?: number; // Request timeout (backwards compatibility)
  connectTimeout?: number; // Connection timeout
  keepAliveTimeout?: number; // Keep-alive timeout
  reconnect?: boolean;
  reconnectDelay?: number;
}

/**
 * Hub options
 */
export interface HubOptions {
  configFile?: string;
  watchConfig?: boolean; // Enable config file watching
  sessionTTL?: number;
  defaultTimeout?: number;
  namingStrategy?: 'none' | 'namespace' | 'prefix';
  separator?: string;
}

/**
 * Tool call options
 */
export interface CallOptions {
  timeout?: number;
  /** Session ID for multi-client support */
  sessionId?: string;
  /** @deprecated Use appropriate server routing instead */
  serverId?: string;
  signal?: AbortSignal;
}

/**
 * Resource read options
 */
export interface ReadOptions {
  timeout?: number;
  /** Session ID for multi-client support */
  sessionId?: string;
  /** @deprecated Use appropriate server routing instead */
  serverId?: string;
  signal?: AbortSignal;
}

/**
 * List options
 */
export interface ListOptions {
  serverId?: string;
}

/**
 * Hub event types
 */
export type HubEvent =
  | 'server:connected'
  | 'server:disconnected'
  | 'server:error'
  | 'server:notification'
  | 'tool:registered'
  | 'tool:called'
  | 'resource:registered'
  | 'resource:read'
  | 'prompt:registered'
  | 'prompt:got';

/**
 * Hub event handler
 */
export type HubEventHandler = (event: any) => void;

/**
 * Connected server info
 */
export interface ConnectedServer {
  id: string;
  spec: ServerSpec;
  status: 'connecting' | 'connected' | 'disconnected' | 'error';
  error?: Error;
  tools: Tool[];
  resources: Resource[];
  prompts: Prompt[];
}
