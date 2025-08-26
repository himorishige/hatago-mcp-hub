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
 * Registry for managing prompts from multiple servers
 */
export class PromptRegistry {
  private prompts: Map<string, PromptInfo> = new Map();
  private serverPrompts: Map<string, Map<string, PromptInfo>> = new Map();
  private logger = logger;

  /**
   * Register prompts from a server
   */
  registerServerPrompts(serverId: string, prompts: Prompt[]): void {
    this.logger.debug(
      `Registering ${prompts.length} prompts from server ${serverId}`,
    );

    // Clear existing prompts for this server
    const existingPrompts = this.serverPrompts.get(serverId);
    if (existingPrompts) {
      // Remove from global registry
      for (const prompt of existingPrompts.values()) {
        this.prompts.delete(prompt.name);
      }
    }

    // Create new map for this server
    const serverPromptMap = new Map<string, PromptInfo>();

    // Register each prompt
    for (const prompt of prompts) {
      const namespacedName = this.getNamespacedName(serverId, prompt.name);
      const promptInfo: PromptInfo = {
        ...prompt,
        name: namespacedName,
        serverId,
        originalName: prompt.name,
      };

      // Add to server map
      serverPromptMap.set(prompt.name, promptInfo);

      // Add to global registry
      this.prompts.set(namespacedName, promptInfo);

      this.logger.debug(`Registered prompt: ${namespacedName}`);
    }

    // Store server map
    this.serverPrompts.set(serverId, serverPromptMap);
  }

  /**
   * Unregister all prompts from a server
   */
  unregisterServerPrompts(serverId: string): void {
    const serverPrompts = this.serverPrompts.get(serverId);
    if (!serverPrompts) {
      return;
    }

    // Remove from global registry
    for (const prompt of serverPrompts.values()) {
      this.prompts.delete(prompt.name);
    }

    // Remove server map
    this.serverPrompts.delete(serverId);

    this.logger.debug(`Unregistered all prompts from server ${serverId}`);
  }

  /**
   * Get all prompts
   */
  getAllPrompts(): PromptInfo[] {
    return Array.from(this.prompts.values());
  }

  /**
   * Get prompt by name
   */
  getPrompt(name: string): PromptInfo | undefined {
    return this.prompts.get(name);
  }

  /**
   * Get prompts from a specific server
   */
  getServerPrompts(serverId: string): PromptInfo[] {
    const serverPrompts = this.serverPrompts.get(serverId);
    return serverPrompts ? Array.from(serverPrompts.values()) : [];
  }

  /**
   * Check if prompt exists
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
   * Get namespaced prompt name
   */
  private getNamespacedName(serverId: string, promptName: string): string {
    // Use underscore as separator for consistency with tools
    return `${serverId}_${promptName}`;
  }

  /**
   * Resolve prompt name to server and original name
   */
  resolvePrompt(
    name: string,
  ): { serverId: string; originalName: string } | undefined {
    const prompt = this.prompts.get(name);
    if (!prompt) {
      return undefined;
    }

    return {
      serverId: prompt.serverId,
      originalName: prompt.originalName,
    };
  }
}

/**
 * Create a new prompt registry instance
 */
export function createPromptRegistry(): PromptRegistry {
  return new PromptRegistry();
}
