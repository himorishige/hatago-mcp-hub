/**
 * Capability discovery for MCP Hub
 * Handles discovery and refresh of tools, resources, prompts from servers
 */

import type {
  PromptRegistry,
  ResourceRegistry,
  ToolRegistry,
} from '@hatago/runtime';
import type { Client } from '@modelcontextprotocol/sdk/client/index.js';
import type {
  Prompt,
  Resource,
  ResourceTemplate,
  Tool,
} from '@modelcontextprotocol/sdk/types.js';
import type { NpxMcpServer } from '../servers/npx-mcp-server.js';
import type { ServerRegistry } from '../servers/server-registry.js';
import { logger } from '../utils/logger.js';
import type { ResourceTemplateRegistry } from './resource-template-registry.js';

/**
 * Discovery configuration
 */
export interface DiscoveryConfig {
  serverRegistry: ServerRegistry;
  toolRegistry: ToolRegistry;
  resourceRegistry: ResourceRegistry;
  promptRegistry: PromptRegistry;
  resourceTemplateRegistry?: ResourceTemplateRegistry;
}

/**
 * Discovery result
 */
export interface DiscoveryResult {
  tools: number;
  resources: number;
  prompts: number;
  templates: number;
  errors: string[];
}

/**
 * Manages capability discovery for MCP Hub
 */
export class McpHubDiscovery {
  private serverRegistry: ServerRegistry;
  private toolRegistry: ToolRegistry;
  private resourceRegistry: ResourceRegistry;
  private promptRegistry: PromptRegistry;
  private resourceTemplateRegistry?: ResourceTemplateRegistry;

  constructor(config: DiscoveryConfig) {
    this.serverRegistry = config.serverRegistry;
    this.toolRegistry = config.toolRegistry;
    this.resourceRegistry = config.resourceRegistry;
    this.promptRegistry = config.promptRegistry;
    this.resourceTemplateRegistry = config.resourceTemplateRegistry;
  }

