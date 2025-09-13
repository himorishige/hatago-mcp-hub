/**
 * Thin runtime - aggregated functional implementations
 *
 * Following Hatago philosophy: "Don't thicken, stay thin"
 * This module provides all thin implementations in one place
 */

import { createThinSessionManager } from './session/thin-session.js';
import { createThinRegistryManager } from './registry/thin-registry.js';
import { createThinToolInvoker } from './tool-invoker/thin-invoker.js';
import { createThinRouter } from './router/thin-router.js';

// Session management - thin implementations
export {
  createThinSessionStore,
  createOrGetSession,
  removeExpiredSessions,
  listActiveSessions,
  clearAllSessions,
  createThinSessionManager,
  type ThinSessionStore
} from './session/thin-session.js';

// Registry management
export {
  createThinToolStore,
  registerTools,
  unregisterServerTools,
  getAllTools,
  getTool,
  resolveTool,
  createThinResourceStore,
  registerResources,
  getAllResources,
  getResource,
  createThinPromptStore,
  registerPrompts,
  getAllPrompts,
  createThinRegistryManager,
  type ThinToolStore,
  type ThinResourceStore,
  type ThinPromptStore
} from './registry/thin-registry.js';

// Tool invocation
export {
  createHandlerRegistry,
  registerHandler,
  executeWithTimeout,
  invokeTool,
  formatResult,
  createToolPipeline,
  createConcurrencyLimiter,
  createThinToolInvoker,
  type ThinToolHandler,
  type ToolContext,
  type InvocationResult,
  type HandlerRegistry
} from './tool-invoker/thin-invoker.js';

// Error handling
export {
  ThinErrorType,
  transportError,
  protocolError,
  timeoutError,
  cancelledError,
  classifyError,
  toError,
  simpleRetry,
  withTimeout,
  withCancellation,
  type ThinError
} from './error-handling/thin-errors.js';

// Routing - thin implementations
export {
  routeTool,
  routeResource,
  routePrompt,
  createRouterPipeline,
  batchRoute,
  createThinRouter,
  type RouteResult
} from './router/thin-router.js';

/**
 * Thin runtime instance type
 */
export type ThinRuntime = {
  sessions: ReturnType<typeof createThinSessionManager>;
  registry: ReturnType<typeof createThinRegistryManager>;
  tools: ReturnType<typeof createThinToolInvoker>;
  router: ReturnType<typeof createThinRouter>;
  stop: () => void;
};

/**
 * Create a complete thin runtime
 * This provides all functionality with minimal overhead
 */
export function createThinRuntime(
  options: {
    sessionTtlSeconds?: number;
    toolTimeout?: number;
    maxConcurrency?: number;
  } = {}
): ThinRuntime {
  // Import thin implementations
  const sessionManager = createThinSessionManager(options.sessionTtlSeconds);
  const registryManager = createThinRegistryManager();
  const toolInvoker = createThinToolInvoker({
    timeout: options.toolTimeout,
    maxConcurrency: options.maxConcurrency
  });
  const router = createThinRouter();

  return {
    // Session operations
    sessions: sessionManager,

    // Registry operations
    registry: registryManager,

    // Tool operations
    tools: toolInvoker,

    // Routing operations
    router,

    // Cleanup
    stop: () => {
      sessionManager.stop();
    }
  };
}

/**
 * Feature flag to enable thin runtime
 */
export function useThinRuntime(): boolean {
  return process.env.HATAGO_THIN_RUNTIME === 'true';
}
