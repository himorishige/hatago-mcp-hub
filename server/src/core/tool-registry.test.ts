import { ToolRegistry } from '@hatago/runtime';
import type { Tool } from '@modelcontextprotocol/sdk/types.js';
import { beforeEach, describe, expect, it } from 'vitest';

describe('ToolRegistry', () => {
  let registry: ToolRegistry;

  const createMockTool = (name: string, description = ''): Tool => ({
    name,
    description,
    inputSchema: {
      type: 'object',
      properties: {},
    },
  });

  beforeEach(() => {
    registry = new ToolRegistry();
  });

  describe('registerServerTools', () => {
    it('should register tools with default naming strategy', () => {
      const tools = [
        createMockTool('test_tool'),
        createMockTool('another_tool'),
      ];

      registry.registerServerTools('server1', tools);

      expect(registry.getToolCount()).toBe(2);
      expect(registry.getServerCount()).toBe(1);
    });

    it('should clear previous tools when re-registering', () => {
      const tools1 = [createMockTool('tool1')];
      const tools2 = [createMockTool('tool2'), createMockTool('tool3')];

      registry.registerServerTools('server1', tools1);
      expect(registry.getToolCount()).toBe(1);

      registry.registerServerTools('server1', tools2);
      expect(registry.getToolCount()).toBe(2);
      expect(registry.getServerTools('server1')).toHaveLength(2);
    });

    it('should handle empty tool list', () => {
      registry.registerServerTools('server1', []);

      expect(registry.getToolCount()).toBe(0);
      expect(registry.getServerCount()).toBe(1);
    });
  });

  describe('naming strategies', () => {
    it('should use namespace strategy with custom format', () => {
      registry = new ToolRegistry({
        namingConfig: {
          strategy: 'namespace',
          format: '{serverId}_{toolName}',
        },
      });

      const tools = [createMockTool('test')];
      registry.registerServerTools('myserver', tools);

      const allTools = registry.getAllTools();
      expect(allTools[0].name).toBe('myserver_test');
    });

    it('should use alias strategy for short names', () => {
      registry = new ToolRegistry({
        namingConfig: {
          strategy: 'alias',
        },
      });

      const tools = [createMockTool('unique_tool')];
      registry.registerServerTools('server1', tools);

      const allTools = registry.getAllTools();
      expect(allTools[0].name).toBe('unique_tool');
    });

    it('should add namespace when alias conflicts', () => {
      registry = new ToolRegistry({
        namingConfig: {
          strategy: 'alias',
        },
      });

      const tools = [createMockTool('common_tool')];
      registry.registerServerTools('server1', tools);
      registry.registerServerTools('server2', tools);

      const server2Tools = registry.getServerTools('server2');
      expect(server2Tools[0].name).toBe('server2_common_tool');
    });

    it('should throw error on collision with error strategy', () => {
      registry = new ToolRegistry({
        namingConfig: {
          strategy: 'error',
        },
      });

      const tools = [createMockTool('test')];
      registry.registerServerTools('server1', tools);

      expect(() => {
        registry.registerServerTools('server2', tools);
      }).toThrow();
    });

    it('should apply custom aliases', () => {
      registry = new ToolRegistry({
        namingConfig: {
          aliases: {
            server1_original_name: 'custom_alias',
          },
        },
      });

      const tools = [createMockTool('original_name')];
      registry.registerServerTools('server1', tools);

      const allTools = registry.getAllTools();
      expect(allTools[0].name).toBe('custom_alias');
    });

    it('should replace dots with underscores for Claude Code compatibility', () => {
      registry = new ToolRegistry({
        namingConfig: {
          strategy: 'namespace',
        },
      });

      const tools = [createMockTool('tool.with.dots')];
      registry.registerServerTools('server.name', tools);

      const allTools = registry.getAllTools();
      expect(allTools[0].name).toBe('server_name_tool_with_dots');
    });
  });

  describe('getTool', () => {
    it('should retrieve tool metadata by public name', () => {
      const tool = createMockTool('test_tool');
      registry.registerServerTools('server1', [tool]);

      const metadata = registry.getTool('server1_test_tool');
      expect(metadata).toBeDefined();
      expect(metadata?.serverId).toBe('server1');
      expect(metadata?.originalName).toBe('test_tool');
      expect(metadata?.publicName).toBe('server1_test_tool');
    });

    it('should return undefined for non-existent tool', () => {
      const metadata = registry.getTool('non_existent');
      expect(metadata).toBeUndefined();
    });
  });

  describe('resolveTool', () => {
    it('should resolve public name to server and original name', () => {
      const tool = createMockTool('original');
      registry.registerServerTools('myserver', [tool]);

      const resolved = registry.resolveTool('myserver_original');
      expect(resolved).toEqual({
        serverId: 'myserver',
        originalName: 'original',
      });
    });

    it('should return undefined for unknown tool', () => {
      const resolved = registry.resolveTool('unknown');
      expect(resolved).toBeUndefined();
    });
  });

  describe('clearServerTools', () => {
    it('should remove all tools for a server', () => {
      const tools = [createMockTool('tool1'), createMockTool('tool2')];
      registry.registerServerTools('server1', tools);
      registry.registerServerTools('server2', [createMockTool('tool3')]);

      registry.clearServerTools('server1');

      expect(registry.getServerTools('server1')).toHaveLength(0);
      expect(registry.getServerTools('server2')).toHaveLength(1);
      expect(registry.getToolCount()).toBe(1);
    });

    it('should handle clearing non-existent server', () => {
      expect(() => {
        registry.clearServerTools('non_existent');
      }).not.toThrow();
    });
  });

  describe('detectCollisions', () => {
    it('should detect tools with same original name', () => {
      const tool = createMockTool('shared_tool');
      registry.registerServerTools('server1', [tool]);
      registry.registerServerTools('server2', [tool]);

      const collisions = registry.detectCollisions();
      expect(collisions).toHaveLength(1);
      expect(collisions[0].toolName).toBe('shared_tool');
      expect(collisions[0].serverIds).toContain('server1');
      expect(collisions[0].serverIds).toContain('server2');
    });

    it('should return empty array when no collisions', () => {
      registry.registerServerTools('server1', [createMockTool('tool1')]);
      registry.registerServerTools('server2', [createMockTool('tool2')]);

      const collisions = registry.detectCollisions();
      expect(collisions).toHaveLength(0);
    });
  });

  describe('getAllTools', () => {
    it('should return all tools with public names', () => {
      registry.registerServerTools('server1', [
        createMockTool('tool1'),
        createMockTool('tool2'),
      ]);
      registry.registerServerTools('server2', [createMockTool('tool3')]);

      const allTools = registry.getAllTools();
      expect(allTools).toHaveLength(3);
      expect(allTools.map((t) => t.name)).toContain('server1_tool1');
      expect(allTools.map((t) => t.name)).toContain('server1_tool2');
      expect(allTools.map((t) => t.name)).toContain('server2_tool3');
    });

    it('should return empty array when no tools registered', () => {
      const allTools = registry.getAllTools();
      expect(allTools).toHaveLength(0);
    });
  });

  describe('getServerTools', () => {
    it('should return tools for specific server', () => {
      registry.registerServerTools('server1', [
        createMockTool('tool1'),
        createMockTool('tool2'),
      ]);
      registry.registerServerTools('server2', [createMockTool('tool3')]);

      const server1Tools = registry.getServerTools('server1');
      expect(server1Tools).toHaveLength(2);
      expect(server1Tools.map((t) => t.name)).toContain('server1_tool1');
      expect(server1Tools.map((t) => t.name)).toContain('server1_tool2');
    });

    it('should return empty array for non-existent server', () => {
      const tools = registry.getServerTools('non_existent');
      expect(tools).toHaveLength(0);
    });
  });

  describe('getDebugInfo', () => {
    it('should provide comprehensive debug information', () => {
      registry = new ToolRegistry({
        namingConfig: {
          strategy: 'namespace',
        },
      });

      registry.registerServerTools('server1', [createMockTool('tool1')]);
      registry.registerServerTools('server2', [createMockTool('tool1')]);

      const debugInfo = registry.getDebugInfo();
      expect(debugInfo.totalTools).toBe(2);
      expect(debugInfo.totalServers).toBe(2);
      expect(debugInfo.namingStrategy).toBe('namespace');
      expect(debugInfo.collisions).toHaveLength(1);
      expect(debugInfo.tools).toHaveLength(2);
    });
  });

  describe('clear', () => {
    it('should remove all tools and servers', () => {
      registry.registerServerTools('server1', [createMockTool('tool1')]);
      registry.registerServerTools('server2', [createMockTool('tool2')]);

      registry.clear();

      expect(registry.getToolCount()).toBe(0);
      expect(registry.getServerCount()).toBe(0);
      expect(registry.getAllTools()).toHaveLength(0);
    });
  });
});
