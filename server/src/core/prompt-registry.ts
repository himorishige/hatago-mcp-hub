import type { Prompt } from '@modelcontextprotocol/sdk/types.js';
import type { ToolNamingConfig } from '../config/types.js';
import {
  createNamingFunction,
  createParsingFunction,
} from '../utils/naming-strategy.js';

export interface PromptMetadata extends Prompt {
  serverId: string;
  originalName: string;
}

export interface PromptResolveResult {
  serverId: string;
  originalName: string;
  publicName: string;
}

export interface PromptRegistryOptions {
  namingConfig?: ToolNamingConfig;
}

export interface PromptRegistry {
  registerServerPrompts: (serverId: string, prompts: Prompt[]) => void;
  clearServerPrompts: (serverId: string) => void;
  resolvePrompt: (publicName: string) => PromptResolveResult | null;
  getServerPrompts: (serverId: string) => Prompt[];
  getAllPrompts: () => Prompt[];
  getPromptCollisions: () => Map<string, string[]>;
  clear: () => void;
}

/**
 * Create a prompt registry for managing prompts from multiple MCP servers
 * Using functional factory pattern for better adherence to Hatago principles
 */
export function createPromptRegistry(
  options: PromptRegistryOptions = {},
): PromptRegistry {
  // Private state managed through closure
  const prompts = new Map<string, PromptMetadata[]>();
  const serverPrompts = new Map<string, Set<string>>();
  const namingConfig: ToolNamingConfig = options.namingConfig || {
    strategy: 'namespace',
    separator: '_',
  };

  // Create naming functions
  const generatePublicName = createNamingFunction(namingConfig);
  const _parsePublicName = createParsingFunction(namingConfig);

  /**
   * Clear prompts for a specific server
   */
  function clearServerPrompts(serverId: string): void {
    const existingNames = serverPrompts.get(serverId);
    if (existingNames) {
      for (const name of existingNames) {
        const promptList = prompts.get(name);
        if (promptList) {
          const filtered = promptList.filter((p) => p.serverId !== serverId);
          if (filtered.length > 0) {
            prompts.set(name, filtered);
          } else {
            prompts.delete(name);
          }
        }
      }
      serverPrompts.delete(serverId);
    }
  }

  /**
   * Register prompts from a server
   */
  function registerServerPrompts(serverId: string, newPrompts: Prompt[]): void {
    // Clear existing prompts
    clearServerPrompts(serverId);

    // Register new prompts
    const promptNames = new Set<string>();
    for (const prompt of newPrompts) {
      const publicName = generatePublicName(serverId, prompt.name);
      const metadata: PromptMetadata = {
        ...prompt,
        name: publicName,
        serverId,
        originalName: prompt.name,
      };

      // Name-based management
      const existing = prompts.get(publicName) || [];
      existing.push(metadata);
      prompts.set(publicName, existing);
      promptNames.add(publicName);
    }

    serverPrompts.set(serverId, promptNames);
  }

  /**
   * Resolve a public name to server and original name
   */
  function resolvePrompt(publicName: string): PromptResolveResult | null {
    const promptList = prompts.get(publicName);
    if (!promptList || promptList.length === 0) {
      return null;
    }

    // Return the first prompt (in case of collisions)
    const prompt = promptList[0];
    return {
      serverId: prompt.serverId,
      originalName: prompt.originalName,
      publicName: prompt.name,
    };
  }

  /**
   * Get prompts for a specific server
   */
  function getServerPrompts(serverId: string): Prompt[] {
    const names = serverPrompts.get(serverId);
    if (!names) {
      return [];
    }

    const result: Prompt[] = [];
    for (const name of names) {
      const promptList = prompts.get(name);
      if (promptList) {
        const serverPrompt = promptList.find((p) => p.serverId === serverId);
        if (serverPrompt) {
          // Return without serverId and originalName metadata
          const { serverId: _, originalName: __, ...prompt } = serverPrompt;
          result.push(prompt);
        }
      }
    }

    return result;
  }

  /**
   * Get all prompts from all servers
   */
  function getAllPrompts(): Prompt[] {
    const allPrompts: Prompt[] = [];
    const seen = new Set<string>();

    for (const [name, promptList] of prompts) {
      if (!seen.has(name) && promptList.length > 0) {
        seen.add(name);
        // Return the first prompt for each name (in case of collisions)
        const { serverId: _, originalName: __, ...prompt } = promptList[0];
        allPrompts.push(prompt);
      }
    }

    return allPrompts;
  }

  /**
   * Get prompt collisions (names with multiple servers)
   */
  function getPromptCollisions(): Map<string, string[]> {
    const collisions = new Map<string, string[]>();

    for (const [name, promptList] of prompts) {
      if (promptList.length > 1) {
        const serverIds = [...new Set(promptList.map((p) => p.serverId))];
        if (serverIds.length > 1) {
          collisions.set(name, serverIds);
        }
      }
    }

    return collisions;
  }

  /**
   * Clear all prompts
   */
  function clear(): void {
    prompts.clear();
    serverPrompts.clear();
  }

  // Return the public interface
  return {
    registerServerPrompts,
    clearServerPrompts,
    resolvePrompt,
    getServerPrompts,
    getAllPrompts,
    getPromptCollisions,
    clear,
  };
}
