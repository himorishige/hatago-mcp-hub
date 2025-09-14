/**
 * Lean runtime - aggregated functional implementations
 *
 * Following Hatago philosophy: "Don't thicken, stay lean"
 * This module provides all lean implementations in one place
 */

import { createLeanSessionManager } from './session/lean-session.js';
import { createCompatibleLeanRegistry } from './registry/lean-registry-compat.js';
import { createCompatibleLeanToolInvoker } from './tool-invoker/lean-invoker-compat.js';
import { createLeanRouter } from './router/lean-router.js';

// Session management - lean implementations
export {
  createLeanSessionStore,
  createOrGetSession,
  removeExpiredSessions,
  listActiveSessions,
  clearAllSessions,
  createLeanSessionManager,
  type LeanSessionStore
} from './session/lean-session.js';

// Registry management
export {
  createLeanToolStore,
  registerTools,
  unregisterServerTools,
  getAllTools,
  getTool,
  resolveTool,
  createLeanResourceStore,
  registerResources,
  getAllResources,
  getResource,
  createLeanPromptStore,
  registerPrompts,
  getAllPrompts,
  createLeanRegistryManager,
  type LeanToolStore,
  type LeanResourceStore,
  type LeanPromptStore
} from './registry/lean-registry.js';

// Registry compatibility
export {
  createCompatibleLeanRegistry,
  type CompatibleLeanRegistry
} from './registry/lean-registry-compat.js';

// Tool invocation
export {
  createHandlerRegistry,
  registerHandler,
  executeWithTimeout,
  invokeTool,
  formatResult,
  createToolPipeline,
  createConcurrencyLimiter,
  createLeanToolInvoker,
  type LeanToolHandler,
  type ToolContext,
  type InvocationResult,
  type HandlerRegistry
} from './tool-invoker/lean-invoker.js';

// Tool invoker compatibility
export {
  createCompatibleLeanToolInvoker,
  type CompatibleLeanToolInvoker
} from './tool-invoker/lean-invoker-compat.js';

// Error handling
export {
  LeanErrorType,
  transportError,
  protocolError,
  timeoutError,
  cancelledError,
  classifyError,
  toError,
  simpleRetry,
  withTimeout,
  withCancellation,
  type LeanError
} from './error-handling/lean-errors.js';

// Routing - lean implementations
export {
  routeTool,
  routeResource,
  routePrompt,
  createRouterPipeline,
  batchRoute,
  createLeanRouter,
  type RouteResult
} from './router/lean-router.js';

/**
 * Thin runtime instance type
 */
export type LeanRuntime = {
  sessions: ReturnType<typeof createLeanSessionManager>;
  registry: ReturnType<typeof createCompatibleLeanRegistry>;
  tools: ReturnType<typeof createCompatibleLeanToolInvoker>;
  router: ReturnType<typeof createLeanRouter>;
  stop: () => void;
};

/**
 * Create a complete lean runtime
 * This provides all functionality with minimal overhead
 */
export function createLeanRuntime(
  options: {
    sessionTtlSeconds?: number;
    toolTimeout?: number;
    maxConcurrency?: number;
  } = {}
): LeanRuntime {
  // Import lean implementations
  const sessionManager = createLeanSessionManager(options.sessionTtlSeconds);
  // Use compatible registry for backward compatibility
  const registryManager = createCompatibleLeanRegistry();
  // Use compatible tool invoker with registry reference
  const toolInvoker = createCompatibleLeanToolInvoker({
    timeout: options.toolTimeout,
    maxConcurrency: options.maxConcurrency,
    toolRegistry: registryManager // Provide registry for listTools()
  });
  const router = createLeanRouter();

  return {
    // Session operations
    sessions: sessionManager,

    // Registry operations with compatibility
    registry: registryManager,

    // Tool operations with compatibility
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
 * Feature flag to enable lean runtime
 */
export function useLeanRuntime(): boolean {
  return process.env.HATAGO_LEAN_RUNTIME === 'true';
}
