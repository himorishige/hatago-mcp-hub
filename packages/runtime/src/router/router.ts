/**
 * MCP Router - Central routing logic for tools, resources, and prompts
 */

import type { Prompt, Resource, Tool } from '@himorishige/hatago-core';
import {
  generatePublicName,
  groupByServer,
  parsePublicName,
  resolveRoute,
} from './router-functional.js';
import type {
  PromptRegistryInterface,
  ResourceRegistryInterface,
  ResourceRouteTarget,
  RouteDecision,
  RouterConfig,
  RouterContext,
  ToolRegistryInterface,
} from './router-types.js';

/**
 * Router for MCP Hub operations
 */
export class McpRouter {
  private config: RouterConfig;
  private toolRegistry: ToolRegistryInterface;
  private resourceRegistry: ResourceRegistryInterface;
  private promptRegistry: PromptRegistryInterface;

  constructor(
    toolRegistry: ToolRegistryInterface,
    resourceRegistry: ResourceRegistryInterface,
    promptRegistry: PromptRegistryInterface,
    config: RouterConfig = {},
  ) {
    this.toolRegistry = toolRegistry;
    this.resourceRegistry = resourceRegistry;
    this.promptRegistry = promptRegistry;
    this.config = {
      namingStrategy: config.namingStrategy || 'namespace',
      separator: config.separator || '_',
      debug: config.debug || false,
    };
  }

  /**
   * Route tool call to appropriate server
   */
  routeTool(publicName: string, context?: RouterContext): RouteDecision {
    if (this.config.debug || context?.debug) {
      console.debug(`[McpRouter] Routing tool: ${publicName}`);
    }

    return resolveRoute(
      publicName,
      (name) => this.toolRegistry.resolveTool(name),
      this.config,
      'toolRegistry',
    );
  }

  /**
   * Route resource request to appropriate server
   */
  routeResource(
    publicUri: string,
    context?: RouterContext,
  ): RouteDecision<ResourceRouteTarget> {
    if (this.config.debug || context?.debug) {
      console.debug(`[McpRouter] Routing resource: ${publicUri}`);
    }

    const target = this.resourceRegistry.resolveResource(publicUri);

    if (!target) {
      return {
        found: false,
        target: null,
        error: `Resource not found: ${publicUri}`,
      };
    }

    return {
      found: true,
      target,
      metadata: {
        publicName: publicUri,
        resolvedBy: 'resourceRegistry',
      },
    };
  }

  /**
   * Route prompt request to appropriate server
   */
  routePrompt(publicName: string, context?: RouterContext): RouteDecision {
    if (this.config.debug || context?.debug) {
      console.debug(`[McpRouter] Routing prompt: ${publicName}`);
    }

    return resolveRoute(
      publicName,
      (name) => this.promptRegistry.resolvePrompt(name),
      this.config,
      'promptRegistry',
    );
  }

  /**
   * Get all available tools
   */
  getAllTools(): Tool[] {
    return this.toolRegistry.getAllTools();
  }

  /**
   * Get tools for a specific server
   */
  getServerTools(serverId: string): Tool[] {
    return this.toolRegistry.getServerTools(serverId);
  }

  /**
   * Get all available resources
   */
  getAllResources(): Resource[] {
    return this.resourceRegistry.getAllResources();
  }

  /**
   * Get resources for a specific server
   */
  getServerResources(serverId: string): Resource[] {
    return this.resourceRegistry.getServerResources(serverId);
  }

  /**
   * Get all available prompts
   */
  getAllPrompts(): Prompt[] {
    return this.promptRegistry.getAllPrompts();
  }

  /**
   * Get prompts for a specific server
   */
  getServerPrompts(serverId: string): Prompt[] {
    return this.promptRegistry.getServerPrompts(serverId);
  }

  /**
   * Generate public name for a tool/prompt
   */
  generatePublicName(serverId: string, originalName: string): string {
    return generatePublicName(serverId, originalName, this.config);
  }

