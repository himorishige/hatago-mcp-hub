/**
 * Compatibility wrapper for thin tool invoker
 *
 * Provides backward compatibility with existing ToolInvoker interface
 * while using the thin functional implementation underneath
 */

import type { Tool } from '@modelcontextprotocol/sdk/types.js';
import {
  createHandlerRegistry,
  registerHandler,
  invokeTool,
  createToolPipeline,
  createConcurrencyLimiter,
  type ThinToolHandler,
  type HandlerRegistry,
  type ToolCallResult
} from './thin-invoker.js';

/**
 * Create a compatible thin tool invoker with all expected methods
 * This bridges the gap between the old class-based API and new functional API
 */
export function createCompatibleThinToolInvoker(
  options: {
    timeout?: number;
    maxConcurrency?: number;
    toolRegistry?: any; // Reference to tool registry for listTools
  } = {}
) {
  let registry = createHandlerRegistry();
  const limiter = options.maxConcurrency ? createConcurrencyLimiter(options.maxConcurrency) : null;
  const pipeline = createToolPipeline();

  // Track registered handlers for unregister support
  const registeredHandlers = new Map<string, ThinToolHandler>();

  return {
    registerHandler: (toolName: string, handler: ThinToolHandler) => {
      registry = registerHandler(registry, toolName, handler);
      registeredHandlers.set(toolName, handler);
    },

    unregisterHandler: (toolName: string) => {
      // Remove from registry by creating new registry without this handler
      const newRegistry = createHandlerRegistry();
      registeredHandlers.delete(toolName);

      // Re-register all handlers except the one being removed
      for (const [name, handler] of registeredHandlers) {
        if (name !== toolName) {
          registerHandler(newRegistry, name, handler);
        }
      }
      registry = newRegistry;
    },

    callTool: async (
      sessionId: string, // May be ignored in thin implementation
      toolName: string,
      args: unknown,
      context?: {
        sessionId?: string;
        progressCallback?: (progress: number, total?: number, message?: string) => void;
      }
    ): Promise<ToolCallResult> => {
      const progressCallback = context?.progressCallback;

      // Apply concurrency limiting if configured
      if (limiter) {
        await limiter.acquire();
        try {
          return await pipeline(
            registry,
            { toolName, args, timeout: options.timeout },
            progressCallback
          );
        } finally {
          limiter.release();
        }
      }

      return await pipeline(
        registry,
        { toolName, args, timeout: options.timeout },
        progressCallback
      );
    },

    // List all available tools
    // This requires access to the tool registry
    listTools: (): Tool[] => {
      if (options.toolRegistry && typeof options.toolRegistry.getAllTools === 'function') {
        return options.toolRegistry.getAllTools();
      }
      // Return empty array if no registry available
      return [];
    },

    clear: () => {
      registry = createHandlerRegistry();
      registeredHandlers.clear();
    }
  };
}

/**
 * Type for the compatible tool invoker
 */
export type CompatibleThinToolInvoker = ReturnType<typeof createCompatibleThinToolInvoker>;
