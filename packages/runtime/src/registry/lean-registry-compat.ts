/**
 * Compatibility wrapper for lean registry implementations
 *
 * Provides backward compatibility with existing ToolRegistry interface
 * while using the lean functional implementations underneath
 */

import type { Tool, Resource, Prompt } from '@modelcontextprotocol/sdk/types.js';
import {
  createLeanToolStore,
  registerTools,
  unregisterServerTools,
  getAllTools,
  getTool,
  resolveTool,
  createLeanResourceStore,
  registerResources,
  getAllResources,
  getResource,
  createLeanPromptStore,
  registerPrompts,
  getAllPrompts
} from './lean-registry.js';

/**
 * Create a compatible lean registry with all expected methods
 * This bridges the gap between the old class-based API and new functional API
 */
export function createCompatibleLeanRegistry() {
  let toolStore = createLeanToolStore();
  let resourceStore = createLeanResourceStore();
  let promptStore = createLeanPromptStore();

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

    // Important: getServerTools was missing in lean implementation
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
      toolStore = createLeanToolStore();
      resourceStore = createLeanResourceStore();
      promptStore = createLeanPromptStore();
    }
  };
}

/**
 * Type for the compatible registry
 */
export type CompatibleLeanRegistry = ReturnType<typeof createCompatibleLeanRegistry>;
