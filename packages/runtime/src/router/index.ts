/**
 * Router module exports
 */

// Main router class
export { createRouter, McpRouter } from './router.js';

// Functional utilities
export {
  batchResolveRoutes,
  filterByServer,
  generatePublicName,
  groupByServer,
  parsePublicName,
  resolveRoute
} from './router-functional.js';

// Types
export type {
  PromptRegistryInterface,
  ResourceRegistryInterface,
  ResourceRouteTarget,
  RouteDecision,
  RouterConfig,
  RouterContext,
  RouteTarget,
  ToolRegistryInterface
} from './router-types.js';