  /**
   * Discover all capabilities from a server
   */
  async discoverServerCapabilities(
    serverId: string,
    client?: Client,
  ): Promise<DiscoveryResult> {
    const result: DiscoveryResult = {
      tools: 0,
      resources: 0,
      prompts: 0,
      templates: 0,
      errors: [],
    };

    try {
      // Get client if not provided
      if (!client) {
        const serverInfo = this.serverRegistry.getServer(serverId);
        if (!serverInfo?.client) {
          throw new Error(`Server ${serverId} not connected`);
        }
        client = serverInfo.client;
      }

      // Discover based on server type
      const serverInfo = this.serverRegistry.getServer(serverId);
      if (!serverInfo) {
        throw new Error(`Server ${serverId} not found`);
      }

      // Discover tools
      try {
        const tools = await this.discoverTools(serverId, client);
        result.tools = tools.length;
      } catch (error) {
        result.errors.push(`Failed to discover tools: ${error}`);
      }

      // Discover resources
      try {
        const resources = await this.discoverResources(serverId, client);
        result.resources = resources.length;
      } catch (error) {
        result.errors.push(`Failed to discover resources: ${error}`);
      }

      // Discover prompts
      try {
        const prompts = await this.discoverPrompts(serverId, client);
        result.prompts = prompts.length;
      } catch (error) {
        result.errors.push(`Failed to discover prompts: ${error}`);
      }

      // Discover resource templates if supported
      if (this.resourceTemplateRegistry) {
        try {
          const templates = await this.discoverResourceTemplates(
            serverId,
            client,
          );
          result.templates = templates.length;
        } catch (error) {
          result.errors.push(`Failed to discover templates: ${error}`);
        }
      }

      logger.info(
        `Discovered capabilities for ${serverId}: ${result.tools} tools, ${result.resources} resources, ${result.prompts} prompts, ${result.templates} templates`,
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      result.errors.push(message);
      logger.error(`Failed to discover capabilities for ${serverId}:`, error);
    }

    return result;
  }

  /**
   * Refresh capabilities for a server
   */
  async refreshServerCapabilities(serverId: string): Promise<DiscoveryResult> {
    logger.debug(`Refreshing capabilities for server: ${serverId}`);

    // Clear existing registrations
    this.clearServerCapabilities(serverId);

    // Rediscover
    return this.discoverServerCapabilities(serverId);
  }

  /**
   * Clear all capabilities for a server
   */
  clearServerCapabilities(serverId: string): void {
    this.toolRegistry.unregisterServerTools?.(serverId);
    this.resourceRegistry.clearServerResources?.(serverId);
    this.promptRegistry.unregisterServerPrompts?.(serverId);

    if (this.resourceTemplateRegistry) {
      this.resourceTemplateRegistry.clearServerTemplates(serverId);
    }
  }

  /**
   * Discover tools from a server
   */
  private async discoverTools(
    serverId: string,
    client: Client,
  ): Promise<Tool[]> {
    try {
      const result = await client.listTools();
      const tools = result.tools || [];

      if (tools.length > 0) {
        this.toolRegistry.registerServerTools(serverId, tools);
        logger.debug(`Registered ${tools.length} tools from ${serverId}`);
      }

      return tools;
    } catch (error) {
      logger.warn(`Failed to discover tools from ${serverId}:`, error);
      return [];
    }
  }

  /**
   * Discover resources from a server
   */
  private async discoverResources(
    serverId: string,
    client: Client,
  ): Promise<Resource[]> {
    try {
      const result = await client.listResources();
      const resources = result.resources || [];

      if (resources.length > 0) {
        this.resourceRegistry.registerServerResources(serverId, resources);
        logger.debug(
          `Registered ${resources.length} resources from ${serverId}`,
        );
      }

      return resources;
    } catch (error) {
      logger.warn(`Failed to discover resources from ${serverId}:`, error);
      return [];
    }
  }

  /**
   * Discover prompts from a server
   */
  private async discoverPrompts(
    serverId: string,
    client: Client,
  ): Promise<Prompt[]> {
    try {
      const result = await client.listPrompts();
      const prompts = result.prompts || [];

      if (prompts.length > 0) {
        this.promptRegistry.registerServerPrompts(serverId, prompts);
        logger.debug(`Registered ${prompts.length} prompts from ${serverId}`);
      }

      return prompts;
    } catch (error) {
      logger.warn(`Failed to discover prompts from ${serverId}:`, error);
      return [];
    }
  }

  /**
   * Discover resource templates from a server
   */
  private async discoverResourceTemplates(
    serverId: string,
    client: Client,
  ): Promise<ResourceTemplate[]> {
    try {
      // Check if client supports resource templates
      if (!('listResourceTemplates' in client)) {
        return [];
      }

      const result = await (client as any).listResourceTemplates();
      const templates = result.resourceTemplates || [];

      if (templates.length > 0 && this.resourceTemplateRegistry) {
        this.resourceTemplateRegistry.registerTemplates(serverId, templates);
        logger.debug(
          `Registered ${templates.length} resource templates from ${serverId}`,
        );
      }

      return templates;
    } catch (error) {
      logger.warn(
        `Failed to discover resource templates from ${serverId}:`,
        error,
      );
      return [];
    }
  }

  /**
   * Refresh NPX server capabilities
   */
  async refreshNpxServerCapabilities(
    serverId: string,
  ): Promise<DiscoveryResult> {
    const serverInfo = this.serverRegistry.getServer(serverId);
    if (!serverInfo?.server || !(serverInfo.server instanceof NpxMcpServer)) {
      throw new Error(`Server ${serverId} is not an NPX server`);
    }

    const npxServer = serverInfo.server as NpxMcpServer;

    // For NPX servers, restart might be needed
    if (npxServer.getState() === 'error') {
      logger.info(`Restarting NPX server ${serverId} due to error state`);
      await npxServer.restart();
    }

    return this.refreshServerCapabilities(serverId);
  }

  /**
   * Refresh remote server capabilities
   */
  async refreshRemoteServerCapabilities(
    serverId: string,
  ): Promise<DiscoveryResult> {
    const serverInfo = this.serverRegistry.getServer(serverId);
    if (!serverInfo?.server) {
      throw new Error(`Server ${serverId} is not a remote server`);
    }

    // For remote servers, just refresh normally
    return this.refreshServerCapabilities(serverId);
  }

  /**
   * Get discovery statistics
   */
  getStatistics(): {
    servers: number;
    tools: number;
    resources: number;
    prompts: number;
    templates: number;
  } {
    const servers = this.serverRegistry.getAllServerIds();

    return {
      servers: servers.length,
      tools: this.toolRegistry.getAllTools().length,
      resources: this.resourceRegistry.getAllResources().length,
      prompts: this.promptRegistry.getAllPrompts().length,
      templates: this.resourceTemplateRegistry?.getTemplateCount() || 0,
    };
  }
}

/**
 * Create discovery manager
 */
export function createDiscovery(config: DiscoveryConfig): McpHubDiscovery {
  return new McpHubDiscovery(config);
}
