/**
 * Hub types and interfaces
 */

import type { Tool, Resource, Prompt } from '@hatago/core';

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
  timeout?: number;
  reconnect?: boolean;
  reconnectDelay?: number;
}

/**
 * Hub options
 */
export interface HubOptions {
  configFile?: string;
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
  serverId?: string;
  signal?: AbortSignal;
}

/**
 * Resource read options
 */
export interface ReadOptions {
  timeout?: number;
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