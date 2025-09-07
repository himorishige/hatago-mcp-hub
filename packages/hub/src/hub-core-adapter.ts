/**
 * HubCoreAdapter - Adapter to make HubCore compatible with HatagoHub interface
 *
 * This adapter provides a compatibility layer between the thin HubCore
 * implementation and the existing HatagoHub interface, allowing gradual
 * migration without breaking changes.
 */

// import type { Client } from '@modelcontextprotocol/sdk/client/index.js'; // Not used directly
import type { Prompt, Resource, Tool } from '@himorishige/hatago-core';
import type { ToolCallResult } from '@himorishige/hatago-runtime';
import { HubCore } from './hub-core.js';
import type { IHub } from './hub-interface.js';
import type {
  HubOptions,
  ServerSpec,
  CallOptions,
  ReadOptions,
  ListOptions,
  ConnectedServer,
  HubEvent,
  HubEventHandler
} from './types.js';
import { createLogger } from './logger.js';

/**
 * Adapter class that wraps HubCore to provide HatagoHub-compatible interface
 */
export class HubCoreAdapter implements IHub {
  private hubCore: HubCore;
  private _servers: Map<string, ServerSpec> = new Map();
  private _isStarted = false;
  protected logger = createLogger('HubCoreAdapter');

  constructor(_options: HubOptions = {}) {
    // Create HubCore instance
    this.hubCore = new HubCore({
      logger: this.logger
    });
  }

  /**
   * Override addServer to store specs for HubCore
   */
  async addServer(
    id: string,
    spec: ServerSpec,
    _options?: { suppressToolListNotification?: boolean }
  ): Promise<IHub> {
    this._servers.set(id, spec);

    // If already started, reinitialize HubCore
    if (this._isStarted) {
      await this.reinitializeHubCore();
    }

    return this;
  }

  /**
   * Override removeServer
   */
  async removeServer(id: string): Promise<void> {
    this._servers.delete(id);

    // If started, reinitialize HubCore
    if (this._isStarted) {
      await this.reinitializeHubCore();
    }
  }

  /**
   * Override start to initialize HubCore
   */
  start(): Promise<this> {
    if (this._isStarted) {
      return Promise.resolve(this);
    }

    // Convert Map to Record for HubCore
    const servers: Record<string, ServerSpec> = {};
    for (const [id, spec] of this._servers) {
      servers[id] = spec;
    }

    // Initialize HubCore with servers
    this.hubCore.init(servers);
    this._isStarted = true;

    this.logger.info('HubCoreAdapter started', { serverCount: this._servers.size });
    return Promise.resolve(this);
  }

  /**
   * Override stop to close HubCore
   */
  async stop(): Promise<void> {
    if (!this._isStarted) {
      return;
    }

    await this.hubCore.close();
    this._isStarted = false;

    this.logger.info('HubCoreAdapter stopped');
  }

  /**
   * Override handleJsonRpcRequest to use HubCore
   */
  async handleJsonRpcRequest(body: unknown, _sessionId?: string): Promise<unknown> {
    if (!this._isStarted) {
      throw new Error('HubCoreAdapter not started');
    }

    // HubCore expects JSONRPCRequest format
    const request = body as {
      jsonrpc: '2.0';
      id?: string | number | null;
      method: string;
      params?: unknown;
    };

    // Use HubCore to handle the request
    const response = await this.hubCore.handle(request);
    return response;
  }

  /**
   * Override tools property to provide compatibility
   */
  tools = {
    list: (_options?: ListOptions): Tool[] => {
      // HubCore is async, but HatagoHub.tools.list is sync
      // Return empty array for compatibility
      // Real tools should be accessed via handleJsonRpcRequest
      this.logger.warn('Sync tools.list called on HubCoreAdapter - returning empty array');
      return [];
    },

    call: async (name: string, args: unknown, _options?: CallOptions): Promise<ToolCallResult> => {
      // Extract server ID from tool name if prefixed
      let toolName = name;
      let serverId: string | undefined;

      if (name.includes('__')) {
        const parts = name.split('__');
        if (parts.length === 2 && parts[0] && parts[1]) {
          serverId = parts[0];
          toolName = parts[1];
        }
      }

      const request = {
        jsonrpc: '2.0' as const,
        id: Date.now(),
        method: serverId ? `${serverId}__tools/call` : 'tools/call',
        params: {
          name: toolName,
          arguments: args
        }
      };

      const response = await this.hubCore.handle(request);
      if ('error' in response && response.error) {
        throw new Error(response.error.message);
      }

      // Convert MCP response to ToolCallResult format
      const result = response.result as { content?: Array<{ type: string; text?: string }> };
      return {
        content: (result.content ?? []).map((item) => ({
          ...item,
          type: item.type as 'text' | 'image' | 'resource'
        }))
      };
    }
  };

