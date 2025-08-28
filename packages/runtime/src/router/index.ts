/**
 * Router module exports
 */

// Main router class
export { McpRouter, createRouter } from './router.js';

// Functional utilities
export {
  generatePublicName,
  parsePublicName,
  resolveRoute,
  batchResolveRoutes,
  filterByServer,
  groupByServer
} from './router-functional.js';

// Types
export type {
  RouteTarget,
  ResourceRouteTarget,
  RouteDecision,
  RouterContext,
  RouterConfig,
  ToolRegistryInterface,
  ResourceRegistryInterface,
  PromptRegistryInterface
} from './router-types.js';