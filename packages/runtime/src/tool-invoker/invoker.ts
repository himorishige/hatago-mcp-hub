/**
 * Tool Invoker - Responsible for executing tools
 */

import type { ToolRegistry } from '../registry/tool-registry.js';
import type {
  ToolCallResult,
  ToolHandler,
  ToolInvokerOptions,
  ToolWithHandler,
} from './types.js';

// SSE Manager interface for progress notifications
interface SSEManager {
  sendProgress(progressToken: string, progress: any): void;
}

/**
 * Tool Invoker - Executes tools registered in the registry
 */
export class ToolInvoker {
  private handlers = new Map<string, ToolHandler>();
  private toolRegistry: ToolRegistry;
  private options: ToolInvokerOptions;
  private sseManager?: SSEManager;

  constructor(
    toolRegistry: ToolRegistry,
    options: ToolInvokerOptions = {},
    sseManager?: SSEManager,
  ) {
    this.toolRegistry = toolRegistry;
    this.sseManager = sseManager;
    this.options = {
      timeout: options.timeout || 30000,
      retryCount: options.retryCount || 0,
      retryDelay: options.retryDelay || 1000,
    };
  }

  /**
   * Register a tool handler
   */
  registerHandler(toolName: string, handler: ToolHandler): void {
    this.handlers.set(toolName, handler);
  }

  /**
   * Unregister a tool handler
   */
  unregisterHandler(toolName: string): void {
    this.handlers.delete(toolName);
  }

  /**
   * Call a tool by name
   */
  async callTool(
    _sessionId: string,
    toolName: string,
    args: any,
    options?: Partial<ToolInvokerOptions>,
  ): Promise<ToolCallResult> {
    const opts = { ...this.options, ...options };

    // Get handler for the tool
    const handler = this.handlers.get(toolName);

    if (!handler) {
      // Check if tool exists in registry
      const tool = this.toolRegistry.getTool(toolName);

      if (!tool) {
        return {
          content: [
            {
              type: 'text',
              text: `Tool not found: ${toolName}`,
            },
          ],
          isError: true,
        };
      }

      return {
        content: [
          {
            type: 'text',
            text: `No handler registered for tool: ${toolName}`,
          },
        ],
        isError: true,
      };
    }

    try {
      // Create progress handler if progress token provided
      const progressHandler =
        options?.progressToken && this.sseManager
          ? (progress: number, total?: number, message?: string) => {
              this.sseManager?.sendProgress(options.progressToken!, {
                progressToken: options.progressToken,
                progress,
                total,
                message,
              });
            }
          : undefined;

      // Execute with timeout and progress support
      const result = await this.executeWithTimeout(
        () => handler(args, progressHandler),
        opts.timeout!,
      );

      // Format result
      if (typeof result === 'string') {
        return {
          content: [
            {
              type: 'text',
              text: result,
            },
          ],
        };
      }

      // If result is already in the correct format
      if (result && typeof result === 'object' && 'content' in result) {
        return result as ToolCallResult;
      }

      // Convert other objects to JSON
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(result, null, 2),
          },
        ],
      };
    } catch (error) {
      return {
        content: [
          {
            type: 'text',
            text: `Error calling tool ${toolName}: ${error instanceof Error ? error.message : String(error)}`,
          },
        ],
        isError: true,
      };
    }
  }

  /**
   * Execute handler with timeout
   */
  private async executeWithTimeout<T>(
    handler: () => Promise<any>,
    timeout: number,
  ): Promise<T> {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        reject(new Error(`Tool execution timed out after ${timeout}ms`));
      }, timeout);

      handler()
        .then((result) => {
          clearTimeout(timer);
          resolve(result);
        })
        .catch((error) => {
          clearTimeout(timer);
          reject(error);
        });
    });
  }

  /**
   * Register a tool with its handler
   */
  registerToolWithHandler(serverId: string, tool: ToolWithHandler): void {
    // Extract the Tool part without the handler
    const { handler, ...toolWithoutHandler } = tool;

    // Register in registry
    this.toolRegistry.registerServerTools(serverId, [toolWithoutHandler]);

    // Get the public name that the registry assigned
    const registeredTools = this.toolRegistry.getServerTools(serverId);
    const registeredTool = registeredTools.find((t) =>
      t.name.endsWith(toolWithoutHandler.name),
    );

    if (registeredTool) {
      this.registerHandler(registeredTool.name, handler);
    }
  }

  /**
   * List available tools
   */
  listTools(_sessionId?: string): any[] {
    return this.toolRegistry.getAllTools();
  }

  /**
   * Clear all handlers for a server
   */
  clearServerHandlers(serverId: string): void {
    const tools = this.toolRegistry.getServerTools(serverId);
    for (const tool of tools) {
      this.handlers.delete(tool.name);
    }
  }
}
