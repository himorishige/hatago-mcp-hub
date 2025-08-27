/**
 * Tests for MCP Router class
 */

import { describe, expect, it, vi } from 'vitest';
import { McpRouter } from './mcp-router.js';
import type { PromptRegistry } from './prompt-registry.js';
import type { ResourceRegistry } from './resource-registry.js';
import type { ToolRegistry } from './tool-registry.js';

describe('McpRouter', () => {
  const createMockToolRegistry = (): ToolRegistry => {
    return {
      resolveTool: vi.fn(),
      getToolCount: vi.fn().mockReturnValue(5),
      registerServerTools: vi.fn(),
      clearServerTools: vi.fn(),
      getAllTools: vi.fn(),
      getTool: vi.fn(),
      getServerTools: vi.fn(),
      detectCollisions: vi.fn(),
      getServerCount: vi.fn(),
      getDebugInfo: vi.fn(),
      clear: vi.fn(),
    } as any;
  };

  const createMockResourceRegistry = (): ResourceRegistry => {
    return {
      resolveResource: vi.fn(),
      getResourceCount: vi.fn().mockReturnValue(3),
      registerServerResources: vi.fn(),
      clearServerResources: vi.fn(),
      getAllResources: vi.fn(),
      getResource: vi.fn(),
      getServerResources: vi.fn(),
    } as any;
  };

  const createMockPromptRegistry = (): PromptRegistry => {
    return {
      resolvePrompt: vi.fn(),
      getPromptCount: vi.fn().mockReturnValue(2),
      registerServerPrompts: vi.fn(),
      clearServerPrompts: vi.fn(),
      getAllPrompts: vi.fn(),
      getPrompt: vi.fn(),
      getServerPrompts: vi.fn(),
    } as any;
  };

  describe('routeTool', () => {
    it('should route tool successfully', () => {
      const toolRegistry = createMockToolRegistry();
      const resourceRegistry = createMockResourceRegistry();
      const promptRegistry = createMockPromptRegistry();

      vi.mocked(toolRegistry.resolveTool).mockReturnValue({
        serverId: 'server1',
        originalName: 'original_tool',
      });

      const router = new McpRouter(
        toolRegistry,
        resourceRegistry,
        promptRegistry,
      );
      const result = router.routeTool('tool_server1');

      expect(result.target).toEqual({
        serverId: 'server1',
        originalName: 'original_tool',
      });
      expect(result.error).toBeUndefined();
      expect(result.metadata?.publicName).toBe('tool_server1');
      expect(result.metadata?.resolvedBy).toBe('toolRegistry');
    });

    it('should return error when tool not found', () => {
      const toolRegistry = createMockToolRegistry();
      const resourceRegistry = createMockResourceRegistry();
      const promptRegistry = createMockPromptRegistry();

      vi.mocked(toolRegistry.resolveTool).mockReturnValue(undefined);

      const router = new McpRouter(
        toolRegistry,
        resourceRegistry,
        promptRegistry,
      );
      const result = router.routeTool('unknown_tool');

      expect(result.target).toBeNull();
      expect(result.error).toBe('Tool not found: unknown_tool');
    });

    it('should accept context parameter', () => {
      const toolRegistry = createMockToolRegistry();
      const resourceRegistry = createMockResourceRegistry();
      const promptRegistry = createMockPromptRegistry();

      vi.mocked(toolRegistry.resolveTool).mockReturnValue({
        serverId: 'server1',
        originalName: 'tool',
      });

      const router = new McpRouter(
        toolRegistry,
        resourceRegistry,
        promptRegistry,
      );
      const result = router.routeTool('tool_server1', { requestId: '123' });

      expect(result.target).toBeTruthy();
    });
  });

  describe('routeResource', () => {
    it('should route resource successfully', () => {
      const toolRegistry = createMockToolRegistry();
      const resourceRegistry = createMockResourceRegistry();
      const promptRegistry = createMockPromptRegistry();

      vi.mocked(resourceRegistry.resolveResource).mockReturnValue({
        serverId: 'server1',
        originalUri: 'file:///original/path',
      });

      const router = new McpRouter(
        toolRegistry,
        resourceRegistry,
        promptRegistry,
      );
      const result = router.routeResource('file:///path_server1');

      expect(result.target).toEqual({
        serverId: 'server1',
        originalUri: 'file:///original/path',
      });
      expect(result.error).toBeUndefined();
      expect(result.metadata?.uri).toBe('file:///path_server1');
      expect(result.metadata?.resolvedBy).toBe('resourceRegistry');
    });

    it('should return error when resource not found', () => {
      const toolRegistry = createMockToolRegistry();
      const resourceRegistry = createMockResourceRegistry();
      const promptRegistry = createMockPromptRegistry();

      vi.mocked(resourceRegistry.resolveResource).mockReturnValue(undefined);

      const router = new McpRouter(
        toolRegistry,
        resourceRegistry,
        promptRegistry,
      );
      const result = router.routeResource('unknown://resource');

      expect(result.target).toBeNull();
      expect(result.error).toBe('Resource not found: unknown://resource');
    });
  });

  describe('routePrompt', () => {
    it('should route prompt successfully', () => {
      const toolRegistry = createMockToolRegistry();
      const resourceRegistry = createMockResourceRegistry();
      const promptRegistry = createMockPromptRegistry();

      vi.mocked(promptRegistry.resolvePrompt).mockReturnValue({
        serverId: 'server1',
        originalName: 'original_prompt',
      });

      const router = new McpRouter(
        toolRegistry,
        resourceRegistry,
        promptRegistry,
      );
      const result = router.routePrompt('prompt_server1');

      expect(result.target).toEqual({
        serverId: 'server1',
        originalName: 'original_prompt',
      });
      expect(result.error).toBeUndefined();
      expect(result.metadata?.name).toBe('prompt_server1');
      expect(result.metadata?.resolvedBy).toBe('promptRegistry');
    });

    it('should return error when prompt not found', () => {
      const toolRegistry = createMockToolRegistry();
      const resourceRegistry = createMockResourceRegistry();
      const promptRegistry = createMockPromptRegistry();

      vi.mocked(promptRegistry.resolvePrompt).mockReturnValue(undefined);

      const router = new McpRouter(
        toolRegistry,
        resourceRegistry,
        promptRegistry,
      );
      const result = router.routePrompt('unknown_prompt');

      expect(result.target).toBeNull();
      expect(result.error).toBe('Prompt not found: unknown_prompt');
    });
  });

  describe('generatePublicName', () => {
    it('should generate public name with namespace strategy', () => {
      const toolRegistry = createMockToolRegistry();
      const resourceRegistry = createMockResourceRegistry();
      const promptRegistry = createMockPromptRegistry();

      const router = new McpRouter(
        toolRegistry,
        resourceRegistry,
        promptRegistry,
      );
      const result = router.generatePublicName('server1', 'tool_name');

      expect(result).toBe('tool_name_server1');
    });

    it('should use custom naming config', () => {
      const toolRegistry = createMockToolRegistry();
      const resourceRegistry = createMockResourceRegistry();
      const promptRegistry = createMockPromptRegistry();

      const router = new McpRouter(
        toolRegistry,
        resourceRegistry,
        promptRegistry,
        {
          namingConfig: {
            strategy: 'alias',
            separator: '__',
            format: '{serverId}__{toolName}',
          },
        },
      );

      const result = router.generatePublicName('server1', 'tool_name');
      expect(result).toBe('server1__tool_name');
    });
  });

  describe('parsePublicName', () => {
    it('should parse public name with namespace strategy', () => {
      const toolRegistry = createMockToolRegistry();
      const resourceRegistry = createMockResourceRegistry();
      const promptRegistry = createMockPromptRegistry();

      const router = new McpRouter(
        toolRegistry,
        resourceRegistry,
        promptRegistry,
      );
      const result = router.parsePublicName('tool_name_server1');

      expect(result).toEqual({
        serverId: 'server1',
        originalName: 'tool_name',
      });
    });

    it('should return null for invalid name', () => {
      const toolRegistry = createMockToolRegistry();
      const resourceRegistry = createMockResourceRegistry();
      const promptRegistry = createMockPromptRegistry();

      const router = new McpRouter(
        toolRegistry,
        resourceRegistry,
        promptRegistry,
      );
      const result = router.parsePublicName('invalidname');

      expect(result).toBeNull();
    });
  });

  describe('getNamingConfig', () => {
    it('should return current naming config', () => {
      const toolRegistry = createMockToolRegistry();
      const resourceRegistry = createMockResourceRegistry();
      const promptRegistry = createMockPromptRegistry();

      const router = new McpRouter(
        toolRegistry,
        resourceRegistry,
        promptRegistry,
      );
      const config = router.getNamingConfig();

      expect(config).toEqual({
        strategy: 'namespace',
        separator: '_',
        format: '{serverId}_{toolName}',
      });
    });

    it('should return copy of config', () => {
      const toolRegistry = createMockToolRegistry();
      const resourceRegistry = createMockResourceRegistry();
      const promptRegistry = createMockPromptRegistry();

      const router = new McpRouter(
        toolRegistry,
        resourceRegistry,
        promptRegistry,
      );
      const config1 = router.getNamingConfig();
      const config2 = router.getNamingConfig();

      expect(config1).not.toBe(config2);
      expect(config1).toEqual(config2);
    });
  });

  describe('updateNamingConfig', () => {
    it('should update naming config', () => {
      const toolRegistry = createMockToolRegistry();
      const resourceRegistry = createMockResourceRegistry();
      const promptRegistry = createMockPromptRegistry();

      const router = new McpRouter(
        toolRegistry,
        resourceRegistry,
        promptRegistry,
      );

      router.updateNamingConfig({
        strategy: 'alias',
        separator: '__',
      });

      const config = router.getNamingConfig();
      expect(config.strategy).toBe('alias');
      expect(config.separator).toBe('__');
      expect(config.format).toBe('{serverId}_{toolName}'); // Unchanged
    });
  });

  describe('getStats', () => {
    it('should return router statistics with metrics', () => {
      const toolRegistry = createMockToolRegistry();
      const resourceRegistry = createMockResourceRegistry();
      const promptRegistry = createMockPromptRegistry();

      const router = new McpRouter(
        toolRegistry,
        resourceRegistry,
        promptRegistry,
      );
      const stats = router.getStats();

      expect(stats).toMatchObject({
        toolCount: 5,
        resourceCount: 3,
        promptCount: 2,
        namingStrategy: 'namespace',
        totalRequests: 0,
      });
      expect(stats.metrics).toBeDefined();
      expect(stats.metrics.tools).toEqual({
        success: 0,
        failure: 0,
        totalTime: 0,
      });
    });
  });

  describe('getMetrics', () => {
    it('should return performance metrics', () => {
      const toolRegistry = createMockToolRegistry();
      const resourceRegistry = createMockResourceRegistry();
      const promptRegistry = createMockPromptRegistry();

      vi.mocked(toolRegistry.resolveTool).mockReturnValue({
        serverId: 'server1',
        originalName: 'tool',
      });

      const router = new McpRouter(
        toolRegistry,
        resourceRegistry,
        promptRegistry,
      );

      // Make some successful tool calls
      router.routeTool('tool1');
      router.routeTool('tool2');

      // Make a failed tool call
      vi.mocked(toolRegistry.resolveTool).mockReturnValue(undefined);
      router.routeTool('unknown');

      const metrics = router.getMetrics();

      expect(metrics.tools.success).toBe(2);
      expect(metrics.tools.failure).toBe(1);
      expect(metrics.tools.avgTime).toBeGreaterThanOrEqual(0);
    });
  });

  describe('resetMetrics', () => {
    it('should reset all metrics', () => {
      const toolRegistry = createMockToolRegistry();
      const resourceRegistry = createMockResourceRegistry();
      const promptRegistry = createMockPromptRegistry();

      vi.mocked(toolRegistry.resolveTool).mockReturnValue({
        serverId: 'server1',
        originalName: 'tool',
      });

      const router = new McpRouter(
        toolRegistry,
        resourceRegistry,
        promptRegistry,
      );

      // Make some calls
      router.routeTool('tool1');
      router.routeTool('tool2');

      // Reset metrics
      router.resetMetrics();

      const metrics = router.getMetrics();
      expect(metrics.tools.success).toBe(0);
      expect(metrics.tools.failure).toBe(0);
      expect(metrics.tools.totalTime).toBe(0);
    });
  });

  describe('routeWithFunctionalApproach', () => {
    it('should route using pure functional approach', () => {
      const toolRegistry = createMockToolRegistry();
      const resourceRegistry = createMockResourceRegistry();
      const promptRegistry = createMockPromptRegistry();

      const router = new McpRouter(
        toolRegistry,
        resourceRegistry,
        promptRegistry,
      );

      const registryState = new Map([
        ['tool_server1', { serverId: 'server1', originalName: 'tool' }],
      ]);

      const result = router.routeWithFunctionalApproach(
        'tool_server1',
        registryState,
      );

      expect(result.target).toEqual({
        serverId: 'server1',
        originalName: 'tool',
      });
    });
  });

  describe('debug logging', () => {
    it('should log with structured context when debug is enabled', () => {
      const consoleSpy = vi
        .spyOn(console, 'debug')
        .mockImplementation(() => {});

      const toolRegistry = createMockToolRegistry();
      const resourceRegistry = createMockResourceRegistry();
      const promptRegistry = createMockPromptRegistry();

      vi.mocked(toolRegistry.resolveTool).mockReturnValue({
        serverId: 'server1',
        originalName: 'tool',
      });

      const router = new McpRouter(
        toolRegistry,
        resourceRegistry,
        promptRegistry,
        {
          debug: true,
        },
      );

      router.routeTool('tool_server1');

      // Check that structured logging is being used
      expect(consoleSpy).toHaveBeenCalled();
      const calls = consoleSpy.mock.calls;

      // Should have logged routing start with context
      expect(calls[0][0]).toContain('[McpRouter] Routing tool:');
      expect(calls[0][1]).toContain('tool_server1');

      // Should have logged success with context
      expect(calls[1][0]).toContain('[McpRouter] Tool routed successfully:');
      expect(calls[1][1]).toContain('server1');

      consoleSpy.mockRestore();
    });

    it('should not log when debug is disabled', () => {
      const consoleSpy = vi
        .spyOn(console, 'debug')
        .mockImplementation(() => {});

      const toolRegistry = createMockToolRegistry();
      const resourceRegistry = createMockResourceRegistry();
      const promptRegistry = createMockPromptRegistry();

      const router = new McpRouter(
        toolRegistry,
        resourceRegistry,
        promptRegistry,
        {
          debug: false,
        },
      );

      router.routeTool('tool_server1');

      expect(consoleSpy).not.toHaveBeenCalled();

      consoleSpy.mockRestore();
    });
  });
});
