/**
 * Functional core for ToolRegistry
 * Pure functions for tool registry operations
 */

import type { ToolMetadata } from '@hatago/core';
import type { Tool } from '@modelcontextprotocol/sdk/types.js';
import type { ToolNamingConfig } from './types.js';

/**
 * Immutable registry type
 */
export interface ToolRegistryState {
  readonly tools: ReadonlyMap<string, ToolMetadata>;
  readonly serverTools: ReadonlyMap<string, ReadonlySet<string>>;
  readonly namingConfig: ToolNamingConfig;
}

/**
 * Create an empty registry
 */
export function createRegistry(
  namingConfig?: ToolNamingConfig,
): ToolRegistryState {
  return {
    tools: new Map(),
    serverTools: new Map(),
    namingConfig: namingConfig || {
      strategy: 'namespace',
      separator: '_',
      format: '{serverId}_{toolName}',
    },
  };
}

/**
 * Generate public name for a tool
 */
export function generatePublicName(
  config: ToolNamingConfig,
  serverId: string,
  toolName: string,
): string {
  const strategy = config.strategy || 'namespace';

  // Check if alias is defined
  const aliasKey = `${serverId}_${toolName}`;
  if (config.aliases?.[aliasKey]) {
    return config.aliases[aliasKey];
  }

  // None/simple strategy - just use the tool name without server prefix
  if (strategy === 'none' || (strategy as any) === 'simple') {
    return toolName;
  }

  // Error strategy
  if (strategy === 'error') {
    return toolName;
  }

  // Namespace strategy
  if (strategy === 'namespace') {
    const separator = config.separator || '_';
    const format = config.format || '{serverId}_{toolName}';

    let publicName = format
      .replace('{serverId}', serverId)
      .replace('{separator}', separator)
      .replace('{toolName}', toolName);

    // Replace dots with underscores (Claude Code compatibility)
    publicName = publicName.replace(/\./g, '_');

    return publicName;
  }

  // Prefix strategy (serverId before tool)
  if (strategy === 'prefix') {
    const separator = config.separator || '_';
    const publicName = `${serverId}${separator}${toolName}`;
    return publicName.replace(/\./g, '_');
  }

  // Suffix strategy (serverId after tool)
  if (strategy === 'suffix') {
    const separator = config.separator || '_';
    const publicName = `${toolName}${separator}${serverId}`;
    return publicName.replace(/\./g, '_');
  }

  // Alias strategy
  if (strategy === 'alias') {
    // First try the tool name itself (collision check is done by caller)
    return toolName;
  }

  // Default fallback: prefix
  const separator = config.separator || '_';
  const publicName = `${serverId}${separator}${toolName}`;
  return publicName.replace(/\./g, '_');
}

/**
 * Add a tool to the registry
 */
export function addTool(
  state: ToolRegistryState,
  serverId: string,
  tool: Tool,
): ToolRegistryState {
  let publicName = generatePublicName(state.namingConfig, serverId, tool.name);

  // Check for collision in alias strategy and fallback to namespace
  if (state.namingConfig.strategy === 'alias') {
    const existing = state.tools.get(publicName);
    if (existing && existing.serverId !== serverId) {
      // Collision detected, fallback to namespace strategy
      const separator = state.namingConfig.separator || '_';
      publicName = `${serverId}${separator}${tool.name}`.replace(/\./g, '_');
    }
  }

  // Check for collision in error strategy
  if (state.namingConfig.strategy === 'error') {
    const existing = state.tools.get(publicName);
    if (existing && existing.serverId !== serverId) {
      throw new Error(
        `Tool name collision: ${publicName} already exists from server ${existing.serverId}`,
      );
    }
  }

  // Create new metadata
  const metadata: ToolMetadata = {
    serverId,
    originalName: tool.name,
    publicName,
    tool,
  };

  // Create new maps with the added tool
  const newTools = new Map(state.tools);
  newTools.set(publicName, metadata);

  const serverToolSet = state.serverTools.get(serverId) || new Set<string>();
  const newServerToolSet = new Set(serverToolSet);
  newServerToolSet.add(publicName);

  const newServerTools = new Map(state.serverTools);
  newServerTools.set(serverId, newServerToolSet);

  return {
    ...state,
    tools: newTools,
    serverTools: newServerTools,
  };
}

