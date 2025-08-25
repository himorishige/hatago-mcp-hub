/**
 * Composition Tests
 *
 * Basic tests for composition components.
 */

import { beforeEach, describe, expect, it } from 'vitest';
import { HatagoHub } from '../composition/index.js';

describe('HatagoHub', () => {
  let hub: HatagoHub;

  beforeEach(async () => {
    hub = new HatagoHub({ name: 'test-hub' });
    await hub.initialize();
  });

  it('should initialize correctly', () => {
    expect(hub.name).toBe('test-hub');
    expect(hub.isInitialized).toBe(true);
    expect(hub.serverCount).toBe(0);
  });

  it('should import servers statically', async () => {
    const serverConfig = {
      name: 'static-server',
      transport: {
        type: 'stdio' as const,
        command: ['echo', 'test'],
      },
    };

    await hub.import_server(serverConfig);

    expect(hub.serverCount).toBe(1);

    const servers = hub.listServers();
    expect(servers).toHaveLength(1);
    expect(servers[0].name).toBe('static-server');
    expect(servers[0].type).toBe('imported');
  });

  it('should mount servers dynamically', async () => {
    const serverConfig = {
      name: 'dynamic-server',
      transport: {
        type: 'websocket' as const,
        url: 'ws://localhost:8080',
      },
    };

    await hub.mount(serverConfig);

    expect(hub.serverCount).toBe(1);

    const servers = hub.listServers();
    expect(servers).toHaveLength(1);
    expect(servers[0].name).toBe('dynamic-server');
    expect(servers[0].type).toBe('mounted');
  });

  it('should handle server name prefixes', async () => {
    const serverConfig = {
      name: 'base-server',
      transport: {
        type: 'stdio' as const,
        command: ['echo'],
      },
    };

    await hub.mount(serverConfig, { prefix: 'api' });

    const servers = hub.listServers();
    expect(servers[0].name).toBe('api.base-server');
  });

  it('should prevent duplicate server names', async () => {
    const serverConfig = {
      name: 'duplicate-server',
      transport: {
        type: 'stdio' as const,
        command: ['echo'],
      },
    };

    await hub.import_server(serverConfig);

    // Second server with same name should fail
    await expect(hub.import_server(serverConfig)).rejects.toThrow(
      /already exists/,
    );
  });

  it('should handle name conflicts with overwrite options', async () => {
    const serverConfig1 = {
      name: 'conflict-server',
      transport: {
        type: 'stdio' as const,
        command: ['echo', '1'],
      },
    };

    const serverConfig2 = {
      name: 'conflict-server',
      transport: {
        type: 'stdio' as const,
        command: ['echo', '2'],
      },
    };

    await hub.mount(serverConfig1);

    // Should silently overwrite
    await hub.mount(serverConfig2, { overwrite: 'silent' });

    expect(hub.serverCount).toBe(1);
  });

  it('should enforce server limits', async () => {
    const limitedHub = new HatagoHub({ maxServers: 1 });
    await limitedHub.initialize();

    const serverConfig1 = {
      name: 'server1',
      transport: { type: 'stdio' as const, command: ['echo'] },
    };

    const serverConfig2 = {
      name: 'server2',
      transport: { type: 'stdio' as const, command: ['echo'] },
    };

    await limitedHub.mount(serverConfig1);

    await expect(limitedHub.mount(serverConfig2)).rejects.toThrow(
      /maximum server count/,
    );
  });

  it('should unmount dynamic servers', async () => {
    const serverConfig = {
      name: 'temp-server',
      transport: {
        type: 'stdio' as const,
        command: ['echo'],
      },
    };

    await hub.mount(serverConfig);
    expect(hub.serverCount).toBe(1);

    const unmounted = await hub.unmount('temp-server');
    expect(unmounted).toBe(true);
    expect(hub.serverCount).toBe(0);

    // Unmounting non-existent server should return false
    const notUnmounted = await hub.unmount('non-existent');
    expect(notUnmounted).toBe(false);
  });

  it('should load from manifest', async () => {
    const manifest = {
      version: '1.0.0',
      servers: {
        'web-server': {
          name: 'web-server',
          transport: {
            type: 'websocket' as const,
            url: 'ws://localhost:8080',
          },
        },
        'file-server': {
          name: 'file-server',
          transport: {
            type: 'stdio' as const,
            command: ['cat'],
          },
        },
      },
      imports: {
        'file-server': { static: true },
      },
      mounts: {
        'web-server': { dynamic: true },
      },
    };

    await hub.loadManifest(manifest);

    expect(hub.serverCount).toBe(2);

    const servers = hub.listServers();
    const importedServer = servers.find((s) => s.name === 'file-server');
    const mountedServer = servers.find((s) => s.name === 'web-server');

    expect(importedServer?.type).toBe('imported');
    expect(mountedServer?.type).toBe('mounted');
  });

  it('should shutdown cleanly', async () => {
    const serverConfig = {
      name: 'shutdown-test',
      transport: {
        type: 'stdio' as const,
        command: ['echo'],
      },
    };

    await hub.mount(serverConfig);
    expect(hub.serverCount).toBe(1);

    await hub.shutdown();

    expect(hub.serverCount).toBe(0);
    expect(hub.isInitialized).toBe(false);
  });

  it('should provide server information', async () => {
    const serverConfig = {
      name: 'info-server',
      transport: {
        type: 'stdio' as const,
        command: ['echo'],
      },
      capabilities: {
        tools: [{ name: 'echo', description: 'Echo tool' }],
      },
      metadata: { custom: 'data' },
    };

    await hub.mount(serverConfig);

    const info = hub.getServerInfo('info-server');

    expect(info).toBeTruthy();
    expect(info.name).toBe('info-server');
    expect(info.capabilities.tools).toHaveLength(1);
    expect(info.metadata.custom).toBe('data');
  });
});
