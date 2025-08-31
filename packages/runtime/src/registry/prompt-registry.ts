/**
 * Prompt Registry - Manages prompts from multiple MCP servers
 */

import type { Prompt } from '@modelcontextprotocol/sdk/types.js';
import { logger } from '../utils/logger.js';

/**
 * Prompt info with server association
 */
export interface PromptInfo extends Prompt {
  serverId: string;
  originalName: string;
}

/**
 * Prompt metadata stored in registry
 */
interface PromptMetadata extends Prompt {
  serverId: string;
  originalName: string;
}

/**
 * Registry for managing prompts from multiple servers
 */
export class PromptRegistry {
  private prompts: Map<string, PromptMetadata> = new Map();
  private serverPrompts: Map<string, Set<string>> = new Map();
  private logger = logger;

  /**
   * Register prompts from a server
   */
  registerServerPrompts(serverId: string, prompts: Prompt[]): void {
    this.logger.info(`Registering ${prompts.length} prompts from server ${serverId}`);

    // Clear existing prompts for this server
    this.unregisterServerPrompts(serverId);

    // Track prompt names for this server
    const promptNames = new Set<string>();

    for (const prompt of prompts) {
      // Generate namespaced name
      const namespacedName = this.getNamespacedName(serverId, prompt.name);

      const metadata: PromptMetadata = {
        ...prompt,
        name: namespacedName,
        serverId,
        originalName: prompt.name
      };

      this.prompts.set(namespacedName, metadata);
      promptNames.add(namespacedName);

      this.logger.debug(`Registered prompt ${prompt.name} as ${namespacedName}`);
    }

    // Track which prompts belong to this server
    this.serverPrompts.set(serverId, promptNames);
  }

  /**
   * Unregister all prompts from a server
   */
  unregisterServerPrompts(serverId: string): void {
    const promptNames = this.serverPrompts.get(serverId);
    if (!promptNames) {
      return;
    }

    for (const name of promptNames) {
      this.prompts.delete(name);
    }

    this.serverPrompts.delete(serverId);
    this.logger.info(`Unregistered prompts from server ${serverId}`);
  }

  /**
   * Get all prompts
   */
  getAllPrompts(): Prompt[] {
    return Array.from(this.prompts.values());
  }

  /**
   * Get a prompt by name
   */
  getPrompt(name: string): Prompt | undefined {
    return this.prompts.get(name);
  }

  /**
   * Get all prompts from a specific server
   */
  getServerPrompts(serverId: string): Prompt[] {
    const promptNames = this.serverPrompts.get(serverId);
    return promptNames
      ? Array.from(promptNames)
          .map((name) => this.prompts.get(name)!)
          .filter(Boolean)
      : [];
  }

  /**
   * Check if a prompt exists
   */
  hasPrompt(name: string): boolean {
    return this.prompts.has(name);
  }

  /**
   * Clear all prompts
   */
  clear(): void {
    this.prompts.clear();
    this.serverPrompts.clear();
  }

  /**
   * Get prompt count
   */
  getPromptCount(): number {
    return this.prompts.size;
  }

  /**
   * Generate namespaced name
   */
  private getNamespacedName(serverId: string, promptName: string): string {
    // Use underscore separator for Claude Code compatibility (prefix strategy)
    return `${serverId}_${promptName}`;
  }

  /**
   * Resolve prompt name to get server ID and original name
   */
  resolvePrompt(namespacedName: string): { serverId: string; originalName: string } | null {
    const metadata = this.prompts.get(namespacedName);
    if (!metadata) {
      return null;
    }

    return {
      serverId: metadata.serverId,
      originalName: metadata.originalName
    };
  }
}

/**
 * Create a new prompt registry instance
 */
export function createPromptRegistry(): PromptRegistry {
  return new PromptRegistry();
}