/**
 * Register multiple tools for a server
 */
export function registerServerTools(
  state: ToolRegistryState,
  serverId: string,
  tools: Tool[],
): ToolRegistryState {
  // Clear existing tools for this server first
  let newState = clearServerTools(state, serverId);

  // If no tools, still register the server with an empty set
  if (tools.length === 0) {
    const newServerTools = new Map(newState.serverTools);
    newServerTools.set(serverId, new Set<string>());
    return {
      ...newState,
      serverTools: newServerTools,
    };
  }

  // Add each tool
  for (const tool of tools) {
    newState = addTool(newState, serverId, tool);
  }

  return newState;
}

/**
 * Remove a tool by public name
 */
export function removeTool(
  state: ToolRegistryState,
  publicName: string,
): ToolRegistryState {
  const metadata = state.tools.get(publicName);
  if (!metadata) {
    return state; // Tool doesn't exist, no change
  }

  // Create new maps without the tool
  const newTools = new Map(state.tools);
  newTools.delete(publicName);

  const serverToolSet = state.serverTools.get(metadata.serverId);
  if (serverToolSet) {
    const newServerToolSet = new Set(serverToolSet);
    newServerToolSet.delete(publicName);

    const newServerTools = new Map(state.serverTools);
    if (newServerToolSet.size > 0) {
      newServerTools.set(metadata.serverId, newServerToolSet);
    } else {
      newServerTools.delete(metadata.serverId);
    }

    return {
      ...state,
      tools: newTools,
      serverTools: newServerTools,
    };
  }

  return {
    ...state,
    tools: newTools,
  };
}

/**
 * Clear all tools for a server
 */
export function clearServerTools(
  state: ToolRegistryState,
  serverId: string,
): ToolRegistryState {
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
    ...state,
    tools: newTools,
    serverTools: newServerTools,
  };
}

/**
 * Get a tool by public name
 */
export function getToolByName(
  state: ToolRegistryState,
  publicName: string,
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
  serverId: string,
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
        tool: metadata.tool,
      });
    }
  }
  return tools;
}

/**
 * Resolve tool by original name
 */
export function resolveTool(
  state: ToolRegistryState,
  toolName: string,
  serverId?: string,
): ToolMetadata | undefined {
  // If serverId is provided, try exact match first
  if (serverId) {
    const publicName = generatePublicName(
      state.namingConfig,
      serverId,
      toolName,
    );
    const metadata = state.tools.get(publicName);
    if (metadata) {
      return metadata;
    }
  }

  // Otherwise, search for the tool
  for (const metadata of state.tools.values()) {
    if (metadata.originalName === toolName) {
      return metadata;
    }
  }

  return undefined;
}

/**
 * Detect naming collisions
 */
export function detectCollisions(
  state: ToolRegistryState,
): Map<string, string[]> {
  const collisions = new Map<string, string[]>();
  const nameToServers = new Map<string, string[]>();

  for (const metadata of state.tools.values()) {
    const servers = nameToServers.get(metadata.originalName) || [];
    servers.push(metadata.serverId);
    nameToServers.set(metadata.originalName, servers);
  }

  for (const [name, servers] of nameToServers.entries()) {
    if (servers.length > 1) {
      collisions.set(name, servers);
    }
  }

  return collisions;
}

/**
 * Get registry statistics
 */
export function getStats(state: ToolRegistryState): {
  totalTools: number;
  serverCount: number;
  collisions: number;
} {
  return {
    totalTools: state.tools.size,
    serverCount: state.serverTools.size,
    collisions: detectCollisions(state).size,
  };
}

/**
 * Clear entire registry
 */
export function clearRegistry(state: ToolRegistryState): ToolRegistryState {
  return {
    ...state,
    tools: new Map(),
    serverTools: new Map(),
  };
}
