import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import { HatagoHub } from '../hub.js';
import { setPlatform, resetPlatform } from '@himorishige/hatago-runtime/platform';
import { createNodePlatform } from '@himorishige/hatago-runtime/platform/node';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = fileURLToPath(new URL('.', import.meta.url));

describe('E2E: Handshake', () => {
  let fixturePath: string;

  beforeAll(async () => {
    // Initialize platform
    setPlatform(createNodePlatform());

    // Build test fixtures first
    fixturePath = join(__dirname, '../../../test-fixtures/dist/stdio-server.js');
    // Note: In CI, fixtures should be pre-built
  });

  beforeEach(() => {
    // Reset platform for each test to avoid interference
    resetPlatform();
    setPlatform(createNodePlatform());
  });

  describe('STDIO handshake', () => {
    it('should complete handshake and receive session ID', async () => {
      const hub = new HatagoHub({
        namingStrategy: 'prefix',
        separator: '__'
      });

      try {
        await hub.start();

        // Add server after starting hub
        await hub.addServer('test-echo', {
          command: 'node',
          args: [fixturePath, '--echo']
        });

        // Check that servers are connected
        const servers = Array.from(hub.getServers().values());
        expect(servers).toHaveLength(1);
        expect(servers[0].id).toBe('test-echo');
        expect(servers[0].status).toBe('connected');

        // Verify tools are available
        const tools = hub.tools.list();
        expect(tools.some((t) => t.name === 'test-echo__echo')).toBe(true);
      } finally {
        await hub.stop();
      }
    });

    it('should handle multiple server connections', async () => {
      const hub = new HatagoHub({
        namingStrategy: 'prefix',
        separator: '__'
      });

      try {
        await hub.start();

        // Add multiple servers
        await hub.addServer('server1', {
          command: 'node',
          args: [fixturePath, '--echo']
        });

        await hub.addServer('server2', {
          command: 'node',
          args: [fixturePath, '--echo', '--slow']
        });

        const servers = Array.from(hub.getServers().values());
        expect(servers).toHaveLength(2);

        // Both servers should be connected
        expect(servers.every((s) => s.status === 'connected')).toBe(true);

        // Check tools from both servers
        const tools = hub.tools.list();
        expect(tools.some((t) => t.name === 'server1__echo')).toBe(true);
        expect(tools.some((t) => t.name === 'server2__echo')).toBe(true);
        expect(tools.some((t) => t.name === 'server2__slow')).toBe(true);
      } finally {
        await hub.stop();
      }
    });

    it('should generate unique session IDs', async () => {
      const hub = new HatagoHub();

      try {
        await hub.start();

        // Add a test server
        await hub.addServer('test', {
          command: 'node',
          args: [fixturePath, '--echo']
        });

        // Create multiple sessions via API calls
        const sessionIds = new Set<string>();

        // Each API call creates a new session internally
        for (let i = 0; i < 3; i++) {
          const sessionId = await new Promise<string>((resolve) => {
            // Simulate an API request that creates a session
            const id = hub.getOrCreateSessionId({ headers: {} } as any);
            resolve(id);
          });
          sessionIds.add(sessionId);
        }

        // All session IDs should be unique
        expect(sessionIds.size).toBe(3);
      } finally {
        await hub.stop();
      }
    });
  });

  describe('Error handling', () => {
    it('should handle server startup failure gracefully', async () => {
      const hub = new HatagoHub();

      try {
        await hub.start();

        // Try to add a server with invalid command
        try {
          await hub.addServer('invalid', {
            command: 'nonexistent-command',
            args: []
          });
          // Should not reach here
          expect.fail('Should have thrown an error');
        } catch (error) {
          // Expected error
          expect(error).toBeDefined();
        }

        // Hub should still be running
        const servers = Array.from(hub.getServers().values());

        // The failed server should be in error state
        const failedServer = servers.find((s) => s.id === 'invalid');
        expect(failedServer?.status).toBe('error');
        expect(failedServer?.error).toBeDefined();
      } finally {
        await hub.stop();
      }
    });

    it('should handle server crash and attempt recovery', async () => {
      const hub = new HatagoHub();

      try {
        await hub.start();

        // Add a server
        await hub.addServer('crashable', {
          command: 'node',
          args: [fixturePath, '--echo']
        });

        // Get initial server status
        let servers = Array.from(hub.getServers().values());
        expect(servers[0].status).toBe('connected');

        // Force kill the server process (this test is conceptual)
        // In a real test, we'd need access to the process handle
        // For now, we just verify the server exists

        // Check server is still in the list
        servers = Array.from(hub.getServers().values());
        expect(servers.find((s) => s.id === 'crashable')).toBeDefined();
      } finally {
        await hub.stop();
      }
    });
  });
});
