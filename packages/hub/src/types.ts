/**
 * Hub types and interfaces
 */

import type { Prompt, Resource, Tool, HatagoConfig } from '@himorishige/hatago-core';

/**
 * Server specification
 */
export type ServerSpec = {
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
};

/**
 * Hub options
 */
export type HubOptions = {
  configFile?: string;
  /** Preloaded configuration data. Takes precedence over configFile when provided. */
  preloadedConfig?: { path?: string; data: HatagoConfig } | undefined;
  sessionTTL?: number;
  defaultTimeout?: number;
  namingStrategy?: 'none' | 'namespace' | 'prefix';
  separator?: string;
  tags?: string[]; // Filter servers by tags
  /**
   * Enable internal StreamableHTTP transport (HTTP/SSE bridge inside the hub).
   * Disable when running in pure STDIO environments to avoid mixed transports.
   * Default: true
   */
  enableStreamableTransport?: boolean;
};

/**
 * Tool call options
 */
export type CallOptions = {
  timeout?: number;
  /** Session ID for multi-client support */
  sessionId?: string;
  signal?: AbortSignal;
};

/**
 * Resource read options
 */
export type ReadOptions = {
  timeout?: number;
  /** Session ID for multi-client support */
  sessionId?: string;
  signal?: AbortSignal;
};

/**
 * List options
 */
export type ListOptions = {
  serverId?: string;
};

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
  | 'tool:error'
  | 'resource:registered'
  | 'resource:read'
  | 'prompt:registered'
  | 'prompt:got';

/**
 * Hub event data
 */
export type HubEventData = {
  type: HubEvent;
  serverId?: string;
  data?: unknown;
  error?: Error;
  [key: string]: unknown;
};

/**
 * Hub event handler
 */
export type HubEventHandler = (event: HubEventData) => void;

/**
 * Connected server info
 */
export type ConnectedServer = {
  id: string;
  spec: ServerSpec;
  status: 'connecting' | 'connected' | 'disconnected' | 'error';
  error?: Error;
  tools: Tool[];
  resources: Resource[];
  prompts: Prompt[];
};

/**
 * Minimal public Hub interface for external packages (server/test-utils)
 * Keeps compile-time coupling low while preserving safety. [SF][CA]
 */
export type IHub = {
  // lifecycle
  start: () => Promise<IHub>;
  stop: () => Promise<void>;

  // events
  on: (event: HubEvent, handler: (evt: HubEventData) => void) => void;

  // notifications (STDIO bridge)
  onNotification?: (notification: unknown) => Promise<void>;

  // JSON-RPC entry
  handleJsonRpcRequest: (body: unknown, sessionId?: string) => Promise<unknown>;
};
