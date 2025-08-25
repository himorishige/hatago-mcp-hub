/**
 * Decorator Server Factory
 *
 * Factory for creating MCP servers from decorator-annotated classes.
 */

import type {
  CallToolRequest,
  CallToolResult,
  GetPromptRequest,
  GetPromptResult,
  Prompt,
  ReadResourceRequest,
  ReadResourceResult,
  Resource,
  ServerCapabilities,
  Tool,
} from '@modelcontextprotocol/sdk/types.js';
import { MetadataStore } from './metadata.js';

export interface DecoratedMCPServer {
  name: string;
  version: string;
  description?: string;
  capabilities: ServerCapabilities;
  tools: Tool[];
  resources: Resource[];
  prompts: Prompt[];
  callTool(request: CallToolRequest): Promise<CallToolResult>;
  readResource(request: ReadResourceRequest): Promise<ReadResourceResult>;
  getPrompt(request: GetPromptRequest): Promise<GetPromptResult>;
}

export class ServerFactory {
  static create(
    ServerClass: new (...args: any[]) => any,
    ...args: any[]
  ): DecoratedMCPServer {
    const instance = new ServerClass(...args);
    const prototype = ServerClass.prototype;

    const classMetadata = MetadataStore.getMCPClass(prototype);
    if (!classMetadata) {
      throw new Error(`Class ${ServerClass.name} is not decorated with @mcp`);
    }

    const toolMetadata = MetadataStore.getTools(prototype);
    const resourceMetadata = MetadataStore.getResources(prototype);
    const promptMetadata = MetadataStore.getPrompts(prototype);

    const tools: Tool[] = toolMetadata.map((meta) => ({
      name: meta.name,
      description: meta.description,
      inputSchema: meta.inputSchema || { type: 'object', properties: {} },
    }));

    const resources: Resource[] = resourceMetadata.map((meta) => ({
      uri: meta.uri,
      name: meta.name,
      description: meta.description,
      mimeType: meta.mimeType,
    }));

    const prompts: Prompt[] = promptMetadata.map((meta) => ({
      name: meta.name,
      description: meta.description,
      arguments: meta.arguments,
    }));

    const capabilities: ServerCapabilities = {
      tools: classMetadata.capabilities?.tools
        ? { listChanged: true }
        : undefined,
      resources: classMetadata.capabilities?.resources
        ? {
            subscribe: true,
            listChanged: true,
          }
        : undefined,
      prompts: classMetadata.capabilities?.prompts
        ? { listChanged: true }
        : undefined,
      logging: classMetadata.capabilities?.logging ? {} : undefined,
    };

    return {
      name: classMetadata.name,
      version: classMetadata.version,
      description: classMetadata.description,
      capabilities,
      tools,
      resources,
      prompts,

      async callTool(request: CallToolRequest): Promise<CallToolResult> {
        const toolMeta = toolMetadata.find(
          (t) => t.name === request.params.name,
        );
        if (!toolMeta) {
          throw new Error(`Tool not found: ${request.params.name}`);
        }

        const method = instance[toolMeta.propertyKey];
        if (typeof method !== 'function') {
          throw new Error(`Tool handler not found: ${request.params.name}`);
        }

        try {
          const result = await method.call(
            instance,
            request.params.arguments || {},
          );

          return {
            content: [
              {
                type: 'text',
                text:
                  typeof result === 'string' ? result : JSON.stringify(result),
              },
            ],
          };
        } catch (error) {
          throw new Error(
            `Tool execution failed: ${error instanceof Error ? error.message : String(error)}`,
          );
        }
      },

      async readResource(
        request: ReadResourceRequest,
      ): Promise<ReadResourceResult> {
        const resourceMeta = resourceMetadata.find(
          (r) => r.uri === request.params.uri,
        );
        if (!resourceMeta) {
          throw new Error(`Resource not found: ${request.params.uri}`);
        }

        const method = instance[resourceMeta.propertyKey];
        if (typeof method !== 'function') {
          throw new Error(`Resource handler not found: ${request.params.uri}`);
        }

        try {
          const content = await method.call(instance, request.params.uri);

          return {
            contents: [
              {
                uri: resourceMeta.uri,
                mimeType: resourceMeta.mimeType || 'text/plain',
                text:
                  typeof content === 'string'
                    ? content
                    : JSON.stringify(content),
              },
            ],
          };
        } catch (error) {
          throw new Error(
            `Resource read failed: ${error instanceof Error ? error.message : String(error)}`,
          );
        }
      },

      async getPrompt(request: GetPromptRequest): Promise<GetPromptResult> {
        const promptMeta = promptMetadata.find(
          (p) => p.name === request.params.name,
        );
        if (!promptMeta) {
          throw new Error(`Prompt not found: ${request.params.name}`);
        }

        const method = instance[promptMeta.propertyKey];
        if (typeof method !== 'function') {
          throw new Error(`Prompt handler not found: ${request.params.name}`);
        }

        try {
          const result = await method.call(
            instance,
            request.params.arguments || {},
          );

          if (typeof result === 'object' && result.messages) {
            return {
              description:
                result.description ||
                `Generated prompt for ${request.params.name}`,
              messages: result.messages,
            };
          }

          return {
            description: `Generated prompt for ${request.params.name}`,
            messages: [
              {
                role: 'user',
                content: {
                  type: 'text',
                  text:
                    typeof result === 'string'
                      ? result
                      : JSON.stringify(result),
                },
              },
            ],
          };
        } catch (error) {
          throw new Error(
            `Prompt generation failed: ${error instanceof Error ? error.message : String(error)}`,
          );
        }
      },
    };
  }

  static createFromInstance(instance: any): DecoratedMCPServer {
    return ServerFactory.create(instance.constructor, instance);
  }
}
