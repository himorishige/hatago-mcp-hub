/**
 * Proxy Tests
 *
 * Basic tests for proxy components.
 */

import { beforeEach, describe, expect, it } from 'vitest';
import { NameResolver, ServerNode } from '../proxy/index.js';

// Mock transport for testing
class MockTransport {
  private connected = false;
  private messageHandlers = new Set<(message: any) => void>();
  private errorHandlers = new Set<(error: Error) => void>();
  private closeHandlers = new Set<() => void>();

  async connect(): Promise<void> {
    this.connected = true;
  }

  async disconnect(): Promise<void> {
    this.connected = false;
    this.closeHandlers.forEach((handler) => handler());
  }

  async send(_message: any): Promise<void> {
    if (!this.connected) {
      throw new Error('Not connected');
    }
    // Mock implementation
  }

  onMessage(handler: (message: any) => void): void {
    this.messageHandlers.add(handler);
  }

  onError(handler: (error: Error) => void): void {
    this.errorHandlers.add(handler);
  }

  onClose(handler: () => void): void {
    this.closeHandlers.add(handler);
  }

  isConnected(): boolean {
    return this.connected;
  }

  triggerError(error: Error): void {
    this.errorHandlers.forEach((handler) => handler(error));
  }
}

describe('NameResolver', () => {
  let resolver: NameResolver;

  beforeEach(() => {
    resolver = new NameResolver();
  });

  it('should register and resolve server names', () => {
    const mockTransport = new MockTransport();
    const server = new ServerNode({
      name: 'test-server',
      transport: mockTransport as any,
      capabilities: {
        tools: [{ name: 'test-tool', description: 'A test tool' }],
      },
    });

    resolver.registerServer(server);

    const resolved = resolver.resolve('test-server.test-tool');

    expect(resolved.serverName).toBe('test-server');
    expect(resolved.toolName).toBe('test-tool');
    expect(resolved.fullName).toBe('test-server.test-tool');
  });

  it('should handle nested tool names', () => {
    const mockTransport = new MockTransport();
    const server = new ServerNode({
      name: 'api-server',
      transport: mockTransport as any,
    });

    resolver.registerServer(server);

    const resolved = resolver.resolve('api-server.users.create');

    expect(resolved.serverName).toBe('api-server');
    expect(resolved.toolName).toBe('users.create');
  });

  it('should throw error for invalid names', () => {
    expect(() => {
      resolver.resolve('invalid-name');
    }).toThrow(/Invalid name format/);
  });

  it('should throw error for unknown servers', () => {
    expect(() => {
      resolver.resolve('unknown-server.tool');
    }).toThrow(/Server unknown-server not found/);
  });

  it('should support aliases', () => {
    const mockTransport = new MockTransport();
    const server = new ServerNode({
      name: 'long-server-name',
      transport: mockTransport as any,
    });

    resolver.registerServer(server);
    resolver.registerAlias('short', 'long-server-name.complex-tool-name');

    const resolved = resolver.resolve('short');

    expect(resolved.serverName).toBe('long-server-name');
    expect(resolved.toolName).toBe('complex-tool-name');
  });

  it('should prevent duplicate server registration', () => {
    const mockTransport1 = new MockTransport();
    const mockTransport2 = new MockTransport();

    const server1 = new ServerNode({
      name: 'duplicate',
      transport: mockTransport1 as any,
    });

    const server2 = new ServerNode({
      name: 'duplicate',
      transport: mockTransport2 as any,
    });

    resolver.registerServer(server1);

    expect(() => {
      resolver.registerServer(server2);
    }).toThrow(/already registered/);
  });

  it('should generate suggestions for typos', () => {
    const mockTransport = new MockTransport();
    const server = new ServerNode({
      name: 'weather-server',
      transport: mockTransport as any,
      capabilities: {
        tools: [{ name: 'get-forecast', description: 'Get weather forecast' }],
      },
    });

    resolver.registerServer(server);

    const suggestions = resolver.getSuggestions('weather-server.get-forcast'); // typo

    expect(suggestions).toContain('weather-server.get-forecast');
  });
});

describe('ServerNode', () => {
  it('should track connection state', async () => {
    const mockTransport = new MockTransport();
    const server = new ServerNode({
      name: 'test-server',
      transport: mockTransport as any,
    });

    expect(server.state).toBe('disconnected');
    expect(server.isConnected).toBe(false);

    await server.connect();

    expect(server.state).toBe('connected');
    expect(server.isConnected).toBe(true);

    await server.disconnect();

    expect(server.state).toBe('disconnected');
    expect(server.isConnected).toBe(false);
  });

  it('should handle transport errors', async () => {
    const mockTransport = new MockTransport();
    const server = new ServerNode({
      name: 'test-server',
      transport: mockTransport as any,
    });

    await server.connect();
    expect(server.state).toBe('connected');

    // Simulate transport error
    mockTransport.triggerError(new Error('Network failure'));

    expect(server.state).toBe('failed');
    expect(server.lastError?.message).toBe('Network failure');
  });

  it('should enforce concurrent call limits', async () => {
    const mockTransport = new MockTransport();
    const server = new ServerNode({
      name: 'test-server',
      transport: mockTransport as any,
      isolation: {
        maxConcurrent: 1,
      },
    });

    await server.connect();

    // This should succeed
    const promise1 = server.call('test-method');

    // This should fail due to concurrency limit
    await expect(server.call('test-method')).rejects.toThrow(
      /maximum concurrent calls/,
    );

    // Wait for first call to complete
    await promise1;
  });

  it('should provide server info', () => {
    const mockTransport = new MockTransport();
    const capabilities = {
      tools: [{ name: 'test-tool', description: 'Test tool' }],
      version: '1.0.0',
    };

    const server = new ServerNode({
      name: 'info-server',
      transport: mockTransport as any,
      capabilities,
      metadata: { custom: 'data' },
    });

    const info = server.getServerInfo();

    expect(info.name).toBe('info-server');
    expect(info.capabilities).toEqual(capabilities);
    expect(info.metadata).toEqual({ custom: 'data' });
  });
});
