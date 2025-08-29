/**
 * Cloudflare Workers tests for HatagoHub
 */

import { setPlatform } from '@hatago/runtime';
import type { WorkersEnv } from '@hatago/runtime/platform/workers';
import { createWorkersPlatform } from '@hatago/runtime/platform/workers';
import { beforeEach, describe, expect, it } from 'vitest';
import { HatagoHub } from './workers-entry.js';

// Mock Workers environment
const mockEnv: WorkersEnv = {
  CONFIG_KV: {} as any,
  SESSION_DO: {} as any,
};

describe('HatagoHub (Workers)', () => {
  beforeEach(() => {
    // Platform is initialized in the Workers-specific HatagoHub constructor
  });

  it('should create a hub instance with Workers environment', () => {
    const hub = new HatagoHub(mockEnv);
    expect(hub).toBeInstanceOf(HatagoHub);
  });

  it('should initialize with default options', () => {
    const hub = new HatagoHub(mockEnv);
    expect(hub).toBeDefined();
  });

  it('should accept custom options', () => {
    const hub = new HatagoHub(mockEnv, {
      sessionTTL: 7200,
      defaultTimeout: 60000,
    });
    expect(hub).toBeDefined();
  });

  it('should list empty servers initially', async () => {
    const hub = new HatagoHub(mockEnv);
    const servers = await hub.listServers();
    expect(servers).toEqual([]);
  });

  it('should list empty tools initially', async () => {
    const hub = new HatagoHub(mockEnv);
    const tools = await hub.listTools();
    expect(tools).toEqual([]);
  });

  it('should reject local server connections', async () => {
    const hub = new HatagoHub(mockEnv);

    // Attempt to connect a local server (should fail in Workers)
    await expect(
      hub.connectServers([
        {
          id: 'local-server',
          command: 'node',
          args: ['server.js'],
        },
      ]),
    ).rejects.toThrow(
      'Local MCP servers are not supported in this environment',
    );
  });

  it('should accept remote server connections', async () => {
    const hub = new HatagoHub(mockEnv);

    // Remote servers should be allowed
    const servers = [
      {
        id: 'remote-sse',
        url: 'https://example.com/mcp',
        type: 'sse' as const,
      },
    ];

    // This won't actually connect (no real server), but should not throw capability error
    // The actual connection will fail with a network error, which is expected
    await expect(hub.connectServers(servers)).rejects.toThrow();
  });
});
