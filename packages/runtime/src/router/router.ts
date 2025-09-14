/**
 * Simplified MCP Router - thin passthrough implementation
 * Only handles routing to correct server based on public names
 */

import type { PromptRegistry } from '../registry/prompt-registry.js';
import type { ResourceRegistry } from '../registry/resource-registry.js';
import type { ToolRegistry } from '../registry/tool-registry.js';

export type RouterConfig = Record<string, never>;

/**
 * Simple router that only maps public names to server IDs
 */
export class McpRouter {
  constructor(
    private readonly toolRegistry: ToolRegistry,
    private readonly resourceRegistry: ResourceRegistry,
    private readonly promptRegistry: PromptRegistry
  ) {}

  /**
   * Route tool call to the correct server
   */
  routeTool(publicName: string): { serverId: string; originalName: string } | undefined {
    const metadata = this.toolRegistry.getTool(publicName);
    if (!metadata) {
      return undefined;
    }
    return {
      serverId: metadata.serverId,
      originalName: metadata.originalName
    };
  }

  /**
   * Route resource request to the correct server
   */
  routeResource(uri: string): { serverId: string; originalUri: string } | undefined {
    const metadata = this.resourceRegistry.getResource(uri);
    if (!metadata) {
      return undefined;
    }
    return {
      serverId: metadata.serverId,
      originalUri: metadata.originalUri
    };
  }

  /**
   * Route prompt request to the correct server
   */
  routePrompt(publicName: string): { serverId: string; originalName: string } | undefined {
    const metadata = this.promptRegistry.getPrompt(publicName);
    if (!metadata) {
      return undefined;
    }
    return {
      serverId: metadata.serverId,
      originalName: metadata.originalName
    };
  }

  /**
   * Get all tools (for listing)
   */
  getAllTools() {
    return this.toolRegistry.getAllTools();
  }

  /**
   * Get all resources (for listing)
   */
  getAllResources() {
    return this.resourceRegistry.getAllResources();
  }

  /**
   * Get all prompts (for listing)
   */
  getAllPrompts() {
    return this.promptRegistry.getAllPrompts();
  }

  /**
   * Generate public name for a tool
   */
  generatePublicName(serverId: string, toolName: string): string {
    return `${serverId}_${toolName}`.replace(/\./g, '_');
  }
}

/**
 * Create a router instance
 */
export function createRouter(
  toolRegistry: ToolRegistry,
  resourceRegistry: ResourceRegistry,
  promptRegistry: PromptRegistry
): McpRouter {
  return new McpRouter(toolRegistry, resourceRegistry, promptRegistry);
}
