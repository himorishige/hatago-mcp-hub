import type { ToolMetadata } from '@himorishige/hatago-core';
import type { Tool } from '@modelcontextprotocol/sdk/types.js';
import {
  clearRegistry,
  clearServerTools,
  createRegistry,
  detectCollisions,
  getServerTools,
  getStats,
  getToolByName,
  registerServerTools,
  type ToolRegistryState,
} from './tool-registry-functional.js';
import type { ToolNamingConfig, ToolNamingStrategy } from './types.js';

// Tool name collision information
export interface ToolCollision {
  toolName: string;
  serverIds: string[];
}

// Tool registry options
export interface ToolRegistryOptions {
  namingConfig: ToolNamingConfig;
}

/**
 * Tool Registry - Tool name management and collision avoidance
 * Uses underscore (_) internally for Claude Code compatibility
 *
 * This is now a thin adapter over the functional core
 */
export class ToolRegistry {
  private state: ToolRegistryState;

  constructor(
    options: ToolRegistryOptions = {
      namingConfig: {
        strategy: 'namespace',
        separator: '_',
        format: '{serverId}_{toolName}',
      },
    },
  ) {
    this.state = createRegistry(options.namingConfig);
  }

  /**
   * Register server tools
   */
  registerServerTools(serverId: string, tools: Tool[]): void {
    this.state = registerServerTools(this.state, serverId, tools);
  }

  /**
   * Clear server tools
   */
  clearServerTools(serverId: string): void {
    this.state = clearServerTools(this.state, serverId);
  }

  /**
   * Get all tools
   */
  getAllTools(): Tool[] {
    // Get all tool metadata and return with public names
    const result: Tool[] = [];
    for (const metadata of this.state.tools.values()) {
      result.push({
        ...metadata.tool,
        name: metadata.publicName,
      });
    }
    return result;
  }

  /**
   * Get tool by name
   */
  getTool(publicName: string): ToolMetadata | undefined {
    return getToolByName(this.state, publicName);
  }

  /**
   * Get server tools
   */
  getServerTools(serverId: string): Tool[] {
    return getServerTools(this.state, serverId).map(({ tool, publicName }) => ({
      ...tool,
      name: publicName,
    }));
  }

  /**
   * Resolve tool name to original server ID and tool name
   */
  resolveTool(
    publicName: string,
  ): { serverId: string; originalName: string } | undefined {
    const metadata = getToolByName(this.state, publicName);
    if (!metadata) {
      return undefined;
    }

    return {
      serverId: metadata.serverId,
      originalName: metadata.originalName,
    };
  }

  /**
   * Detect tool name collisions
   */
  detectCollisions(): ToolCollision[] {
    const collisions = detectCollisions(this.state);
    const result: ToolCollision[] = [];

    for (const [toolName, serverIds] of collisions) {
      result.push({
        toolName,
        serverIds,
      });
    }

    return result;
  }

  /**
   * Get tool count
   */
  getToolCount(): number {
    return this.state.tools.size;
  }

  /**
   * Get server count
   */
  getServerCount(): number {
    return this.state.serverTools.size;
  }

  /**
   * Get debug information
   */
  getDebugInfo(): {
    totalTools: number;
    totalServers: number;
    collisions: ToolCollision[];
    namingStrategy: ToolNamingStrategy;
    tools: Array<{
      publicName: string;
      serverId: string;
      originalName: string;
    }>;
  } {
    const stats = getStats(this.state);
    return {
      totalTools: stats.totalTools,
      totalServers: stats.serverCount,
      collisions: this.detectCollisions(),
      namingStrategy: this.state.namingConfig.strategy,
      tools: Array.from(this.state.tools.entries()).map(
        ([publicName, metadata]) => ({
          publicName,
          serverId: metadata.serverId,
          originalName: metadata.originalName,
        }),
      ),
    };
  }

  /**
   * Clear all tools and server information
   */
  clear(): void {
    this.state = clearRegistry(this.state);
  }
}
