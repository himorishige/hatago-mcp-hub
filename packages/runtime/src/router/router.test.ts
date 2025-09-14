/**
 * Tests for simplified McpRouter
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { PromptRegistry } from '../registry/prompt-registry.js';
import { ResourceRegistry } from '../registry/resource-registry.js';
import { ToolRegistry } from '../registry/tool-registry.js';
import { McpRouter, createRouter } from './router.js';

describe('McpRouter', () => {
  let toolRegistry: ToolRegistry;
  let resourceRegistry: ResourceRegistry;
  let promptRegistry: PromptRegistry;
  let router: McpRouter;

  beforeEach(() => {
    toolRegistry = new ToolRegistry();
    resourceRegistry = new ResourceRegistry();
    promptRegistry = new PromptRegistry();
    router = new McpRouter(toolRegistry, resourceRegistry, promptRegistry);
  });

  describe('Tool Routing', () => {
    beforeEach(() => {
      // Register test tools
      toolRegistry.registerServerTools('server1', [
        {
          name: 'echo',
          description: 'Echo tool',
          inputSchema: { type: 'object' }
        },
        {
          name: 'calculator',
          description: 'Math tool',
          inputSchema: { type: 'object' }
        }
      ]);

      toolRegistry.registerServerTools('server2', [
        {
          name: 'fetch',
          description: 'Fetch tool',
          inputSchema: { type: 'object' }
        }
      ]);
    });

    it('should route tool to correct server', () => {
      const result = router.routeTool('server1_echo');
      expect(result).toEqual({
        serverId: 'server1',
        originalName: 'echo'
      });
    });

    it('should return undefined for unknown tool', () => {
      const result = router.routeTool('unknown_tool');
      expect(result).toBeUndefined();
    });

    it('should route tools from different servers', () => {
      const result1 = router.routeTool('server1_calculator');
      expect(result1).toEqual({
        serverId: 'server1',
        originalName: 'calculator'
      });

      const result2 = router.routeTool('server2_fetch');
      expect(result2).toEqual({
        serverId: 'server2',
        originalName: 'fetch'
      });
    });

    it('should get all tools', () => {
      const tools = router.getAllTools();
      expect(tools).toHaveLength(3);
      expect(tools.map((t) => t.name)).toEqual([
        'server1_echo',
        'server1_calculator',
        'server2_fetch'
      ]);
    });
  });

  describe('Resource Routing', () => {
    beforeEach(() => {
      // Register test resources
      resourceRegistry.registerServerResources('server1', [
        {
          uri: 'file:///path/to/file1',
          name: 'File 1',
          mimeType: 'text/plain'
        },
        {
          uri: 'https://example.com/api',
          name: 'API Resource',
          mimeType: 'application/json'
        }
      ]);

      resourceRegistry.registerServerResources('server2', [
        {
          uri: 'memory://data',
          name: 'Memory Data',
          mimeType: 'application/octet-stream'
        }
      ]);
    });

    it('should route resource to correct server', () => {
      const result = router.routeResource('file:///path/to/file1');
      expect(result).toEqual({
        serverId: 'server1',
        originalUri: 'file:///path/to/file1'
      });
    });

    it('should return undefined for unknown resource', () => {
      const result = router.routeResource('unknown://resource');
      expect(result).toBeUndefined();
    });

    it('should route resources from different servers', () => {
      const result1 = router.routeResource('https://example.com/api');
      expect(result1).toEqual({
        serverId: 'server1',
        originalUri: 'https://example.com/api'
      });

      const result2 = router.routeResource('memory://data');
      expect(result2).toEqual({
        serverId: 'server2',
        originalUri: 'memory://data'
      });
    });

    it('should get all resources', () => {
      const resources = router.getAllResources();
      expect(resources).toHaveLength(3);
      expect(resources.map((r) => r.uri)).toEqual([
        'file:///path/to/file1',
        'https://example.com/api',
        'memory://data'
      ]);
    });
  });

  describe('Prompt Routing', () => {
    beforeEach(() => {
      // Register test prompts
      promptRegistry.registerServerPrompts('server1', [
        {
          name: 'greeting',
          description: 'Generate greeting'
        },
        {
          name: 'summary',
          description: 'Generate summary'
        }
      ]);

      promptRegistry.registerServerPrompts('server2', [
        {
          name: 'translate',
          description: 'Translate text'
        }
      ]);
    });

    it('should route prompt to correct server', () => {
      const result = router.routePrompt('server1_greeting');
      expect(result).toEqual({
        serverId: 'server1',
        originalName: 'greeting'
      });
    });

    it('should return undefined for unknown prompt', () => {
      const result = router.routePrompt('unknown_prompt');
      expect(result).toBeUndefined();
    });

    it('should route prompts from different servers', () => {
      const result1 = router.routePrompt('server1_summary');
      expect(result1).toEqual({
        serverId: 'server1',
        originalName: 'summary'
      });

      const result2 = router.routePrompt('server2_translate');
      expect(result2).toEqual({
        serverId: 'server2',
        originalName: 'translate'
      });
    });

    it('should get all prompts', () => {
      const prompts = router.getAllPrompts();
      expect(prompts).toHaveLength(3);
      expect(prompts.map((p) => p.name)).toEqual([
        'server1_greeting',
        'server1_summary',
        'server2_translate'
      ]);
    });
  });

  describe('Public Name Generation', () => {
    it('should generate public name with underscore separator', () => {
      const publicName = router.generatePublicName('my-server', 'my-tool');
      expect(publicName).toBe('my-server_my-tool');
    });

    it('should replace dots with underscores', () => {
      const publicName = router.generatePublicName('server.name', 'tool.name');
      expect(publicName).toBe('server_name_tool_name');
    });

    it('should handle special characters', () => {
      const publicName = router.generatePublicName('server-1', 'tool_2');
      expect(publicName).toBe('server-1_tool_2');
    });
  });

  describe('Factory Function', () => {
    it('should create router instance', () => {
      const newRouter = createRouter(toolRegistry, resourceRegistry, promptRegistry);
      expect(newRouter).toBeInstanceOf(McpRouter);
    });

    it('should create functional router', () => {
      const newRouter = createRouter(toolRegistry, resourceRegistry, promptRegistry);

      toolRegistry.registerServerTools('test', [{ name: 'tool', inputSchema: { type: 'object' } }]);

      const result = newRouter.routeTool('test_tool');
      expect(result).toEqual({
        serverId: 'test',
        originalName: 'tool'
      });
    });
  });
});