  /**
   * Override resources property to provide compatibility
   */
  resources = {
    list: (_options?: ListOptions): Resource[] => {
      // HubCore is async, but HatagoHub.resources.list is sync
      // Return empty array for compatibility
      this.logger.warn('Sync resources.list called on HubCoreAdapter - returning empty array');
      return [];
    },

    read: async (uri: string, _options?: ReadOptions): Promise<string | unknown> => {
      // Extract server ID from URI if prefixed
      let resourceUri = uri;
      let serverId: string | undefined;

      if (uri.includes('://')) {
        const protocol = uri.split('://')[0];
        if (protocol?.includes('__')) {
          const parts = protocol.split('__');
          serverId = parts[0];
          resourceUri = uri.replace(`${serverId}__`, '');
        }
      }

      const request = {
        jsonrpc: '2.0' as const,
        id: Date.now(),
        method: serverId ? `${serverId}__resources/read` : 'resources/read',
        params: { uri: resourceUri }
      };

      const response = await this.hubCore.handle(request);
      if ('error' in response && response.error) {
        throw new Error(response.error.message);
      }

      const result = response.result as { contents: Array<{ text?: string; data?: unknown }> };
      if (result.contents?.[0]?.text !== undefined) {
        return result.contents[0].text;
      }
      return result.contents?.[0]?.data;
    }
  };

  /**
   * Override prompts property to provide compatibility
   */
  prompts = {
    list: (_options?: ListOptions): Prompt[] => {
      // HubCore is async, but HatagoHub.prompts.list is sync
      // Return empty array for compatibility
      this.logger.warn('Sync prompts.list called on HubCoreAdapter - returning empty array');
      return [];
    },

    get: async (name: string, args?: unknown): Promise<unknown> => {
      // Extract server ID from prompt name if prefixed
      let promptName = name;
      let serverId: string | undefined;

      if (name.includes('__')) {
        const parts = name.split('__');
        if (parts.length === 2 && parts[0] && parts[1]) {
          serverId = parts[0];
          promptName = parts[1];
        }
      }

      const request = {
        jsonrpc: '2.0' as const,
        id: Date.now(),
        method: serverId ? `${serverId}__prompts/get` : 'prompts/get',
        params: {
          name: promptName,
          arguments: args
        }
      };

      const response = await this.hubCore.handle(request);
      if ('error' in response && response.error) {
        throw new Error(response.error.message);
      }
      return response.result;
    }
  };

  /**
   * Override getServers to provide compatibility
   */
  getServers(): ConnectedServer[] {
    // Create a minimal ConnectedServer for each server spec
    const connectedServers: ConnectedServer[] = [];

    for (const [id, spec] of this._servers) {
      connectedServers.push({
        id,
        spec,
        status: this._isStarted ? 'connected' : 'disconnected',
        error: undefined,
        tools: [],
        resources: [],
        prompts: []
      });
    }

    return connectedServers;
  }

  /**
   * Override getServer to provide compatibility
   */
  getServer(id: string): ConnectedServer | undefined {
    const spec = this._servers.get(id);
    if (!spec) {
      return undefined;
    }

    return {
      id,
      spec,
      status: this._isStarted ? 'connected' : 'disconnected',
      error: undefined,
      tools: [],
      resources: [],
      prompts: []
    };
  }

  /**
   * Event handling - simplified for HubCore
   */
  protected eventHandlers = new Map<HubEvent, Set<HubEventHandler>>();

  on(event: HubEvent, handler: HubEventHandler): void {
    if (!this.eventHandlers.has(event)) {
      this.eventHandlers.set(event, new Set());
    }
    this.eventHandlers.get(event)?.add(handler);
  }

  off(event: HubEvent, handler: HubEventHandler): void {
    this.eventHandlers.get(event)?.delete(handler);
  }

  /**
   * Helper to reinitialize HubCore when servers change
   */
  private async reinitializeHubCore(): Promise<void> {
    // Close existing connections
    await this.hubCore.close();

    // Create new HubCore instance
    this.hubCore = new HubCore({
      logger: this.logger
    });

    // Convert Map to Record for HubCore
    const servers: Record<string, ServerSpec> = {};
    for (const [id, spec] of this._servers) {
      servers[id] = spec;
    }

    // Reinitialize with updated servers
    this.hubCore.init(servers);
  }

  /**
   * Methods that are not supported in HubCore adapter
   * These return no-ops or throw meaningful errors
   */

  reloadConfig(): Promise<void> {
    // Config reloading not supported in thin implementation
    this.logger.warn('Config reloading not supported in HubCore adapter');
    return Promise.resolve();
  }

  getToolsetHash(): string {
    // Toolset hashing not supported in thin implementation
    return '';
  }

  getToolsetRevision(): number {
    // Toolset revision not supported in thin implementation
    return 0;
  }
}