  /**
   * Parse public name to get server ID and original name
   */
  parsePublicName(publicName: string): {
    serverId?: string;
    originalName: string;
  } {
    return parsePublicName(publicName, this.config);
  }

  /**
   * Group tools by server
   */
  groupToolsByServer(): Map<string, Tool[]> {
    const tools = this.getAllTools();
    const toolsWithServer = tools.map((tool) => {
      const parsed = this.parsePublicName(tool.name);
      return {
        ...tool,
        serverId: parsed.serverId || 'unknown',
      };
    });
    return groupByServer(toolsWithServer);
  }

  /**
   * Group resources by server
   */
  groupResourcesByServer(): Map<string, Resource[]> {
    const resources = this.getAllResources();
    const resourcesWithServer = resources.map((resource) => {
      const parsed = this.parsePublicName(resource.uri);
      return {
        ...resource,
        serverId: parsed.serverId || 'unknown',
      };
    });
    return groupByServer(resourcesWithServer);
  }

  /**
   * Group prompts by server
   */
  groupPromptsByServer(): Map<string, Prompt[]> {
    const prompts = this.getAllPrompts();
    const promptsWithServer = prompts.map((prompt) => {
      const parsed = this.parsePublicName(prompt.name);
      return {
        ...prompt,
        serverId: parsed.serverId || 'unknown',
      };
    });
    return groupByServer(promptsWithServer);
  }

  /**
   * Get statistics about registered items
   */
  getStatistics(): {
    tools: number;
    resources: number;
    prompts: number;
    servers: Set<string>;
  } {
    const servers = new Set<string>();

    // Collect server IDs from tools
    const toolGroups = this.groupToolsByServer();
    toolGroups.forEach((_, serverId) => {
      servers.add(serverId);
    });

    // Collect server IDs from resources
    const resourceGroups = this.groupResourcesByServer();
    resourceGroups.forEach((_, serverId) => {
      servers.add(serverId);
    });

    // Collect server IDs from prompts
    const promptGroups = this.groupPromptsByServer();
    promptGroups.forEach((_, serverId) => {
      servers.add(serverId);
    });

    return {
      tools: this.getAllTools().length,
      resources: this.getAllResources().length,
      prompts: this.getAllPrompts().length,
      servers,
    };
  }

  /**
   * Update router configuration
   */
  updateConfig(config: Partial<RouterConfig>): void {
    this.config = { ...this.config, ...config };
  }

  /**
   * Get current naming configuration
   */
  getNamingConfig(): RouterConfig {
    return { ...this.config };
  }

  /**
   * Update naming configuration
   */
  updateNamingConfig(config: Partial<RouterConfig>): void {
    this.updateConfig(config);
  }

  /**
   * Get router statistics with metrics
   */
  getStats(): any {
    const stats = this.getStatistics();
    return {
      ...stats,
      metrics: this.getMetrics(),
    };
  }

  /**
   * Get performance metrics
   */
  getMetrics(): any {
    // Simple metrics implementation
    return {
      requestCount: 0,
      averageResponseTime: 0,
      errorRate: 0,
    };
  }

  /**
   * Reset performance metrics
   */
  resetMetrics(): void {
    // Reset metrics implementation
  }

  /**
   * Route using pure functional approach (for compatibility)
   */
  routeWithFunctionalApproach(
    publicName: string,
    type: 'tool' | 'resource' | 'prompt',
  ): RouteDecision {
    switch (type) {
      case 'tool':
        return this.routeTool(publicName);
      case 'resource':
        return this.routeResource(publicName);
      case 'prompt':
        return this.routePrompt(publicName);
      default:
        return {
          found: false,
          target: null,
          error: `Unknown type: ${type}`,
        };
    }
  }
}

/**
 * Create a new router instance
 */
export function createRouter(
  toolRegistry: ToolRegistryInterface,
  resourceRegistry: ResourceRegistryInterface,
  promptRegistry: PromptRegistryInterface,
  config?: RouterConfig,
): McpRouter {
  return new McpRouter(toolRegistry, resourceRegistry, promptRegistry, config);
}
