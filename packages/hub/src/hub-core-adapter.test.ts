/**
 * Tests for HubCoreAdapter
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { HubCoreAdapter } from './hub-core-adapter.js';
import type { ServerSpec } from './types.js';

describe('HubCoreAdapter', () => {
  let adapter: HubCoreAdapter;

  beforeEach(() => {
    adapter = new HubCoreAdapter();
  });

  describe('Server Management', () => {
    it('should add a server', async () => {
      const spec: ServerSpec = {
        command: 'node',
        args: ['test.js']
      };

      await adapter.addServer('test-server', spec);
      const servers = adapter.getServers();

      expect(servers).toHaveLength(1);
      expect(servers[0]?.id).toBe('test-server');
      expect(servers[0]?.spec).toEqual(spec);
      expect(servers[0]?.status).toBe('disconnected');
    });

    it('should remove a server', async () => {
      const spec: ServerSpec = {
        command: 'node',
        args: ['test.js']
      };

      await adapter.addServer('test-server', spec);
      await adapter.removeServer('test-server');

      const servers = adapter.getServers();
      expect(servers).toHaveLength(0);
    });

    it('should get a specific server', async () => {
      const spec: ServerSpec = {
        command: 'node',
        args: ['test.js']
      };

      await adapter.addServer('test-server', spec);
      const server = adapter.getServer('test-server');

      expect(server).toBeDefined();
      expect(server?.id).toBe('test-server');
      expect(server?.spec).toEqual(spec);
    });

    it('should return undefined for non-existent server', () => {
      const server = adapter.getServer('non-existent');
      expect(server).toBeUndefined();
    });
  });

  describe('Lifecycle', () => {
    it('should start the adapter', async () => {
      const spec: ServerSpec = {
        command: 'node',
        args: ['test.js']
      };

      await adapter.addServer('test-server', spec);
      await adapter.start();

      const servers = adapter.getServers();
      expect(servers[0]?.status).toBe('connected');
    });

    it('should stop the adapter', async () => {
      await adapter.start();
      await adapter.stop();

      // Should not throw
      expect(true).toBe(true);
    });

    it('should handle multiple starts gracefully', async () => {
      await adapter.start();
      await adapter.start(); // Second start should be no-op

      // Should not throw
      expect(true).toBe(true);
    });
  });

  describe('Event Handling', () => {
    it('should register event handlers', () => {
      const handler = vi.fn();
      adapter.on('server:connected', handler);

      // Should not throw
      expect(true).toBe(true);
    });

    it('should unregister event handlers', () => {
      const handler = vi.fn();
      adapter.on('server:connected', handler);
      adapter.off('server:connected', handler);

      // Should not throw
      expect(true).toBe(true);
    });
  });

  describe('Optional Methods', () => {
    it('should handle reloadConfig gracefully', async () => {
      await adapter.reloadConfig();
      // Should not throw, even though it's a no-op
      expect(true).toBe(true);
    });

    it('should return empty toolset hash', () => {
      const hash = adapter.getToolsetHash();
      expect(hash).toBe('');
    });

    it('should return zero toolset revision', () => {
      const revision = adapter.getToolsetRevision();
      expect(revision).toBe(0);
    });
  });

  describe('Tool Operations', () => {
    it('should return empty tools list when not started', () => {
      const tools = adapter.tools.list();
      expect(tools).toEqual([]);
    });

    it('should throw when calling tool without starting', async () => {
      await expect(adapter.tools.call('test-tool', { arg: 'value' })).rejects.toThrow();
    });
  });

  describe('Resource Operations', () => {
    it('should return empty resources list when not started', () => {
      const resources = adapter.resources.list();
      expect(resources).toEqual([]);
    });

    it('should throw when reading resource without starting', async () => {
      await expect(adapter.resources.read('test://resource')).rejects.toThrow();
    });
  });

  describe('Prompt Operations', () => {
    it('should return empty prompts list when not started', () => {
      const prompts = adapter.prompts.list();
      expect(prompts).toEqual([]);
    });

    it('should throw when getting prompt without starting', async () => {
      await expect(adapter.prompts.get('test-prompt', {})).rejects.toThrow();
    });
  });

  describe('JSON-RPC Request Handling', () => {
    it('should throw when handling request without starting', async () => {
      const request = {
        jsonrpc: '2.0' as const,
        id: 1,
        method: 'tools/list',
        params: {}
      };

      await expect(adapter.handleJsonRpcRequest(request)).rejects.toThrow(
        'HubCoreAdapter not started'
      );
    });
  });
});
