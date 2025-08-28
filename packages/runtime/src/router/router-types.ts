/**
 * Router type definitions for MCP Hub
 */

import type { Tool, Resource, Prompt } from '@hatago/core';

/**
 * Target for routing decisions
 */
export interface RouteTarget {
  serverId: string;
  originalName: string;
}

/**
 * Extended target for resources with URI
 */
export interface ResourceRouteTarget extends RouteTarget {
  originalUri: string;
}

/**
 * Routing decision result
 */
export interface RouteDecision<T = RouteTarget> {
  found: boolean;
  target: T | null;
  error?: string;
  metadata?: {
    publicName?: string;
    resolvedBy?: string;
  };
}

/**
 * Context for routing decisions
 */
export interface RouterContext {
  sessionId?: string;
  serverId?: string;
  debug?: boolean;
}

/**
 * Router configuration
 */
export interface RouterConfig {
  /** Naming strategy for tools/resources/prompts */
  namingStrategy?: 'prefix' | 'suffix' | 'namespace' | 'none';
  
  /** Separator for namespacing */
  separator?: string;
  
  /** Enable debug logging */
  debug?: boolean;
}

/**
 * Registry interfaces for router
 */
export interface ToolRegistryInterface {
  resolveTool(publicName: string): RouteTarget | null;
  getAllTools(): Tool[];
  getServerTools(serverId: string): Tool[];
}

export interface ResourceRegistryInterface {
  resolveResource(publicUri: string): ResourceRouteTarget | null;
  getAllResources(): Resource[];
  getServerResources(serverId: string): Resource[];
}

export interface PromptRegistryInterface {
  resolvePrompt(publicName: string): RouteTarget | null;
  getAllPrompts(): Prompt[];
  getServerPrompts(serverId: string): Prompt[];
}