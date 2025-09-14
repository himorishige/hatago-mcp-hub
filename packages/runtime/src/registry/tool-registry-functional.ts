/**
 * Functional core for ToolRegistry - Simplified per Hatago philosophy
 * Only essential tool registration without complex naming strategies
 */

import type { ToolMetadata } from '@himorishige/hatago-core';
import type { Tool } from '@modelcontextprotocol/sdk/types.js';

/**
 * Immutable registry type - simplified
 */
export type ToolRegistryState = {
  readonly tools: ReadonlyMap<string, ToolMetadata>;
  readonly serverTools: ReadonlyMap<string, ReadonlySet<string>>;
};

/**
 * Create an empty registry
 */
export function createRegistry(): ToolRegistryState {
  return {
    tools: new Map(),
    serverTools: new Map()
  };
}

/**
 * Generate public name for a tool - always serverId_toolName
 */
export function generatePublicName(serverId: string, toolName: string): string {
  // Simple format: serverId_toolName
  // Replace dots with underscores for Claude Code compatibility
  return `${serverId}_${toolName}`.replace(/\./g, '_');
}

/**
 * Register multiple tools for a server
 */

export function registerServerTools(
  state: ToolRegistryState,
  serverId: string,
  tools: Tool[]
): ToolRegistryState {
  // Create new maps
  const newTools = new Map(state.tools);
  const newServerTools = new Map(state.serverTools);

  // Clear existing tools for this server
  const existingSet = state.serverTools.get(serverId);
  if (existingSet) {
    for (const publicName of existingSet) {
      newTools.delete(publicName);
    }
  }

  // If no tools, still register the server with an empty set
  if (tools.length === 0) {
    newServerTools.set(serverId, new Set<string>());
    return {
      tools: newTools,
      serverTools: newServerTools
    };
  }

  // Add each tool
  const toolSet = new Set<string>();
  for (const tool of tools) {
    const publicName = generatePublicName(serverId, tool.name);

    // Create metadata
    const metadata: ToolMetadata = {
      serverId,
      originalName: tool.name,
      publicName,
      tool
    };

    newTools.set(publicName, metadata);
    toolSet.add(publicName);
  }

  newServerTools.set(serverId, toolSet);

  return {
    tools: newTools,
    serverTools: newServerTools
  };
}

/**
 * Clear all tools for a server
 */
export function clearServerTools(state: ToolRegistryState, serverId: string): ToolRegistryState {
  const toolSet = state.serverTools.get(serverId);
  if (!toolSet) {
    return state; // No tools for this server
  }

  // Remove all tools for this server
  const newTools = new Map(state.tools);
  for (const publicName of toolSet) {
    newTools.delete(publicName);
  }

  const newServerTools = new Map(state.serverTools);
  newServerTools.delete(serverId);

  return {
    tools: newTools,
    serverTools: newServerTools
  };
}

/**
 * Get a tool by public name
 */
export function getToolByName(
  state: ToolRegistryState,
  publicName: string
): ToolMetadata | undefined {
  return state.tools.get(publicName);
}

/**
 * Get all tools
 */
export function getAllTools(state: ToolRegistryState): Tool[] {
  return Array.from(state.tools.values()).map((m) => m.tool);
}

/**
 * Get tools for a specific server
 */
export function getServerTools(
  state: ToolRegistryState,
  serverId: string
): Array<{ publicName: string; tool: Tool }> {
  const toolSet = state.serverTools.get(serverId);
  if (!toolSet) {
    return [];
  }

  const tools: Array<{ publicName: string; tool: Tool }> = [];
  for (const publicName of toolSet) {
    const metadata = state.tools.get(publicName);
    if (metadata) {
      tools.push({
        publicName: metadata.publicName,
        tool: metadata.tool
      });
    }
  }
  return tools;
}

/**
 * Clear entire registry
 */
export function clearRegistry(_state: ToolRegistryState): ToolRegistryState {
  return {
    tools: new Map(),
    serverTools: new Map()
  };
}
