/**
 * Tests for McpRouter - Tool, Resource, and Prompt routing
 */

import type { Prompt, Resource, Tool } from '@hatago/core';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { McpRouter } from './router.js';
import type {
  PromptRegistryInterface,
  ResourceRegistryInterface,
  ToolRegistryInterface,
} from './router-types.js';

describe('McpRouter', () => {
  let router: McpRouter;
  let toolRegistry: ToolRegistryInterface;
  let resourceRegistry: ResourceRegistryInterface;
  let promptRegistry: PromptRegistryInterface;

  beforeEach(() => {
    // Create mock registries
    toolRegistry = {
      registerServerTools: vi.fn(),
      resolveTool: vi.fn(),
      getAllTools: vi.fn(() => []),
      getServerTools: vi.fn(() => []),
      unregisterServerTools: vi.fn(),
      unregisterAllTools: vi.fn(),
      clear: vi.fn(),
    };

    resourceRegistry = {
      registerServerResources: vi.fn(),
      resolveResource: vi.fn(),
      getAllResources: vi.fn(() => []),
      getServerResources: vi.fn(() => []),
      unregisterServerResources: vi.fn(),
      unregisterAllResources: vi.fn(),
      clear: vi.fn(),
    };

    promptRegistry = {
      registerServerPrompts: vi.fn(),
      resolvePrompt: vi.fn(),
      getAllPrompts: vi.fn(() => []),
      getServerPrompts: vi.fn(() => []),
      unregisterServerPrompts: vi.fn(),
      unregisterAllPrompts: vi.fn(),
      clear: vi.fn(),
    };

    router = new McpRouter(toolRegistry, resourceRegistry, promptRegistry);
  });

  describe('Tool Routing', () => {
    it('should route tool to correct server', () => {
      const mockTool: Tool = {
        name: 'test_tool',
        description: 'Test tool',
        inputSchema: {
          type: 'object',
          properties: {},
        },
      };

      const mockTarget = {
        serverId: 'server1',
        tool: mockTool,
      };

      vi.mocked(toolRegistry.resolveTool).mockReturnValue(mockTarget);

      const result = router.routeTool('server1_test_tool');

      expect(result.found).toBe(true);
      expect(result.target).toEqual(mockTarget);
      expect(result.error).toBeUndefined();
      expect(result.metadata?.resolvedBy).toBe('toolRegistry');
    });

    it('should return not found for unknown tool', () => {
      vi.mocked(toolRegistry.resolveTool).mockReturnValue(null);

      const result = router.routeTool('unknown_tool');

      expect(result.found).toBe(false);
      expect(result.target).toBeNull();
      expect(result.error).toContain('Tool not found');
    });

    it('should enable debug logging when context debug is true', () => {
      const consoleSpy = vi
        .spyOn(console, 'debug')
        .mockImplementation(() => {});

      router.routeTool('test_tool', { debug: true });

      expect(consoleSpy).toHaveBeenCalledWith(
        '[McpRouter] Routing tool: test_tool',
      );

      consoleSpy.mockRestore();
    });
  });

  describe('Resource Routing', () => {
    it('should route resource to correct server', () => {
      const mockResource: Resource = {
        uri: 'file:///test.txt',
        name: 'Test Resource',
      };

      const mockTarget = {
        serverId: 'server1',
        resource: mockResource,
      };

      vi.mocked(resourceRegistry.resolveResource).mockReturnValue(mockTarget);

      const result = router.routeResource('file:///test.txt');

      expect(result.found).toBe(true);
      expect(result.target).toEqual(mockTarget);
      expect(result.error).toBeUndefined();
      expect(result.metadata?.resolvedBy).toBe('resourceRegistry');
    });

    it('should return not found for unknown resource', () => {
      vi.mocked(resourceRegistry.resolveResource).mockReturnValue(null);

      const result = router.routeResource('unknown://resource');

      expect(result.found).toBe(false);
      expect(result.target).toBeNull();
      expect(result.error).toContain('Resource not found');
    });
  });

  describe('Prompt Routing', () => {
    it('should route prompt to correct server', () => {
      const mockPrompt: Prompt = {
        name: 'test_prompt',
        description: 'Test prompt',
      };

      const mockTarget = {
        serverId: 'server1',
        prompt: mockPrompt,
      };

      vi.mocked(promptRegistry.resolvePrompt).mockReturnValue(mockTarget);

      const result = router.routePrompt('server1_test_prompt');

      expect(result.found).toBe(true);
      expect(result.target).toEqual(mockTarget);
      expect(result.error).toBeUndefined();
      expect(result.metadata?.resolvedBy).toBe('promptRegistry');
    });

    it('should return not found for unknown prompt', () => {
      vi.mocked(promptRegistry.resolvePrompt).mockReturnValue(null);

      const result = router.routePrompt('unknown_prompt');

      expect(result.found).toBe(false);
      expect(result.target).toBeNull();
      expect(result.error).toContain('Prompt not found');
    });
  });

  describe('Get All Methods', () => {
    it('should get all tools', () => {
      const mockTools: Tool[] = [
        { name: 'tool1', description: 'Tool 1', inputSchema: {} },
        { name: 'tool2', description: 'Tool 2', inputSchema: {} },
      ];

      vi.mocked(toolRegistry.getAllTools).mockReturnValue(mockTools);

      const tools = router.getAllTools();

      expect(tools).toEqual(mockTools);
      expect(toolRegistry.getAllTools).toHaveBeenCalled();
    });

    it('should get all resources', () => {
      const mockResources: Resource[] = [
        { uri: 'file:///1.txt', name: 'Resource 1' },
        { uri: 'file:///2.txt', name: 'Resource 2' },
      ];

      vi.mocked(resourceRegistry.getAllResources).mockReturnValue(
        mockResources,
      );

      const resources = router.getAllResources();

      expect(resources).toEqual(mockResources);
      expect(resourceRegistry.getAllResources).toHaveBeenCalled();
    });

    it('should get all prompts', () => {
      const mockPrompts: Prompt[] = [
        { name: 'prompt1', description: 'Prompt 1' },
        { name: 'prompt2', description: 'Prompt 2' },
      ];

      vi.mocked(promptRegistry.getAllPrompts).mockReturnValue(mockPrompts);

      const prompts = router.getAllPrompts();

      expect(prompts).toEqual(mockPrompts);
      expect(promptRegistry.getAllPrompts).toHaveBeenCalled();
    });
  });

  describe('Get Server-specific Items', () => {
    it('should get tools for specific server', () => {
      const mockTools: Tool[] = [
        { name: 'server1_tool', description: 'Server 1 Tool', inputSchema: {} },
      ];

      vi.mocked(toolRegistry.getServerTools).mockReturnValue(mockTools);

      const tools = router.getServerTools('server1');

      expect(tools).toEqual(mockTools);
      expect(toolRegistry.getServerTools).toHaveBeenCalledWith('server1');
    });

    it('should get resources for specific server', () => {
      const mockResources: Resource[] = [
        { uri: 'server1://resource', name: 'Server 1 Resource' },
      ];

      vi.mocked(resourceRegistry.getServerResources).mockReturnValue(
        mockResources,
      );

      const resources = router.getServerResources('server1');

      expect(resources).toEqual(mockResources);
      expect(resourceRegistry.getServerResources).toHaveBeenCalledWith(
        'server1',
      );
    });

    it('should get prompts for specific server', () => {
      const mockPrompts: Prompt[] = [
        { name: 'server1_prompt', description: 'Server 1 Prompt' },
      ];

      vi.mocked(promptRegistry.getServerPrompts).mockReturnValue(mockPrompts);

      const prompts = router.getServerPrompts('server1');

      expect(prompts).toEqual(mockPrompts);
      expect(promptRegistry.getServerPrompts).toHaveBeenCalledWith('server1');
    });
  });

  describe('Name Generation and Parsing', () => {
    it('should generate public name with namespace strategy', () => {
      const publicName = router.generatePublicName('server1', 'tool_name');
      expect(publicName).toBe('server1_tool_name');
    });

    it('should generate public name with custom separator', () => {
      router.updateConfig({ separator: '__' });
      const publicName = router.generatePublicName('server1', 'tool_name');
      expect(publicName).toBe('server1__tool_name');
    });

    it('should parse public name with namespace', () => {
      const parsed = router.parsePublicName('server1_tool_name');
      expect(parsed).toEqual({
        serverId: 'server1',
        originalName: 'tool_name',
      });
    });

    it('should parse public name without namespace', () => {
      const parsed = router.parsePublicName('simplename');
      expect(parsed).toEqual({
        originalName: 'simplename',
      });
    });
  });

  describe('Grouping by Server', () => {
    it('should group tools by server', () => {
      const mockTools: Tool[] = [
        { name: 'server1_tool1', description: 'Tool 1', inputSchema: {} },
        { name: 'server1_tool2', description: 'Tool 2', inputSchema: {} },
        { name: 'server2_tool1', description: 'Tool 3', inputSchema: {} },
      ];

      vi.mocked(toolRegistry.getAllTools).mockReturnValue(mockTools);

      const grouped = router.groupToolsByServer();

      expect(grouped.size).toBe(2);
      expect(grouped.get('server1')).toHaveLength(2);
      expect(grouped.get('server2')).toHaveLength(1);
    });

    it('should group resources by server', () => {
      const mockResources: Resource[] = [
        { uri: 'server1_resource1', name: 'Resource 1' },
        { uri: 'server2_resource1', name: 'Resource 2' },
        { uri: 'server2_resource2', name: 'Resource 3' },
      ];

      vi.mocked(resourceRegistry.getAllResources).mockReturnValue(
        mockResources,
      );

      const grouped = router.groupResourcesByServer();

      expect(grouped.size).toBe(2);
      expect(grouped.get('server1')).toHaveLength(1);
      expect(grouped.get('server2')).toHaveLength(2);
    });

    it('should group prompts by server', () => {
      const mockPrompts: Prompt[] = [
        { name: 'server1_prompt1', description: 'Prompt 1' },
        { name: 'server1_prompt2', description: 'Prompt 2' },
        { name: 'server1_prompt3', description: 'Prompt 3' },
      ];

      vi.mocked(promptRegistry.getAllPrompts).mockReturnValue(mockPrompts);

      const grouped = router.groupPromptsByServer();

      expect(grouped.size).toBe(1);
      expect(grouped.get('server1')).toHaveLength(3);
    });
  });

  describe('Statistics', () => {
    it('should return statistics about registered items', () => {
      const mockTools: Tool[] = [
        { name: 'server1_tool1', description: 'Tool 1', inputSchema: {} },
        { name: 'server2_tool1', description: 'Tool 2', inputSchema: {} },
      ];

      const mockResources: Resource[] = [
        { uri: 'server1_resource1', name: 'Resource 1' },
        { uri: 'server3_resource1', name: 'Resource 2' },
      ];

      const mockPrompts: Prompt[] = [
        { name: 'server2_prompt1', description: 'Prompt 1' },
      ];

      vi.mocked(toolRegistry.getAllTools).mockReturnValue(mockTools);
      vi.mocked(resourceRegistry.getAllResources).mockReturnValue(
        mockResources,
      );
      vi.mocked(promptRegistry.getAllPrompts).mockReturnValue(mockPrompts);

      const stats = router.getStatistics();

      expect(stats.tools).toBe(2);
      expect(stats.resources).toBe(2);
      expect(stats.prompts).toBe(1);
      expect(stats.servers.size).toBe(3);
      expect(stats.servers.has('server1')).toBe(true);
      expect(stats.servers.has('server2')).toBe(true);
      expect(stats.servers.has('server3')).toBe(true);
    });

    it('should return stats with metrics', () => {
      const stats = router.getStats();

      expect(stats).toHaveProperty('tools');
      expect(stats).toHaveProperty('resources');
      expect(stats).toHaveProperty('prompts');
      expect(stats).toHaveProperty('servers');
      expect(stats).toHaveProperty('metrics');
      expect(stats.metrics).toEqual({
        requestCount: 0,
        averageResponseTime: 0,
        errorRate: 0,
      });
    });
  });

  describe('Configuration Management', () => {
    it('should update router configuration', () => {
      router.updateConfig({
        namingStrategy: 'flat',
        separator: '__',
        debug: true,
      });

      const config = router.getNamingConfig();

      expect(config.namingStrategy).toBe('flat');
      expect(config.separator).toBe('__');
      expect(config.debug).toBe(true);
    });

    it('should update naming configuration', () => {
      router.updateNamingConfig({ separator: '::' });

      const config = router.getNamingConfig();
      expect(config.separator).toBe('::');
    });
  });

  describe('Functional Routing Approach', () => {
    it('should route tool with functional approach', () => {
      const mockTarget = {
        serverId: 'server1',
        tool: { name: 'test', description: 'Test', inputSchema: {} },
      };

      vi.mocked(toolRegistry.resolveTool).mockReturnValue(mockTarget);

      const result = router.routeWithFunctionalApproach('server1_test', 'tool');

      expect(result.found).toBe(true);
      expect(result.target).toEqual(mockTarget);
    });

    it('should route resource with functional approach', () => {
      const mockTarget = {
        serverId: 'server1',
        resource: { uri: 'test://uri', name: 'Test' },
      };

      vi.mocked(resourceRegistry.resolveResource).mockReturnValue(mockTarget);

      const result = router.routeWithFunctionalApproach(
        'test://uri',
        'resource',
      );

      expect(result.found).toBe(true);
      expect(result.target).toEqual(mockTarget);
    });

    it('should route prompt with functional approach', () => {
      const mockTarget = {
        serverId: 'server1',
        prompt: { name: 'test', description: 'Test' },
      };

      vi.mocked(promptRegistry.resolvePrompt).mockReturnValue(mockTarget);

      const result = router.routeWithFunctionalApproach(
        'server1_test',
        'prompt',
      );

      expect(result.found).toBe(true);
      expect(result.target).toEqual(mockTarget);
    });

    it('should return error for unknown type', () => {
      const result = router.routeWithFunctionalApproach(
        'test',
        'unknown' as any,
      );

      expect(result.found).toBe(false);
      expect(result.error).toContain('Unknown type');
    });
  });

  describe('Metrics', () => {
    it('should reset metrics', () => {
      router.resetMetrics();

      const metrics = router.getMetrics();
      expect(metrics.requestCount).toBe(0);
      expect(metrics.averageResponseTime).toBe(0);
      expect(metrics.errorRate).toBe(0);
    });
  });
});
