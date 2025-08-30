/**
 * Tests for ToolInvoker - tool execution with handlers
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ToolRegistry } from '../registry/tool-registry.js';
import { ToolInvoker } from './invoker.js';

describe('ToolInvoker', () => {
  let toolRegistry: ToolRegistry;
  let toolInvoker: ToolInvoker;
  let mockSseManager: any;

  beforeEach(() => {
    toolRegistry = new ToolRegistry({
      namingConfig: {
        strategy: 'namespace',
        separator: '_',
      },
    });

    mockSseManager = {
      sendProgress: vi.fn(),
    };

    toolInvoker = new ToolInvoker(
      toolRegistry,
      {
        timeout: 5000,
        retryCount: 2,
        retryDelay: 100,
      },
      mockSseManager,
    );
  });

  afterEach(() => {
    vi.clearAllTimers();
    vi.useRealTimers();
  });

  describe('Handler Registration', () => {
    it('should register and unregister tool handler', () => {
      const handler = vi.fn();

      toolInvoker.registerHandler('test_tool', handler);

      // Handler should be registered
      const hasHandler = (toolInvoker as any).handlers.has('test_tool');
      expect(hasHandler).toBe(true);

      // Unregister handler
      toolInvoker.unregisterHandler('test_tool');
      const hasHandlerAfter = (toolInvoker as any).handlers.has('test_tool');
      expect(hasHandlerAfter).toBe(false);
    });

    it('should register tool with handler', () => {
      const toolWithHandler = {
        name: 'calculator',
        description: 'Calculate things',
        inputSchema: { type: 'object', properties: {} },
        handler: vi.fn().mockResolvedValue('42'),
      };

      toolInvoker.registerToolWithHandler('math-server', toolWithHandler);

      // Tool should be registered in registry
      const tools = toolRegistry.getAllTools();
      expect(tools).toHaveLength(1);
      expect(tools[0].name).toBe('math-server_calculator');

      // Handler should be registered with the public name
      const hasHandler = (toolInvoker as any).handlers.has(
        'math-server_calculator',
      );
      expect(hasHandler).toBe(true);
    });

    it('should overwrite existing handler', () => {
      const handler1 = vi.fn();
      const handler2 = vi.fn();

      toolInvoker.registerHandler('tool', handler1);
      toolInvoker.registerHandler('tool', handler2);

      const registeredHandler = (toolInvoker as any).handlers.get('tool');
      expect(registeredHandler).toBe(handler2);
    });
  });

  describe('Tool Execution', () => {
    it('should execute tool successfully', async () => {
      const handler = vi.fn().mockResolvedValue({
        content: [
          {
            type: 'text',
            text: 'Success!',
          },
        ],
      });

      // Register tool in registry first
      toolRegistry.registerServerTools('test-server', [
        {
          name: 'echo_tool',
          description: 'Echo tool',
          inputSchema: { type: 'object' },
        },
      ]);

      // Register handler with public name
      toolInvoker.registerHandler('test-server_echo_tool', handler);

      const result = await toolInvoker.callTool(
        'session-123',
        'test-server_echo_tool',
        { message: 'Hello' },
      );

      expect(handler).toHaveBeenCalledWith(
        { message: 'Hello' },
        undefined, // No progress callback without progressToken
      );

      expect(result).toMatchObject({
        content: [
          {
            type: 'text',
            text: 'Success!',
          },
        ],
      });
    });

    it('should pass arguments correctly', async () => {
      const handler = vi.fn().mockImplementation(async (args) => ({
        content: [
          {
            type: 'text',
            text: `Received: ${JSON.stringify(args)}`,
          },
        ],
      }));

      toolInvoker.registerHandler('test_args', handler);

      const args = { a: 1, b: 'test', c: true };
      const result = await toolInvoker.callTool('session', 'test_args', args);

      expect(handler).toHaveBeenCalledWith(args, undefined);
      expect(result.content[0].text).toContain(JSON.stringify(args));
    });

    it('should return error for unregistered tool', async () => {
      const result = await toolInvoker.callTool('session', 'unknown_tool', {});

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain('Tool not found: unknown_tool');
    });

    it('should return error for tool without handler', async () => {
      // Register tool in registry but no handler
      toolRegistry.registerServerTools('server', [
        {
          name: 'no_handler',
          description: 'Tool without handler',
          inputSchema: { type: 'object' },
        },
      ]);

      const result = await toolInvoker.callTool(
        'session',
        'server_no_handler',
        {},
      );

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain(
        'No handler registered for tool: server_no_handler',
      );
    });

    it('should handle string result from handler', async () => {
      const handler = vi.fn().mockResolvedValue('Simple string result');

      toolInvoker.registerHandler('string_result', handler);

      const result = await toolInvoker.callTool('session', 'string_result', {});

      expect(result).toMatchObject({
        content: [
          {
            type: 'text',
            text: 'Simple string result',
          },
        ],
      });
    });

    it('should handle object result without content field', async () => {
      const handler = vi.fn().mockResolvedValue({
        data: 'some data',
        value: 42,
      });

      toolInvoker.registerHandler('object_result', handler);

      const result = await toolInvoker.callTool('session', 'object_result', {});

      expect(result).toMatchObject({
        content: [
          {
            type: 'text',
            text: expect.stringContaining('"data": "some data"'),
          },
        ],
      });
    });
  });

  describe('Error Handling', () => {
    it('should handle tool execution error', async () => {
      const handler = vi.fn().mockRejectedValue(new Error('Tool failed'));

      toolInvoker.registerHandler('failing_tool', handler);

      const result = await toolInvoker.callTool('session', 'failing_tool', {});

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain(
        'Error calling tool failing_tool: Tool failed',
      );
    });

    it('should handle non-Error thrown by handler', async () => {
      const handler = vi.fn().mockRejectedValue('String error');

      toolInvoker.registerHandler('string_error', handler);

      const result = await toolInvoker.callTool('session', 'string_error', {});

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain(
        'Error calling tool string_error: String error',
      );
    });
  });

  describe('Timeout Handling', () => {
    beforeEach(() => {
      vi.useFakeTimers();
    });

    it('should timeout long-running tools', async () => {
      const handler = vi
        .fn()
        .mockImplementation(
          () =>
            new Promise((resolve) =>
              setTimeout(() => resolve('Too late'), 10000),
            ),
        );

      toolInvoker.registerHandler('slow_tool', handler);

      const promise = toolInvoker.callTool('session', 'slow_tool', {});

      // Advance time past timeout
      await vi.advanceTimersByTimeAsync(6000);

      const result = await promise;
      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain(
        'Tool execution timed out after 5000ms',
      );
    });

    it('should respect custom timeout', async () => {
      const customInvoker = new ToolInvoker(toolRegistry, {
        timeout: 1000, // 1 second timeout
      });

      const handler = vi
        .fn()
        .mockImplementation(
          () =>
            new Promise((resolve) => setTimeout(() => resolve('Done'), 2000)),
        );

      customInvoker.registerHandler('custom_timeout', handler);

      const promise = customInvoker.callTool('session', 'custom_timeout', {});

      // Advance time past custom timeout
      await vi.advanceTimersByTimeAsync(1500);

      const result = await promise;
      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain(
        'Tool execution timed out after 1000ms',
      );
    });

    it('should complete before timeout', async () => {
      const handler = vi.fn().mockImplementation(
        () =>
          new Promise((resolve) =>
            setTimeout(
              () =>
                resolve({
                  content: [{ type: 'text', text: 'Quick result' }],
                }),
              1000,
            ),
          ),
      );

      toolInvoker.registerHandler('quick_tool', handler);

      const promise = toolInvoker.callTool('session', 'quick_tool', {});

      // Advance time but not past timeout
      await vi.advanceTimersByTimeAsync(1000);

      const result = await promise;
      expect(result.isError).toBeFalsy();
      expect(result.content[0].text).toBe('Quick result');
    });
  });

  describe('Progress Notifications', () => {
    it('should send progress updates', async () => {
      const handler = vi
        .fn()
        .mockImplementation(async (_args, progressCallback) => {
          if (progressCallback) {
            progressCallback(25, 100, 'Starting');
            progressCallback(50, 100, 'Halfway');
            progressCallback(100, 100, 'Complete');
          }

          return { content: [{ type: 'text', text: 'Done with progress' }] };
        });

      toolInvoker.registerHandler('progress_tool', handler);

      const result = await toolInvoker.callTool(
        'session',
        'progress_tool',
        {},
        { progressToken: 'progress-123' },
      );

      expect(result.content[0].text).toBe('Done with progress');

      // Should have sent progress updates
      expect(mockSseManager.sendProgress).toHaveBeenCalledTimes(3);
      expect(mockSseManager.sendProgress).toHaveBeenNthCalledWith(
        1,
        'progress-123',
        {
          progressToken: 'progress-123',
          progress: 25,
          total: 100,
          message: 'Starting',
        },
      );
      expect(mockSseManager.sendProgress).toHaveBeenNthCalledWith(
        2,
        'progress-123',
        {
          progressToken: 'progress-123',
          progress: 50,
          total: 100,
          message: 'Halfway',
        },
      );
      expect(mockSseManager.sendProgress).toHaveBeenNthCalledWith(
        3,
        'progress-123',
        {
          progressToken: 'progress-123',
          progress: 100,
          total: 100,
          message: 'Complete',
        },
      );
    });

    it('should handle progress without token', async () => {
      const handler = vi
        .fn()
        .mockImplementation(async (_args, progressCallback) => {
          // Should not have progress callback without token
          expect(progressCallback).toBeUndefined();
          return { content: [{ type: 'text', text: 'Done' }] };
        });

      toolInvoker.registerHandler('no_token_progress', handler);

      const result = await toolInvoker.callTool(
        'session',
        'no_token_progress',
        {},
      );
      expect(result.content[0].text).toBe('Done');

      // No progress should be sent
      expect(mockSseManager.sendProgress).not.toHaveBeenCalled();
    });

    it('should handle progress without SSE manager', async () => {
      const invokerNoSse = new ToolInvoker(toolRegistry, { timeout: 5000 });

      const handler = vi
        .fn()
        .mockImplementation(async (_args, progressCallback) => {
          // Should not have progress callback without SSE manager
          expect(progressCallback).toBeUndefined();
          return { content: [{ type: 'text', text: 'No SSE' }] };
        });

      invokerNoSse.registerHandler('no_sse_tool', handler);

      const result = await invokerNoSse.callTool(
        'session',
        'no_sse_tool',
        {},
        { progressToken: 'ignored' },
      );

      expect(result.content[0].text).toBe('No SSE');
    });
  });

  describe('Edge Cases', () => {
    it('should handle empty arguments', async () => {
      const handler = vi.fn().mockResolvedValue({
        content: [{ type: 'text', text: 'No args needed' }],
      });

      toolInvoker.registerHandler('no_args', handler);

      const result = await toolInvoker.callTool('session', 'no_args', {});
      expect(result.content[0].text).toBe('No args needed');
      expect(handler).toHaveBeenCalledWith({}, undefined);
    });

    it('should handle null/undefined arguments', async () => {
      const handler = vi.fn().mockResolvedValue({
        content: [{ type: 'text', text: 'Handled null' }],
      });

      toolInvoker.registerHandler('null_args', handler);

      const result = await toolInvoker.callTool(
        'session',
        'null_args',
        null as any,
      );
      expect(result.content[0].text).toBe('Handled null');
    });

    it('should handle very large result', async () => {
      const largeText = 'x'.repeat(100000); // 100KB of text
      const handler = vi.fn().mockResolvedValue({
        content: [{ type: 'text', text: largeText }],
      });

      toolInvoker.registerHandler('large_result', handler);

      const result = await toolInvoker.callTool('session', 'large_result', {});
      expect(result.content[0].text).toBe(largeText);
    });

    it('should handle special characters in tool name', async () => {
      const handler = vi.fn().mockResolvedValue({
        content: [{ type: 'text', text: 'Special chars work' }],
      });

      const specialName = 'tool-with.special_chars!';
      toolInvoker.registerHandler(specialName, handler);

      const result = await toolInvoker.callTool('session', specialName, {});
      expect(result.content[0].text).toBe('Special chars work');
    });
  });

  describe('Multiple Tools', () => {
    it('should handle multiple tools with different handlers', async () => {
      const handler1 = vi.fn().mockResolvedValue({
        content: [{ type: 'text', text: 'Tool 1 result' }],
      });

      const handler2 = vi.fn().mockResolvedValue({
        content: [{ type: 'text', text: 'Tool 2 result' }],
      });

      toolInvoker.registerHandler('tool1', handler1);
      toolInvoker.registerHandler('tool2', handler2);

      const result1 = await toolInvoker.callTool('session', 'tool1', {});
      const result2 = await toolInvoker.callTool('session', 'tool2', {});

      expect(result1.content[0].text).toBe('Tool 1 result');
      expect(result2.content[0].text).toBe('Tool 2 result');
      expect(handler1).toHaveBeenCalledTimes(1);
      expect(handler2).toHaveBeenCalledTimes(1);
    });

    it('should handle concurrent tool calls', async () => {
      const handler = vi.fn().mockImplementation(async (args) => {
        await new Promise((resolve) => setTimeout(resolve, 100));
        return {
          content: [{ type: 'text', text: `Result for ${args.id}` }],
        };
      });

      toolInvoker.registerHandler('concurrent_tool', handler);

      const promises = [
        toolInvoker.callTool('session', 'concurrent_tool', { id: 1 }),
        toolInvoker.callTool('session', 'concurrent_tool', { id: 2 }),
        toolInvoker.callTool('session', 'concurrent_tool', { id: 3 }),
      ];

      const results = await Promise.all(promises);

      expect(results[0].content[0].text).toBe('Result for 1');
      expect(results[1].content[0].text).toBe('Result for 2');
      expect(results[2].content[0].text).toBe('Result for 3');
      expect(handler).toHaveBeenCalledTimes(3);
    });
  });
});
