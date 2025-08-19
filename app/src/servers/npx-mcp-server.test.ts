import { describe, expect, it, vi } from 'vitest';
import { NpxMcpServer, ServerState } from './npx-mcp-server.js';

describe('NpxMcpServer', () => {
  it('should initialize with stopped state', () => {
    const server = new NpxMcpServer({
      id: 'test-server',
      type: 'npx',
      package: '@example/test',
      start: 'lazy',
    });

    expect(server.getId()).toBe('test-server');
    expect(server.getState()).toBe(ServerState.STOPPED);
  });

  it('should return server configuration', () => {
    const config = {
      id: 'test-server',
      type: 'npx' as const,
      package: '@example/test',
      version: '1.0.0',
      args: ['--debug'],
      start: 'lazy' as const,
    };

    const server = new NpxMcpServer(config);
    const returnedConfig = server.getConfig();

    expect(returnedConfig.id).toBe(config.id);
    expect(returnedConfig.package).toBe(config.package);
    expect(returnedConfig.version).toBe(config.version);
    expect(returnedConfig.args).toEqual(config.args);
  });

  it('should return server statistics', () => {
    const server = new NpxMcpServer({
      id: 'test-server',
      type: 'npx',
      package: '@example/test',
      start: 'lazy',
    });

    const stats = server.getStats();

    expect(stats.id).toBe('test-server');
    expect(stats.state).toBe(ServerState.STOPPED);
    expect(stats.restartCount).toBe(0);
    expect(stats.pid).toBeUndefined();
    expect(stats.uptime).toBeUndefined();
  });

  it('should emit events during lifecycle', async () => {
    const server = new NpxMcpServer({
      id: 'test-server',
      type: 'npx',
      package: '@example/test',
      start: 'lazy',
    });

    const startingHandler = vi.fn();
    const stoppedHandler = vi.fn();

    server.on('starting', startingHandler);
    server.on('stopped', stoppedHandler);

    // Note: Actual process spawning would require mocking spawn
    // This test just verifies event registration
    expect(server.listenerCount('starting')).toBe(1);
    expect(server.listenerCount('stopped')).toBe(1);
  });
});
