/**
 * Decorator Metadata
 *
 * Metadata storage for MCP decorators.
 */

import 'reflect-metadata';
import type { JSONSchema } from '@modelcontextprotocol/sdk/types.js';

export const METADATA_KEYS = {
  MCP_CLASS: 'mcp:class',
  MCP_TOOLS: 'mcp:tools',
  MCP_RESOURCES: 'mcp:resources',
  MCP_PROMPTS: 'mcp:prompts',
} as const;

export interface MCPClassMetadata {
  name: string;
  version: string;
  description?: string;
  capabilities?: {
    tools?: boolean;
    resources?: boolean;
    prompts?: boolean;
    logging?: boolean;
  };
}

export interface ToolMetadata {
  name: string;
  description: string;
  inputSchema?: JSONSchema;
  propertyKey: string | symbol;
}

export interface ResourceMetadata {
  uri: string;
  name: string;
  description?: string;
  mimeType?: string;
  propertyKey: string | symbol;
}

export interface PromptMetadata {
  name: string;
  description: string;
  arguments: Array<{
    name: string;
    description?: string;
    required?: boolean;
  }>;
  propertyKey: string | symbol;
}

export class MetadataStore {
  static getMCPClass(target: any): MCPClassMetadata | undefined {
    return Reflect.getMetadata(METADATA_KEYS.MCP_CLASS, target);
  }

  static setMCPClass(target: any, metadata: MCPClassMetadata): void {
    Reflect.defineMetadata(METADATA_KEYS.MCP_CLASS, metadata, target);
  }

  static getTools(target: any): ToolMetadata[] {
    return Reflect.getMetadata(METADATA_KEYS.MCP_TOOLS, target) || [];
  }

  static addTool(target: any, metadata: ToolMetadata): void {
    const tools = MetadataStore.getTools(target);
    tools.push(metadata);
    Reflect.defineMetadata(METADATA_KEYS.MCP_TOOLS, tools, target);
  }

  static getResources(target: any): ResourceMetadata[] {
    return Reflect.getMetadata(METADATA_KEYS.MCP_RESOURCES, target) || [];
  }

  static addResource(target: any, metadata: ResourceMetadata): void {
    const resources = MetadataStore.getResources(target);
    resources.push(metadata);
    Reflect.defineMetadata(METADATA_KEYS.MCP_RESOURCES, resources, target);
  }

  static getPrompts(target: any): PromptMetadata[] {
    return Reflect.getMetadata(METADATA_KEYS.MCP_PROMPTS, target) || [];
  }

  static addPrompt(target: any, metadata: PromptMetadata): void {
    const prompts = MetadataStore.getPrompts(target);
    prompts.push(metadata);
    Reflect.defineMetadata(METADATA_KEYS.MCP_PROMPTS, prompts, target);
  }
}

export function extractInputSchemaFromMethod(
  target: any,
  propertyKey: string | symbol,
): JSONSchema | undefined {
  const paramTypes =
    Reflect.getMetadata('design:paramtypes', target, propertyKey) || [];

  if (paramTypes.length === 0) {
    return {
      type: 'object',
      properties: {},
    };
  }

  // Simple schema extraction - in a real implementation, we'd use more sophisticated type analysis
  return {
    type: 'object',
    properties: {
      input: {
        type: 'object',
        description: 'Method parameters',
      },
    },
  };
}
