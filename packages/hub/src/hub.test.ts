/**
 * Node.js tests for HatagoHub
 */

import { setPlatform } from '@himorishige/hatago-runtime';
import { createNodePlatform } from '@himorishige/hatago-runtime/platform/node';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { HatagoHub } from './hub.js';

describe('HatagoHub (Node.js)', () => {
  let hub: HatagoHub;

  beforeEach(() => {
    // Initialize Node.js platform for testing
    setPlatform(createNodePlatform());
    hub = new HatagoHub();
  });

  afterEach(async () => {
    // Clean up
    await hub.stop();
  });

  describe('Initialization', () => {
    it('should create a hub instance', () => {
      expect(hub).toBeInstanceOf(HatagoHub);
    });

    it('should initialize with default options', () => {
      expect(hub).toBeDefined();
      // Verify internal components are initialized
      expect((hub as any).sessions).toBeDefined();
      expect((hub as any).toolRegistry).toBeDefined();
      expect((hub as any).toolInvoker).toBeDefined();
      expect((hub as any).resourceRegistry).toBeDefined();
      expect((hub as any).promptRegistry).toBeDefined();
    });

    it('should accept custom options', async () => {
      const customHub = new HatagoHub({
        sessionTTL: 7200,
        defaultTimeout: 60000,
        namingStrategy: 'flat',
        separator: '-',
      });
      expect(customHub).toBeDefined();
      const options = (customHub as any).options;
      expect(options.sessionTTL).toBe(7200);
      expect(options.defaultTimeout).toBe(60000);
      expect(options.namingStrategy).toBe('flat');
      expect(options.separator).toBe('-');
      await customHub.stop();
    });
  });

  describe('Server Management', () => {
    it('should list empty servers initially', () => {
      const servers = hub.getServers();
      expect(servers).toEqual([]);
    });

    it('should get undefined for non-existent server', () => {
      const server = hub.getServer('non-existent');
      expect(server).toBeUndefined();
    });

    it('should handle duplicate server addition', async () => {
      // Note: We can't actually add a server without a real transport,
      // but we can test the error handling for duplicate IDs
      const servers = (hub as any).servers;
      servers.set('test-server', {
        id: 'test-server',
        spec: { type: 'stdio', command: 'echo' },
        status: 'connected',
        tools: [],
        resources: [],
        prompts: [],
      });

      await expect(
        hub.addServer('test-server', { type: 'stdio', command: 'echo' }),
      ).rejects.toThrow('Server test-server already exists');
    });

    it('should handle removing non-existent server', async () => {
      // removeServer doesn't throw for non-existent servers, it just returns
      await expect(hub.removeServer('non-existent')).resolves.not.toThrow();
    });
  });

  describe('Tool Registry', () => {
    it('should list empty tools initially', () => {
      const toolRegistry = (hub as any).toolRegistry;
      const tools = toolRegistry.getAllTools();
      expect(tools).toEqual([]);
    });

    it('should register and retrieve tools', () => {
      const toolRegistry = (hub as any).toolRegistry;
      const tool = {
        name: 'test_tool',
        description: 'Test tool',
        inputSchema: {
          type: 'object',
          properties: {
            message: { type: 'string' },
          },
        },
      };

      toolRegistry.registerServerTools('test-server', [tool]);

      const tools = toolRegistry.getAllTools();
      expect(tools).toHaveLength(1);
      expect(tools[0].name).toBe('test-server_test_tool');
      expect(tools[0].description).toBe('Test tool');
    });

    it('should clear server tools', () => {
      const toolRegistry = (hub as any).toolRegistry;
      const tool1 = {
        name: 'tool1',
        inputSchema: { type: 'object' },
      };
      const tool2 = {
        name: 'tool2',
        inputSchema: { type: 'object' },
      };

      toolRegistry.registerServerTools('server1', [tool1]);
      toolRegistry.registerServerTools('server2', [tool2]);

      expect(toolRegistry.getAllTools()).toHaveLength(2);

      toolRegistry.clearServerTools('server1');
      expect(toolRegistry.getAllTools()).toHaveLength(1);
      expect(toolRegistry.getAllTools()[0].name).toBe('server2_tool2');
    });
  });

  describe('Resource Registry', () => {
    it('should list empty resources initially', () => {
      const resourceRegistry = (hub as any).resourceRegistry;
      const resources = resourceRegistry.getAllResources();
      expect(resources).toEqual([]);
    });

    it('should register and retrieve resources', () => {
      const resourceRegistry = (hub as any).resourceRegistry;
      const resource = {
        uri: 'file:///test.txt',
        name: 'Test File',
        mimeType: 'text/plain',
      };

      resourceRegistry.registerServerResources('test-server', [resource]);

      const resources = resourceRegistry.getAllResources();
      expect(resources).toHaveLength(1);
      expect(resources[0].uri).toBe('file:///test.txt'); // URI is not namespaced
      expect(resources[0].name).toContain('test-server'); // Name is namespaced
    });
  });

  describe('Prompt Registry', () => {
    it('should list empty prompts initially', () => {
      const promptRegistry = (hub as any).promptRegistry;
      const prompts = promptRegistry.getAllPrompts();
      expect(prompts).toEqual([]);
    });

    it('should register and retrieve prompts', () => {
      const promptRegistry = (hub as any).promptRegistry;
      const prompt = {
        name: 'greeting',
        description: 'Generate a greeting',
        arguments: [
          {
            name: 'name',
            description: 'Name to greet',
            required: true,
          },
        ],
      };

      promptRegistry.registerServerPrompts('test-server', [prompt]);

      const prompts = promptRegistry.getAllPrompts();
      expect(prompts).toHaveLength(1);
      expect(prompts[0].name).toBe('test-server_greeting');
      expect(prompts[0].description).toBe('Generate a greeting');
    });
  });

  describe('Session Management', () => {
    it('should create and retrieve sessions', async () => {
      const sessions = (hub as any).sessions;

      const session = await sessions.create('test-session');
      expect(session).toBeDefined();
      expect(session.id).toBe('test-session');

      const retrieved = await sessions.getSession('test-session');
      expect(retrieved).toBeDefined();
      expect(retrieved?.id).toBe('test-session');
    });

    it('should delete sessions', async () => {
      const sessions = (hub as any).sessions;

      await sessions.create('delete-test');
      expect(await sessions.getSession('delete-test')).toBeDefined();

      await sessions.destroy('delete-test');
      expect(await sessions.getSession('delete-test')).toBeUndefined();
    });
  });

  describe('Event Handling', () => {
    it('should register and emit events', () => {
      let eventFired = false;
      let eventData: any = null;

      const handler = (data: any) => {
        eventFired = true;
        eventData = data;
      };

      hub.on('server:connected', handler);
      (hub as any).emit('server:connected', { serverId: 'test' });

      expect(eventFired).toBe(true);
      expect(eventData).toEqual({ serverId: 'test' });
    });

    it('should unregister event handlers', () => {
      let callCount = 0;

      const handler = () => {
        callCount++;
      };

      hub.on('server:error', handler);
      (hub as any).emit('server:error', {
        serverId: 'test',
        error: new Error('Test'),
      });
      expect(callCount).toBe(1);

      hub.off('server:error', handler);
      (hub as any).emit('server:error', {
        serverId: 'test',
        error: new Error('Test'),
      });
      expect(callCount).toBe(1); // Should not increment
    });
  });

  describe('SSE Manager', () => {
    it('should get SSE manager', () => {
      const sseManager = hub.getSSEManager();
      expect(sseManager).toBeDefined();
    });
  });

  describe('StreamableHTTP Transport', () => {
    it('should get streamable transport', () => {
      const transport = hub.getStreamableTransport();
      expect(transport).toBeDefined();
    });
  });

  describe('Capability Registry', () => {
    it('should track server capabilities', () => {
      const capabilityRegistry = (hub as any).capabilityRegistry;

      capabilityRegistry.markServerCapability(
        'server1',
        'tools/list',
        'supported',
      );
      capabilityRegistry.markServerCapability(
        'server1',
        'resources/list',
        'unsupported',
      );

      expect(
        capabilityRegistry.getServerCapability('server1', 'tools/list'),
      ).toBe('supported');
      expect(
        capabilityRegistry.getServerCapability('server1', 'resources/list'),
      ).toBe('unsupported');
      expect(
        capabilityRegistry.getServerCapability('server1', 'prompts/list'),
      ).toBe('unknown');
    });

    it('should track client capabilities', () => {
      const capabilityRegistry = (hub as any).capabilityRegistry;

      const capabilities = {
        tools: { list: true },
        sampling: false,
      };

      capabilityRegistry.setClientCapabilities('session1', capabilities);
      expect(capabilityRegistry.getClientCapabilities('session1')).toEqual(
        capabilities,
      );

      capabilityRegistry.clearClientCapabilities('session1');
      expect(capabilityRegistry.getClientCapabilities('session1')).toEqual({});
    });
  });

  describe('Start and Stop', () => {
    it('should start and stop hub', async () => {
      const newHub = new HatagoHub();

      await expect(newHub.start()).resolves.toBe(newHub);
      await expect(newHub.stop()).resolves.not.toThrow();
    });
  });
});
