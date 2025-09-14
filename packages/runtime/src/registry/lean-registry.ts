/**
 * Lean registry implementations - functional approach
 *
 * Following Hatago philosophy: "Don't judge, pass through"
 * Simple Map-based registries without complex naming strategies
 */

import type { Tool, Resource, Prompt } from '@modelcontextprotocol/sdk/types.js';

/**
 * Simple tool store
 */
export type LeanToolStore = {
  tools: Map<string, Tool>;
  serverTools: Map<string, Set<string>>;
};

/**
 * Simple resource store
 */
export type LeanResourceStore = {
  resources: Map<string, Resource>;
  serverResources: Map<string, Set<string>>;
};

/**
 * Simple prompt store
 */
export type LeanPromptStore = {
  prompts: Map<string, Prompt>;
  serverPrompts: Map<string, Set<string>>;
};

/**
 * Create a lean tool store
 */
export function createLeanToolStore(): LeanToolStore {
  return {
    tools: new Map(),
    serverTools: new Map()
  };
}

/**
 * Register tools from a server
 */
export function registerTools(
  store: LeanToolStore,
  serverId: string,
  tools: Tool[]
): LeanToolStore {
  const newTools = new Map(store.tools);
  const newServerTools = new Map(store.serverTools);
  const toolNames = new Set<string>();

  for (const tool of tools) {
    // Simple prefixing - no complex naming strategy
    const publicName = `${serverId}_${tool.name}`;
    newTools.set(publicName, { ...tool, name: publicName });
    toolNames.add(publicName);
  }

  newServerTools.set(serverId, toolNames);

  return {
    tools: newTools,
    serverTools: newServerTools
  };
}

/**
 * Unregister all tools from a server
 */
export function unregisterServerTools(store: LeanToolStore, serverId: string): LeanToolStore {
  const toolNames = store.serverTools.get(serverId);
  if (!toolNames) return store;

  const newTools = new Map(store.tools);
  const newServerTools = new Map(store.serverTools);

  for (const name of toolNames) {
    newTools.delete(name);
  }
  newServerTools.delete(serverId);

  return {
    tools: newTools,
    serverTools: newServerTools
  };
}

/**
 * Get all tools
 */
export function getAllTools(store: LeanToolStore): Tool[] {
  return Array.from(store.tools.values());
}

/**
 * Get tool by name
 */
export function getTool(store: LeanToolStore, name: string): Tool | undefined {
  return store.tools.get(name);
}

/**
 * Resolve tool name to server ID and original name
 */
export function resolveTool(name: string): { serverId: string; originalName: string } | undefined {
  const parts = name.split('_');
  if (parts.length < 2) return undefined;

  const serverId = parts[0];
  if (!serverId) return undefined;

  return {
    serverId,
    originalName: parts.slice(1).join('_')
  };
}

/**
 * Create a lean resource store
 */
export function createLeanResourceStore(): LeanResourceStore {
  return {
    resources: new Map(),
    serverResources: new Map()
  };
}

/**
 * Register resources from a server
 */
export function registerResources(
  store: LeanResourceStore,
  serverId: string,
  resources: Resource[]
): LeanResourceStore {
  const newResources = new Map(store.resources);
  const newServerResources = new Map(store.serverResources);
  const resourceUris = new Set<string>();

  for (const resource of resources) {
    // Simple prefixing for URIs
    const publicUri = `${serverId}://${resource.uri}`;
    newResources.set(publicUri, { ...resource, uri: publicUri });
    resourceUris.add(publicUri);
  }

  newServerResources.set(serverId, resourceUris);

  return {
    resources: newResources,
    serverResources: newServerResources
  };
}

/**
 * Get all resources
 */
export function getAllResources(store: LeanResourceStore): Resource[] {
  return Array.from(store.resources.values());
}

/**
 * Get resource by URI
 */
export function getResource(store: LeanResourceStore, uri: string): Resource | undefined {
  return store.resources.get(uri);
}

/**
 * Create a lean prompt store
 */
export function createLeanPromptStore(): LeanPromptStore {
  return {
    prompts: new Map(),
    serverPrompts: new Map()
  };
}

/**
 * Register prompts from a server
 */
export function registerPrompts(
  store: LeanPromptStore,
  serverId: string,
  prompts: Prompt[]
): LeanPromptStore {
  const newPrompts = new Map(store.prompts);
  const newServerPrompts = new Map(store.serverPrompts);
  const promptNames = new Set<string>();

  for (const prompt of prompts) {
    const publicName = `${serverId}_${prompt.name}`;
    newPrompts.set(publicName, { ...prompt, name: publicName });
    promptNames.add(publicName);
  }

  newServerPrompts.set(serverId, promptNames);

  return {
    prompts: newPrompts,
    serverPrompts: newServerPrompts
  };
}

/**
 * Get all prompts
 */
export function getAllPrompts(store: LeanPromptStore): Prompt[] {
  return Array.from(store.prompts.values());
}

/**
 * Combined registry manager for compatibility
 */
export function createLeanRegistryManager(): {
  registerTools: (serverId: string, tools: Tool[]) => void;
  unregisterTools: (serverId: string) => void;
  getAllTools: () => Tool[];
  getTool: (name: string) => Tool | undefined;
  resolveTool: typeof resolveTool;
  registerResources: (serverId: string, resources: Resource[]) => void;
  getAllResources: () => Resource[];
  getResource: (uri: string) => Resource | undefined;
  registerPrompts: (serverId: string, prompts: Prompt[]) => void;
  getAllPrompts: () => Prompt[];
  clear: () => void;
} {
  let toolStore = createLeanToolStore();
  let resourceStore = createLeanResourceStore();
  let promptStore = createLeanPromptStore();

  return {
    // Tool operations
    registerTools: (serverId: string, tools: Tool[]) => {
      toolStore = registerTools(toolStore, serverId, tools);
    },

    unregisterTools: (serverId: string) => {
      toolStore = unregisterServerTools(toolStore, serverId);
    },

    getAllTools: (): Tool[] => {
      return getAllTools(toolStore);
    },

    getTool: (name: string): Tool | undefined => {
      return getTool(toolStore, name);
    },

    resolveTool,

    // Resource operations
    registerResources: (serverId: string, resources: Resource[]) => {
      resourceStore = registerResources(resourceStore, serverId, resources);
    },

    getAllResources: (): Resource[] => {
      return getAllResources(resourceStore);
    },

    getResource: (uri: string): Resource | undefined => {
      return getResource(resourceStore, uri);
    },

    // Prompt operations
    registerPrompts: (serverId: string, prompts: Prompt[]) => {
      promptStore = registerPrompts(promptStore, serverId, prompts);
    },

    getAllPrompts: (): Prompt[] => {
      return getAllPrompts(promptStore);
    },

    // Clear all
    clear: () => {
      toolStore = createLeanToolStore();
      resourceStore = createLeanResourceStore();
      promptStore = createLeanPromptStore();
    }
  };
}
