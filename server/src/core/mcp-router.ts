/**
 * MCP Router - Central routing logic for tools, resources, and prompts
 * Provides a clean abstraction over the registry layer
 */

import type { ToolNamingConfig } from '../config/types.js';
import {
  generatePublicName,
  parsePublicName,
  resolveRoute,
} from './mcp-router-functional.js';
import type {
  ResourceRouteTarget,
  RouteDecision,
  RouterContext,
  RouteTarget,
} from './mcp-router-types.js';
import type { PromptRegistry } from './prompt-registry.js';
import type { ResourceRegistry } from './resource-registry.js';
import type { ToolRegistry } from './tool-registry.js';

/**
 * Options for McpRouter initialization
 */
export interface McpRouterOptions {
  /** Tool naming configuration */
  namingConfig?: ToolNamingConfig;

  /** Enable debug logging */
  debug?: boolean;
}

/**
 * MCP Router class
 * Handles routing decisions for tools, resources, and prompts
 * Acts as a thin wrapper over pure functional logic
 */
export class McpRouter {
  private namingConfig: ToolNamingConfig;
  private debug: boolean;

  constructor(
    private toolRegistry: ToolRegistry,
    private resourceRegistry: ResourceRegistry,
    private promptRegistry: PromptRegistry,
    options: McpRouterOptions = {},
  ) {
    this.namingConfig = options.namingConfig ?? {
      strategy: 'namespace',
      separator: '_',
      format: '{serverId}_{toolName}',
    };
    this.debug = options.debug ?? false;
  }

  /**
   * Route a tool call to the appropriate server
   */
  routeTool(
    publicName: string,
    _context?: RouterContext,
  ): RouteDecision<RouteTarget> {
    this.logDebug('Routing tool:', publicName);

    // Use registry's built-in resolution
    const toolInfo = this.toolRegistry.resolveTool(publicName);

    if (!toolInfo) {
      return {
        target: null,
        error: `Tool not found: ${publicName}`,
      };
    }

    const target: RouteTarget = {
      serverId: toolInfo.serverId,
      originalName: toolInfo.originalName,
    };

    this.logDebug('Tool routed to:', target);

    return {
      target,
      metadata: {
        publicName,
        resolvedBy: 'toolRegistry',
      },
    };
  }

  /**
   * Route a resource read to the appropriate server
   */
  routeResource(
    uri: string,
    _context?: RouterContext,
  ): RouteDecision<ResourceRouteTarget> {
    this.logDebug('Routing resource:', uri);

    // Use registry's built-in resolution
    const resourceInfo = this.resourceRegistry.resolveResource(uri);

    if (!resourceInfo) {
      return {
        target: null,
        error: `Resource not found: ${uri}`,
      };
    }

    const target: ResourceRouteTarget = {
      serverId: resourceInfo.serverId,
      originalUri: resourceInfo.originalUri,
    };

    this.logDebug('Resource routed to:', target);

    return {
      target,
      metadata: {
        uri,
        resolvedBy: 'resourceRegistry',
      },
    };
  }

  /**
   * Route a prompt get to the appropriate server
   */
  routePrompt(
    name: string,
    _context?: RouterContext,
  ): RouteDecision<RouteTarget> {
    this.logDebug('Routing prompt:', name);

    // Use registry's built-in resolution
    const promptInfo = this.promptRegistry.resolvePrompt(name);

    if (!promptInfo) {
      return {
        target: null,
        error: `Prompt not found: ${name}`,
      };
    }

    const target: RouteTarget = {
      serverId: promptInfo.serverId,
      originalName: promptInfo.originalName,
    };

    this.logDebug('Prompt routed to:', target);

    return {
      target,
      metadata: {
        name,
        resolvedBy: 'promptRegistry',
      },
    };
  }

  /**
   * Alternative routing method using pure functional approach
   * This demonstrates how we could route without depending on registries
   */
  routeWithFunctionalApproach(
    publicName: string,
    registryState: Map<string, { serverId: string; originalName: string }>,
    _context?: RouterContext,
  ): RouteDecision<RouteTarget> {
    return resolveRoute(
      publicName,
      registryState,
      this.namingConfig.strategy,
      this.namingConfig.separator,
    );
  }

  /**
   * Generate a public name for a tool/resource/prompt
   * Useful for debugging and testing
   */
  generatePublicName(serverId: string, originalName: string): string {
    return generatePublicName(
      serverId,
      originalName,
      this.namingConfig.strategy,
      this.namingConfig.separator,
    );
  }

  /**
   * Parse a public name to extract server and original name
   * Useful for debugging and testing
   */
  parsePublicName(publicName: string): RouteTarget | null {
    return parsePublicName(
      publicName,
      this.namingConfig.strategy,
      this.namingConfig.separator,
    );
  }

  /**
   * Get current naming configuration
   */
  getNamingConfig(): ToolNamingConfig {
    return { ...this.namingConfig };
  }

  /**
   * Update naming configuration
   * Note: This should be done carefully as it affects all routing
   */
  updateNamingConfig(config: Partial<ToolNamingConfig>): void {
    this.namingConfig = {
      ...this.namingConfig,
      ...config,
    };
  }

  /**
   * Debug logging helper
   */
  private logDebug(message: string, ...args: unknown[]): void {
    if (this.debug) {
      console.debug(`[McpRouter] ${message}`, ...args);
    }
  }

  /**
   * Get router statistics (for monitoring/debugging)
   */
  getStats(): {
    toolCount: number;
    resourceCount: number;
    promptCount: number;
    namingStrategy: string;
  } {
    return {
      toolCount: this.toolRegistry.getToolCount(),
      resourceCount: this.resourceRegistry.getResourceCount(),
      promptCount: this.promptRegistry.getPromptCount(),
      namingStrategy: this.namingConfig.strategy,
    };
  }
}
