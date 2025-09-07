/**
 * Minimal interface for Hub implementations
 * This interface defines the essential methods that both HatagoHub and HubCore must implement
 */

import type { Prompt, Resource, Tool } from '@himorishige/hatago-core';
import type { ToolCallResult } from '@himorishige/hatago-runtime';
import type {
  CallOptions,
  ConnectedServer,
  HubEvent,
  HubEventHandler,
  ListOptions,
  ReadOptions,
  ServerSpec
} from './types.js';

/**
 * Minimal hub interface for both thick and thin implementations
 */
export type IHub = {
  // Server management
  addServer(
    id: string,
    spec: ServerSpec,
    options?: { suppressToolListNotification?: boolean }
  ): Promise<IHub>;
  removeServer(id: string): Promise<void>;
  getServers(): ConnectedServer[];
  getServer(id: string): ConnectedServer | undefined;

  // Lifecycle
  start(): Promise<IHub>;
  stop(): Promise<void>;

  // Request handling
  handleJsonRpcRequest(body: unknown, sessionId?: string): Promise<unknown>;

  // Tool operations
  tools: {
    list(options?: ListOptions): Tool[];
    call(name: string, args: unknown, options?: CallOptions): Promise<ToolCallResult>;
  };

  // Resource operations
  resources: {
    list(options?: ListOptions): Resource[];
    read(uri: string, options?: ReadOptions): Promise<string | unknown>;
  };

  // Prompt operations
  prompts: {
    list(options?: ListOptions): Prompt[];
    get(name: string, args?: unknown): Promise<unknown>;
  };

  // Event handling
  on(event: HubEvent, handler: HubEventHandler): void;
  off(event: HubEvent, handler: HubEventHandler): void;

  // Optional management features (thick hub only)
  reloadConfig?(): Promise<void>;
  getToolsetHash?(): string;
  getToolsetRevision?(): number;
};
