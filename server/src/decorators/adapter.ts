/**
 * Decorator Adapter
 *
 * Adapts decorator-based MCP servers to work with the MCP Hub.
 */

import { EventEmitter } from 'node:events';
import type { ServerNode, Transport } from '../core/types.js';
import type { DecoratedMCPServer } from './server-factory.js';
import { ServerFactory } from './server-factory.js';

export interface DecoratorTransportOptions {
  server: DecoratedMCPServer | (new (...args: any[]) => any);
  constructorArgs?: any[];
}

export class DecoratorTransport extends EventEmitter implements Transport {
  private server: DecoratedMCPServer;

  constructor(options: DecoratorTransportOptions) {
    super();

    if (typeof options.server === 'function') {
      this.server = ServerFactory.create(
        options.server,
        ...(options.constructorArgs || []),
      );
    } else {
      this.server = options.server;
    }
  }

  async connect(): Promise<void> {
    this.emit('connected');
  }

  async disconnect(): Promise<void> {
    this.emit('disconnected');
  }

  async send<T = any>(method: string, params?: any): Promise<T> {
    const _request = { method, params: params || {} };

    switch (method) {
      case 'initialize':
        return {
          protocolVersion: '2024-11-05',
          capabilities: this.server.capabilities,
          serverInfo: {
            name: this.server.name,
            version: this.server.version,
            description: this.server.description,
          },
        } as T;

      case 'tools/list':
        return { tools: this.server.tools } as T;

      case 'tools/call':
        return (await this.server.callTool({ method, params })) as T;

      case 'resources/list':
        return { resources: this.server.resources } as T;

      case 'resources/read':
        return (await this.server.readResource({ method, params })) as T;

      case 'prompts/list':
        return { prompts: this.server.prompts } as T;

      case 'prompts/get':
        return (await this.server.getPrompt({ method, params })) as T;

      default:
        throw new Error(`Unknown method: ${method}`);
    }
  }

  isConnected(): boolean {
    return true; // Decorator servers are always "connected"
  }
}

export class DecoratorServerNode implements ServerNode {
  public readonly id: string;
  public readonly type = 'decorator' as const;
  public readonly transport: DecoratorTransport;
  private server: DecoratedMCPServer;

  constructor(id: string, options: DecoratorTransportOptions) {
    this.id = id;
    this.transport = new DecoratorTransport(options);
    this.server = (this.transport as any).server;
  }

  async getCapabilities() {
    return this.server.capabilities;
  }

  async getServerInfo() {
    return {
      name: this.server.name,
      version: this.server.version,
      description: this.server.description,
    };
  }

  async listTools() {
    return this.server.tools;
  }

  async listResources() {
    return this.server.resources;
  }

  async listPrompts() {
    return this.server.prompts;
  }

  async callTool(name: string, args: any) {
    return this.transport.send('tools/call', { name, arguments: args });
  }

  async readResource(uri: string) {
    return this.transport.send('resources/read', { uri });
  }

  async getPrompt(name: string, args: any) {
    return this.transport.send('prompts/get', { name, arguments: args });
  }

  getStats() {
    return {
      type: this.type,
      connected: this.transport.isConnected(),
      tools: this.server.tools.length,
      resources: this.server.resources.length,
      prompts: this.server.prompts.length,
    };
  }
}
