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
 * Route metrics type
 */
interface RouteMetrics {
  success: number;
  failure: number;
  totalTime: number;
}

/**
 * MCP Router class
 * Handles routing decisions for tools, resources, and prompts
 * Acts as a thin wrapper over pure functional logic
 */
export class McpRouter {
  private namingConfig: ToolNamingConfig;
  private debug: boolean;
  private routeCount = 0;
  private routeMetrics: {
    tools: RouteMetrics;
    resources: RouteMetrics;
    prompts: RouteMetrics;
  } = {
    tools: { success: 0, failure: 0, totalTime: 0 },
    resources: { success: 0, failure: 0, totalTime: 0 },
    prompts: { success: 0, failure: 0, totalTime: 0 },
  };

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
    context?: RouterContext,
  ): RouteDecision<RouteTarget> {
    const startTime = Date.now();
    const requestId = context?.requestId || `req-${++this.routeCount}`;

    this.logDebug('Routing tool:', {
      publicName,
      requestId,
      strategy: this.namingConfig.strategy,
    });

    // Use registry's built-in resolution
    const toolInfo = this.toolRegistry.resolveTool(publicName);

    const elapsed = Date.now() - startTime;

    if (!toolInfo) {
      this.routeMetrics.tools.failure++;
      this.routeMetrics.tools.totalTime += elapsed;

      this.logDebug('Tool routing failed:', {
        publicName,
        requestId,
        elapsed: `${elapsed}ms`,
      });

      return {
        target: null,
        error: `Tool not found: ${publicName}`,
      };
    }

    const target: RouteTarget = {
      serverId: toolInfo.serverId,
      originalName: toolInfo.originalName,
    };

    this.routeMetrics.tools.success++;
    this.routeMetrics.tools.totalTime += elapsed;

    this.logDebug('Tool routed successfully:', {
      publicName,
      target,
      requestId,
      elapsed: `${elapsed}ms`,
    });

    return {
      target,
      metadata: {
        publicName,
        resolvedBy: 'toolRegistry',
        requestId,
        elapsed,
      },
    };
  }

  /**
   * Route a resource read to the appropriate server
   */
  routeResource(
    uri: string,
    context?: RouterContext,
  ): RouteDecision<ResourceRouteTarget> {
    const startTime = Date.now();
    const requestId = context?.requestId || `req-${++this.routeCount}`;

    this.logDebug('Routing resource:', {
      uri,
      requestId,
    });

    // Use registry's built-in resolution
    const resourceInfo = this.resourceRegistry.resolveResource(uri);

    const elapsed = Date.now() - startTime;

    if (!resourceInfo) {
      this.routeMetrics.resources.failure++;
      this.routeMetrics.resources.totalTime += elapsed;

      this.logDebug('Resource routing failed:', {
        uri,
        requestId,
        elapsed: `${elapsed}ms`,
      });

      return {
        target: null,
        error: `Resource not found: ${uri}`,
      };
    }

    const target: ResourceRouteTarget = {
      serverId: resourceInfo.serverId,
      originalUri: resourceInfo.originalUri,
    };

    this.routeMetrics.resources.success++;
    this.routeMetrics.resources.totalTime += elapsed;

    this.logDebug('Resource routed successfully:', {
      uri,
      target,
      requestId,
      elapsed: `${elapsed}ms`,
    });

    return {
      target,
      metadata: {
        uri,
        resolvedBy: 'resourceRegistry',
        requestId,
        elapsed,
      },
    };
  }

  /**
   * Route a prompt get to the appropriate server
   */
  routePrompt(
    name: string,
    context?: RouterContext,
  ): RouteDecision<RouteTarget> {
    const startTime = Date.now();
    const requestId = context?.requestId || `req-${++this.routeCount}`;

    this.logDebug('Routing prompt:', {
      name,
      requestId,
    });

    // Use registry's built-in resolution
    const promptInfo = this.promptRegistry.resolvePrompt(name);

    const elapsed = Date.now() - startTime;

    if (!promptInfo) {
      this.routeMetrics.prompts.failure++;
      this.routeMetrics.prompts.totalTime += elapsed;

      this.logDebug('Prompt routing failed:', {
        name,
        requestId,
        elapsed: `${elapsed}ms`,
      });

      return {
        target: null,
        error: `Prompt not found: ${name}`,
      };
    }

    const target: RouteTarget = {
      serverId: promptInfo.serverId,
      originalName: promptInfo.originalName,
    };

    this.routeMetrics.prompts.success++;
    this.routeMetrics.prompts.totalTime += elapsed;

    this.logDebug('Prompt routed successfully:', {
      name,
      target,
      requestId,
      elapsed: `${elapsed}ms`,
    });

    return {
      target,
      metadata: {
        name,
        resolvedBy: 'promptRegistry',
        requestId,
        elapsed,
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
   * Debug logging helper with structured context
   */
  private logDebug(message: string, context?: any): void {
    if (this.debug) {
      if (context) {
        console.debug(
          `[McpRouter] ${message}`,
          JSON.stringify(context, null, 2),
        );
      } else {
        console.debug(`[McpRouter] ${message}`);
      }
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
    metrics: {
      tools: RouteMetrics;
      resources: RouteMetrics;
      prompts: RouteMetrics;
    };
    totalRequests: number;
  } {
    return {
      toolCount: this.toolRegistry.getToolCount(),
      resourceCount: this.resourceRegistry.getResourceCount(),
      promptCount: this.promptRegistry.getPromptCount(),
      namingStrategy: this.namingConfig.strategy,
      metrics: {
        tools: { ...this.routeMetrics.tools },
        resources: { ...this.routeMetrics.resources },
        prompts: { ...this.routeMetrics.prompts },
      },
      totalRequests: this.routeCount,
    };
  }

  /**
   * Get performance metrics
   */
  getMetrics(): {
    tools: {
      success: number;
      failure: number;
      avgTime: number;
      totalTime: number;
    };
    resources: {
      success: number;
      failure: number;
      avgTime: number;
      totalTime: number;
    };
    prompts: {
      success: number;
      failure: number;
      avgTime: number;
      totalTime: number;
    };
  } {
    const calculateAvg = (metrics: RouteMetrics) => {
      const total = metrics.success + metrics.failure;
      return total > 0 ? metrics.totalTime / total : 0;
    };

    return {
      tools: {
        ...this.routeMetrics.tools,
        avgTime: calculateAvg(this.routeMetrics.tools),
      },
      resources: {
        ...this.routeMetrics.resources,
        avgTime: calculateAvg(this.routeMetrics.resources),
      },
      prompts: {
        ...this.routeMetrics.prompts,
        avgTime: calculateAvg(this.routeMetrics.prompts),
      },
    };
  }

  /**
   * Reset metrics (useful for testing or periodic resets)
   */
  resetMetrics(): void {
    this.routeCount = 0;
    this.routeMetrics = {
      tools: { success: 0, failure: 0, totalTime: 0 },
      resources: { success: 0, failure: 0, totalTime: 0 },
      prompts: { success: 0, failure: 0, totalTime: 0 },
    };
  }
}
