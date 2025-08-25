/**
 * Composition Types
 *
 * Type definitions for server composition (mount/import).
 */

import type { Capabilities } from '../protocol/index.js';
import type { IsolationOptions } from '../proxy/index.js';

export interface ServerConfig {
  name: string;
  transport: TransportConfig;
  capabilities?: Capabilities;
  isolation?: IsolationOptions;
  metadata?: Record<string, unknown>;
}

export interface TransportConfig {
  type: 'stdio' | 'http' | 'websocket' | 'sse';
  command?: string[];
  url?: string;
  headers?: Record<string, string>;
  env?: Record<string, string>;
  cwd?: string;
  timeout?: number;
}

export interface MountOptions {
  prefix?: string;
  dynamic?: boolean;
  overwrite?: 'error' | 'warn' | 'silent';
  isolation?: IsolationOptions;
}

export interface ImportOptions {
  prefix?: string;
  static?: boolean;
  overwrite?: 'error' | 'warn' | 'silent';
}

export interface CompositionManifest {
  version: string;
  servers: Record<string, ServerConfig>;
  mounts?: Record<string, MountOptions>;
  imports?: Record<string, ImportOptions>;
  metadata?: Record<string, unknown>;
}

// Composition lifecycle events
export interface CompositionEvents {
  serverMounted: (serverName: string, options: MountOptions) => void;
  serverUnmounted: (serverName: string) => void;
  serverImported: (serverName: string, options: ImportOptions) => void;
  configReloaded: (manifest: CompositionManifest) => void;
  error: (error: Error, context: string) => void;
}
