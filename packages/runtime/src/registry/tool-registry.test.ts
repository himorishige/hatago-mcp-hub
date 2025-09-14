/**
 * Tests for ToolRegistry - tool name collision detection and management
 */

import type { Tool } from '@modelcontextprotocol/sdk/types.js';
import { beforeEach, describe, expect, it } from 'vitest';
import { ToolRegistry } from './tool-registry.js';

describe('ToolRegistry', () => {
  let registry: ToolRegistry;

  beforeEach(() => {
    registry = new ToolRegistry();
  });

  describe('Tool Registration', () => {
    it('should start with empty registry', () => {
      expect(registry.getAllTools()).toEqual([]);
      expect(registry.getToolCount()).toBe(0);
      expect(registry.getServerCount()).toBe(0);
    });

    it('should register server tools', () => {
      const tools: Tool[] = [
        {
          name: 'echo',
          description: 'Echo input',
          inputSchema: {
            type: 'object',
            properties: {
              text: { type: 'string' }
            }
          }
        },
        {
          name: 'add',
          description: 'Add numbers',
          inputSchema: {
            type: 'object',
            properties: {
              a: { type: 'number' },
              b: { type: 'number' }
            }
          }
        }
      ];

      registry.registerServerTools('server1', tools);

      expect(registry.getToolCount()).toBe(2);
      expect(registry.getServerCount()).toBe(1);

      const allTools = registry.getAllTools();
      expect(allTools).toHaveLength(2);
      expect(allTools[0].name).toBe('server1_echo');
      expect(allTools[1].name).toBe('server1_add');
    });

    it('should handle multiple servers', () => {
      const server1Tools: Tool[] = [
        {
          name: 'tool1',
          inputSchema: { type: 'object' }
        }
      ];

      const server2Tools: Tool[] = [
        {
          name: 'tool2',
          inputSchema: { type: 'object' }
        },
        {
          name: 'tool3',
          inputSchema: { type: 'object' }
        }
      ];

      registry.registerServerTools('server1', server1Tools);
      registry.registerServerTools('server2', server2Tools);

      expect(registry.getServerCount()).toBe(2);
      expect(registry.getToolCount()).toBe(3);

      const server1RegisteredTools = registry.getServerTools('server1');
      expect(server1RegisteredTools).toHaveLength(1);
      expect(server1RegisteredTools[0].name).toBe('server1_tool1');

      const server2RegisteredTools = registry.getServerTools('server2');
      expect(server2RegisteredTools).toHaveLength(2);
      expect(server2RegisteredTools[0].name).toBe('server2_tool2');
      expect(server2RegisteredTools[1].name).toBe('server2_tool3');
    });

    it('should overwrite tools when re-registering', () => {
      const initialTools: Tool[] = [
        {
          name: 'old_tool',
          inputSchema: { type: 'object' }
        }
      ];

      const updatedTools: Tool[] = [
        {
          name: 'new_tool',
          inputSchema: { type: 'object' }
        }
      ];

      registry.registerServerTools('server1', initialTools);
      expect(registry.getToolCount()).toBe(1);
      expect(registry.getAllTools()[0].name).toBe('server1_old_tool');

      registry.registerServerTools('server1', updatedTools);
      expect(registry.getToolCount()).toBe(1);
      expect(registry.getAllTools()[0].name).toBe('server1_new_tool');
    });
  });

  describe('Tool Retrieval', () => {
    beforeEach(() => {
      const tools: Tool[] = [
        {
          name: 'echo',
          description: 'Echo tool',
          inputSchema: { type: 'object' }
        },
        {
          name: 'calc',
          description: 'Calculator tool',
          inputSchema: { type: 'object' }
        }
      ];

      registry.registerServerTools('test-server', tools);
    });

    it('should get tool by public name', () => {
      const tool = registry.getTool('test-server_echo');
      expect(tool).toBeDefined();
      expect(tool?.originalName).toBe('echo');
      expect(tool?.serverId).toBe('test-server');
      expect(tool?.publicName).toBe('test-server_echo');
    });

    it('should return undefined for unknown tool', () => {
      const tool = registry.getTool('unknown_tool');
      expect(tool).toBeUndefined();
    });

    it('should get all tools for a server', () => {
      const tools = registry.getServerTools('test-server');
      expect(tools).toHaveLength(2);
      expect(tools[0].name).toBe('test-server_echo');
      expect(tools[1].name).toBe('test-server_calc');
    });

    it('should return empty array for unknown server', () => {
      const tools = registry.getServerTools('unknown-server');
      expect(tools).toEqual([]);
    });
  });

  describe('Tool Name Resolution', () => {
    beforeEach(() => {
      const tools: Tool[] = [
        {
          name: 'process',
          inputSchema: { type: 'object' }
        }
      ];

      registry.registerServerTools('data-processor', tools);
    });

    it('should resolve public name to original', () => {
      const resolved = registry.resolveTool('data-processor_process');
      expect(resolved).toBeDefined();
      expect(resolved?.serverId).toBe('data-processor');
      expect(resolved?.originalName).toBe('process');
    });

    it('should return undefined for unresolvable name', () => {
      const resolved = registry.resolveTool('invalid_name');
      expect(resolved).toBeUndefined();
    });
  });

  describe('Tool Naming', () => {
    it('should always use serverId_toolName format', () => {
      const tools: Tool[] = [
        {
          name: 'test',
          inputSchema: { type: 'object' }
        }
      ];

      registry.registerServerTools('my-server', tools);

      const allTools = registry.getAllTools();
      expect(allTools[0].name).toBe('my-server_test');

      // Original name should still be 'test'
      const resolved = registry.resolveTool('my-server_test');
      expect(resolved?.originalName).toBe('test');
    });
  });

  describe('Server Management', () => {
    it('should clear server tools', () => {
      const tools: Tool[] = [
        {
          name: 'tool1',
          inputSchema: { type: 'object' }
        },
        {
          name: 'tool2',
          inputSchema: { type: 'object' }
        }
      ];

      registry.registerServerTools('server1', tools);
      expect(registry.getToolCount()).toBe(2);

      registry.clearServerTools('server1');
      expect(registry.getToolCount()).toBe(0);
      expect(registry.getServerTools('server1')).toEqual([]);
    });

    it('should only clear specified server tools', () => {
      const server1Tools: Tool[] = [
        {
          name: 'tool1',
          inputSchema: { type: 'object' }
        }
      ];

      const server2Tools: Tool[] = [
        {
          name: 'tool2',
          inputSchema: { type: 'object' }
        }
      ];

      registry.registerServerTools('server1', server1Tools);
      registry.registerServerTools('server2', server2Tools);
      expect(registry.getToolCount()).toBe(2);

      registry.clearServerTools('server1');
      expect(registry.getToolCount()).toBe(1);
      expect(registry.getServerTools('server1')).toEqual([]);
      expect(registry.getServerTools('server2')).toHaveLength(1);
    });

    it('should handle clearing non-existent server', () => {
      // Should not throw
      expect(() => {
        registry.clearServerTools('non-existent');
      }).not.toThrow();
    });
  });

  describe('Registry Statistics', () => {
    it('should track tool and server counts', () => {
      expect(registry.getToolCount()).toBe(0);
      expect(registry.getServerCount()).toBe(0);

      registry.registerServerTools('server1', [
        { name: 'tool1', inputSchema: { type: 'object' } },
        { name: 'tool2', inputSchema: { type: 'object' } }
      ]);

      expect(registry.getToolCount()).toBe(2);
      expect(registry.getServerCount()).toBe(1);

      registry.registerServerTools('server2', [{ name: 'tool3', inputSchema: { type: 'object' } }]);

      expect(registry.getToolCount()).toBe(3);
      expect(registry.getServerCount()).toBe(2);

      registry.clearServerTools('server1');
      expect(registry.getToolCount()).toBe(1);
      expect(registry.getServerCount()).toBe(1);
    });
  });

  describe('Edge Cases', () => {
    it('should handle empty tool list', () => {
      registry.registerServerTools('empty-server', []);
      expect(registry.getToolCount()).toBe(0);
      expect(registry.getServerTools('empty-server')).toEqual([]);
    });

    it('should handle tools with minimal schema', () => {
      const minimalTools: Tool[] = [
        {
          name: 'minimal',
          inputSchema: { type: 'object' }
          // No description or other optional fields
        }
      ];

      registry.registerServerTools('server', minimalTools);

      const tools = registry.getAllTools();
      expect(tools).toHaveLength(1);
      expect(tools[0].name).toBe('server_minimal');
      expect(tools[0].inputSchema).toBeDefined();
    });

    it('should handle special characters in names', () => {
      const tools: Tool[] = [
        {
          name: 'tool-with-dash',
          inputSchema: { type: 'object' }
        },
        {
          name: 'tool.with.dot',
          inputSchema: { type: 'object' }
        },
        {
          name: 'tool_with_underscore',
          inputSchema: { type: 'object' }
        }
      ];

      registry.registerServerTools('special-server', tools);

      const allTools = registry.getAllTools();
      expect(allTools).toHaveLength(3);
      expect(allTools[0].name).toBe('special-server_tool-with-dash');
      expect(allTools[1].name).toBe('special-server_tool_with_dot');
      expect(allTools[2].name).toBe('special-server_tool_with_underscore');
    });
  });
});
