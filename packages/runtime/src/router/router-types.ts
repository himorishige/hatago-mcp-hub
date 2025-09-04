/**
 * Router type definitions for MCP Hub
 */

import type { Prompt, Resource, Tool } from '@himorishige/hatago-core';

/**
 * Target for routing decisions
 */
export type RouteTarget = {
  serverId: string;
  originalName: string;
};

/**
 * Extended target for resources with URI
 */
export type ResourceRouteTarget = RouteTarget & {
  originalUri: string;
};

/**
 * Routing decision result
 */
export type RouteDecision<T = RouteTarget> = {
  found: boolean;
  target: T | null;
  error?: string;
  metadata?: {
    publicName?: string;
    resolvedBy?: string;
  };
};

/**
 * Context for routing decisions
 */
export type RouterContext = {
  sessionId?: string;
  serverId?: string;
  debug?: boolean;
};

/**
 * Router configuration
 */
export type RouterConfig = {
  /** Naming strategy for tools/resources/prompts */
  namingStrategy?: 'prefix' | 'suffix' | 'namespace' | 'none';

  /** Separator for namespacing */
  separator?: string;

  /** Enable debug logging */
  debug?: boolean;
};

/**
 * Registry interfaces for router
 */
export type ToolRegistryInterface = {
  resolveTool: (publicName: string) => RouteTarget | null;
  getAllTools: () => Tool[];
  getServerTools: (serverId: string) => Tool[];
};

export type ResourceRegistryInterface = {
  resolveResource: (publicUri: string) => ResourceRouteTarget | null;
  getAllResources: () => Resource[];
  getServerResources: (serverId: string) => Resource[];
};

export type PromptRegistryInterface = {
  resolvePrompt: (publicName: string) => RouteTarget | null;
  getAllPrompts: () => Prompt[];
  getServerPrompts: (serverId: string) => Prompt[];
};
