import type { ToolMetadata } from '@himorishige/hatago-core';
import type { Tool } from '@modelcontextprotocol/sdk/types.js';
import {
  clearRegistry,
  clearServerTools,
  createRegistry,
  getServerTools,
  getToolByName,
  registerServerTools,
  type ToolRegistryState
} from './tool-registry-functional.js';

/**
 * Tool Registry - Simplified tool name management
 * Always uses serverId_toolName format
 */
export class ToolRegistry {
  private state: ToolRegistryState;

  constructor() {
    this.state = createRegistry();
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
        name: metadata.publicName
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
      name: publicName
    }));
  }

  /**
   * Resolve tool name to original server ID and tool name
   */
  resolveTool(publicName: string): { serverId: string; originalName: string } | undefined {
    const metadata = getToolByName(this.state, publicName);
    if (!metadata) {
      return undefined;
    }

    return {
      serverId: metadata.serverId,
      originalName: metadata.originalName
    };
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
    tools: Array<{
      publicName: string;
      serverId: string;
      originalName: string;
    }>;
  } {
    return {
      totalTools: this.state.tools.size,
      totalServers: this.state.serverTools.size,
      tools: Array.from(this.state.tools.entries()).map(([publicName, metadata]) => ({
        publicName,
        serverId: metadata.serverId,
        originalName: metadata.originalName
      }))
    };
  }

  /**
   * Clear all tools and server information
   */
  clear(): void {
    this.state = clearRegistry(this.state);
  }
}
