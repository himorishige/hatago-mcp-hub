/**
 * Compatibility wrapper for thin registry implementations
 *
 * Provides backward compatibility with existing ToolRegistry interface
 * while using the thin functional implementations underneath
 */

import type { Tool, Resource, Prompt } from '@modelcontextprotocol/sdk/types.js';
import {
  createThinToolStore,
  registerTools,
  unregisterServerTools,
  getAllTools,
  getTool,
  resolveTool,
  createThinResourceStore,
  registerResources,
  getAllResources,
  getResource,
  createThinPromptStore,
  registerPrompts,
  getAllPrompts,
  type ThinToolStore,
  type ThinResourceStore,
  type ThinPromptStore
} from './thin-registry.js';

/**
 * Create a compatible thin registry with all expected methods
 * This bridges the gap between the old class-based API and new functional API
 */
export function createCompatibleThinRegistry() {
  let toolStore = createThinToolStore();
  let resourceStore = createThinResourceStore();
  let promptStore = createThinPromptStore();

  return {
    // Tool operations with compatibility names
    registerServerTools: (serverId: string, tools: Tool[]) => {
      toolStore = registerTools(toolStore, serverId, tools);
    },

    registerTools: (serverId: string, tools: Tool[]) => {
      toolStore = registerTools(toolStore, serverId, tools);
    },

    clearServerTools: (serverId: string) => {
      toolStore = unregisterServerTools(toolStore, serverId);
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

    // Important: getServerTools was missing in thin implementation
    getServerTools: (serverId: string): Tool[] => {
      const serverToolNames = toolStore.serverTools.get(serverId);
      if (!serverToolNames) return [];

      return Array.from(serverToolNames)
        .map((name) => toolStore.tools.get(name))
        .filter((tool): tool is Tool => tool !== undefined);
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

    // Clear all registries
    clear: () => {
      toolStore = createThinToolStore();
      resourceStore = createThinResourceStore();
      promptStore = createThinPromptStore();
    }
  };
}

/**
 * Type for the compatible registry
 */
export type CompatibleThinRegistry = ReturnType<typeof createCompatibleThinRegistry>;
