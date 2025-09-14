/**
 * Lean tool invoker - functional implementation
 *
 * Following Hatago philosophy: "Don't transform, relay"
 * Simple function composition without complex state management
 */

import type { ToolCallResult } from '@himorishige/hatago-core';

// Re-export for compatibility wrapper
export type { ToolCallResult };

/**
 * Tool handler function type
 */
export type LeanToolHandler = (
  args: unknown,
  progressCallback?: (progress: number, total?: number, message?: string) => void
) => Promise<unknown>;

/**
 * Tool invocation context
 */
export type ToolContext = {
  toolName: string;
  args: unknown;
  timeout?: number;
  progressToken?: string;
};

/**
 * Tool invocation result
 */
export type InvocationResult = {
  success: boolean;
  result?: unknown;
  error?: Error;
  duration: number;
};

/**
 * Simple handler registry
 */
export type HandlerRegistry = Map<string, LeanToolHandler>;

/**
 * Create a handler registry
 */
export function createHandlerRegistry(): HandlerRegistry {
  return new Map();
}

/**
 * Register a tool handler
 */
export function registerHandler(
  registry: HandlerRegistry,
  toolName: string,
  handler: LeanToolHandler
): HandlerRegistry {
  const newRegistry = new Map(registry);
  newRegistry.set(toolName, handler);
  return newRegistry;
}

/**
 * Execute with timeout (pure function)
 */
export async function executeWithTimeout<T>(fn: () => Promise<T>, timeoutMs: number): Promise<T> {
  return Promise.race([
    fn(),
    new Promise<T>((_, reject) =>
      setTimeout(() => reject(new Error(`Timeout after ${timeoutMs}ms`)), timeoutMs)
    )
  ]);
}

/**
 * Invoke a tool (pure function)
 */
export async function invokeTool(
  registry: HandlerRegistry,
  context: ToolContext,
  progressCallback?: (progress: number, total?: number, message?: string) => void
): Promise<InvocationResult> {
  const startTime = Date.now();

  try {
    const handler = registry.get(context.toolName);

    if (!handler) {
      return {
        success: false,
        error: new Error(`No handler for tool: ${context.toolName}`),
        duration: Date.now() - startTime
      };
    }

    // Execute with optional timeout
    const execute = () => handler(context.args, progressCallback);
    const result = context.timeout
      ? await executeWithTimeout(execute, context.timeout)
      : await execute();

    return {
      success: true,
      result,
      duration: Date.now() - startTime
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error : new Error(String(error)),
      duration: Date.now() - startTime
    };
  }
}

/**
 * Format result as ToolCallResult
 */
export function formatResult(invocation: InvocationResult): ToolCallResult {
  if (!invocation.success) {
    return {
      success: false,
      error: invocation.error
    };
  }

  return {
    success: true,
    result: invocation.result
  };
}

/**
 * Create a tool invocation pipeline
 */
export function createToolPipeline(
  validate?: (context: ToolContext) => ToolContext | Promise<ToolContext>,
  transform?: (result: InvocationResult) => InvocationResult | Promise<InvocationResult>
) {
  return async (
    registry: HandlerRegistry,
    context: ToolContext,
    progressCallback?: (progress: number, total?: number, message?: string) => void
  ): Promise<ToolCallResult> => {
    // Optional validation
    const validatedContext = validate ? await validate(context) : context;

    // Invoke tool
    const result = await invokeTool(registry, validatedContext, progressCallback);

    // Optional transformation
    const transformed = transform ? await transform(result) : result;

    // Format result
    return formatResult(transformed);
  };
}

/**
 * Simple concurrency limiter using Promise queue
 */
export function createConcurrencyLimiter(maxConcurrent: number) {
  let inFlight = 0;
  const queue: Array<() => void> = [];

  const acquire = async (): Promise<void> => {
    if (inFlight < maxConcurrent) {
      inFlight++;
      return;
    }

    await new Promise<void>((resolve) => {
      queue.push(() => {
        inFlight++;
        resolve();
      });
    });
  };

  const release = (): void => {
    const next = queue.shift();
    if (next) {
      next();
    } else {
      inFlight = Math.max(0, inFlight - 1);
    }
  };

  return { acquire, release };
}

/**
 * Create a lean tool invoker for compatibility
 */
export function createLeanToolInvoker(
  options: {
    timeout?: number;
    maxConcurrency?: number;
  } = {}
): {
  registerHandler: (toolName: string, handler: LeanToolHandler) => void;
  callTool: (
    sessionId: string,
    toolName: string,
    args: unknown,
    progressCallback?: (progress: number, total?: number, message?: string) => void
  ) => Promise<ToolCallResult>;
  clear: () => void;
} {
  let registry = createHandlerRegistry();
  const limiter = options.maxConcurrency ? createConcurrencyLimiter(options.maxConcurrency) : null;

  const pipeline = createToolPipeline();

  return {
    registerHandler: (toolName: string, handler: LeanToolHandler) => {
      registry = registerHandler(registry, toolName, handler);
    },

    callTool: async (
      _sessionId: string, // Not used in lean implementation
      toolName: string,
      args: unknown,
      progressCallback?: (progress: number, total?: number, message?: string) => void
    ): Promise<ToolCallResult> => {
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

      return pipeline(registry, { toolName, args, timeout: options.timeout }, progressCallback);
    },

    clear: () => {
      registry = createHandlerRegistry();
    }
  };
}
