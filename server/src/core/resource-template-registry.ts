/**
 * Resource Template Registry
 * Manages resource templates for MCP servers
 */

import type { ResourceTemplate } from '@modelcontextprotocol/sdk/types.js';
import type { ToolNamingConfig } from '../config/types.js';
import { logger } from '../utils/logger.js';
import { createNamingFunction } from '../utils/naming-strategy.js';

export interface ResourceTemplateMetadata {
  serverId: string;
  template: ResourceTemplate;
  originalName: string;
}

/**
 * Registry for managing resource templates across multiple MCP servers
 */
export class ResourceTemplateRegistry {
  private templates: Map<string, ResourceTemplateMetadata> = new Map();
  private serverTemplates: Map<string, Set<string>> = new Map();
  private namingConfig: ToolNamingConfig;
  private formatTemplateName: (
    serverId: string,
    templateName: string,
  ) => string;

  constructor(namingConfig?: ToolNamingConfig) {
    this.namingConfig = namingConfig || {
      strategy: 'namespace',
      separator: '_',
      format: '{server}{separator}{tool}',
    };
    this.formatTemplateName = createNamingFunction(this.namingConfig);
  }

  /**
   * Register resource templates from a server
   */
  registerTemplates(serverId: string, templates: ResourceTemplate[]): void {
    if (!serverId?.trim()) {
      throw new Error('Server ID is required');
    }

    logger.debug(
      `Registering ${templates.length} templates for server ${serverId}`,
    );

    // Clear existing templates for this server
    this.clearServerTemplates(serverId);

    // Initialize server template set
    const serverTemplateSet = new Set<string>();
    this.serverTemplates.set(serverId, serverTemplateSet);

    // Register each template using functional approach
    templates.forEach((template) => {
      const formattedName = this.formatTemplateName(serverId, template.name);

      const metadata: ResourceTemplateMetadata = {
        serverId,
        template: {
          ...template,
          name: formattedName,
        },
        originalName: template.name,
      };

      this.templates.set(formattedName, metadata);
      serverTemplateSet.add(formattedName);

      logger.debug(
        `Registered template: ${formattedName} from server: ${serverId}`,
      );
    });
  }

  /**
   * Get all registered templates
   */
  getAllTemplates(): ResourceTemplate[] {
    return Array.from(this.templates.values()).map((meta) => meta.template);
  }

  /**
   * Get templates for a specific server
   */
  getServerTemplates(serverId: string): ResourceTemplate[] {
    const templateNames = this.serverTemplates.get(serverId);
    if (!templateNames) {
      return [];
    }

    return Array.from(templateNames)
      .map((name) => this.templates.get(name))
      .filter((meta): meta is ResourceTemplateMetadata => meta !== undefined)
      .map((meta) => meta.template);
  }

  /**
   * Get a specific template by name
   */
  getTemplate(templateName: string): ResourceTemplateMetadata | undefined {
    return this.templates.get(templateName);
  }

  /**
   * Clear templates for a specific server
   */
  clearServerTemplates(serverId: string): void {
    const templateNames = this.serverTemplates.get(serverId);
    if (templateNames) {
      for (const name of templateNames) {
        this.templates.delete(name);
      }
      this.serverTemplates.delete(serverId);
    }
    logger.debug(`Cleared templates for server: ${serverId}`);
  }

  /**
   * Clear all templates
   */
  clearAll(): void {
    this.templates.clear();
    this.serverTemplates.clear();
    logger.debug('Cleared all templates');
  }

  /**
   * Get total number of templates
   */
  getTemplateCount(): number {
    return this.templates.size;
  }

  /**
   * Check if a template exists
   */
  hasTemplate(templateName: string): boolean {
    return this.templates.has(templateName);
  }
}
