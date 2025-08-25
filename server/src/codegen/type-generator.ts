/**
 * Type Generator
 *
 * Automatic TypeScript type generation from MCP server schemas.
 */

import type {
  Prompt,
  Resource,
  Tool,
} from '@modelcontextprotocol/sdk/types.js';
import { compile, type JSONSchema } from 'json-schema-to-typescript';
import * as ts from 'typescript';
import { logger } from '../observability/structured-logger.js';

export interface TypeGenerationOptions {
  outputPath?: string;
  namespace?: string;
  includeComments?: boolean;
  exportMode?: 'named' | 'default';
  strictMode?: boolean;
}

export interface MCPTypeDefinitions {
  tools: Record<string, Tool>;
  resources: Record<string, Resource>;
  prompts: Record<string, Prompt>;
  serverInfo: {
    name: string;
    version?: string;
  };
}

export class TypeGenerator {
  private options: Required<TypeGenerationOptions>;

  constructor(options: TypeGenerationOptions = {}) {
    this.options = {
      outputPath: options.outputPath ?? './generated/types.ts',
      namespace: options.namespace ?? 'MCPTypes',
      includeComments: options.includeComments ?? true,
      exportMode: options.exportMode ?? 'named',
      strictMode: options.strictMode ?? true,
    };
  }

  /**
   * Generate TypeScript types from MCP definitions
   */
  async generateTypes(definitions: MCPTypeDefinitions): Promise<string> {
    const _sourceFile = ts.createSourceFile(
      this.options.outputPath,
      '',
      ts.ScriptTarget.Latest,
      false,
      ts.ScriptKind.TS,
    );

    const _printer = ts.createPrinter({
      newLine: ts.NewLineKind.LineFeed,
    });

    // Generate file header
    let output = this.generateHeader(definitions.serverInfo);

    // Generate tool types
    if (Object.keys(definitions.tools).length > 0) {
      output += await this.generateToolTypes(definitions.tools);
    }

    // Generate resource types
    if (Object.keys(definitions.resources).length > 0) {
      output += await this.generateResourceTypes(definitions.resources);
    }

    // Generate prompt types
    if (Object.keys(definitions.prompts).length > 0) {
      output += await this.generatePromptTypes(definitions.prompts);
    }

    // Generate unified client interface
    output += this.generateClientInterface(definitions);

    logger.info('Generated TypeScript types', {
      toolCount: Object.keys(definitions.tools).length,
      resourceCount: Object.keys(definitions.resources).length,
      promptCount: Object.keys(definitions.prompts).length,
      outputPath: this.options.outputPath,
    });

    return output;
  }

  private generateHeader(serverInfo: {
    name: string;
    version?: string;
  }): string {
    const header = [
      '/**',
      ` * Auto-generated TypeScript types for MCP Server: ${serverInfo.name}`,
      serverInfo.version ? ` * Version: ${serverInfo.version}` : '',
      ` * Generated at: ${new Date().toISOString()}`,
      ' * ',
      ' * WARNING: This file is auto-generated. Do not edit manually.',
      ' */',
      '',
      "import type { CallToolResult, ReadResourceResult, GetPromptResult } from '@modelcontextprotocol/sdk/types.js'",
      '',
    ].filter(Boolean);

    return header.join('\n');
  }

  private async generateToolTypes(
    tools: Record<string, Tool>,
  ): Promise<string> {
    const toolTypes: string[] = [];
    const toolNames: string[] = [];

    toolTypes.push('// === Tool Types ===\n');

    for (const [name, tool] of Object.entries(tools)) {
      const typeName = this.toTypeName(name);
      toolNames.push(`'${name}'`);

      // Generate input type from JSON Schema
      if (tool.inputSchema) {
        try {
          const inputType = await compile(
            tool.inputSchema as JSONSchema,
            `${typeName}Input`,
            {
              bannerComment: '',
              additionalProperties: false,
              strictIndexSignatures: this.options.strictMode,
            },
          );
          toolTypes.push(inputType);
        } catch (error) {
          logger.warn('Failed to generate input type for tool', {
            tool: name,
            error,
          });
          toolTypes.push(
            `export interface ${typeName}Input {\n  [key: string]: any\n}\n`,
          );
        }
      } else {
        toolTypes.push(
          `export interface ${typeName}Input {\n  [key: string]: any\n}\n`,
        );
      }

      // Generate tool result type (generic for now)
      toolTypes.push(`export type ${typeName}Result = CallToolResult\n`);

      // Generate tool interface
      const comment =
        this.options.includeComments && tool.description
          ? `/**\n * ${tool.description}\n */\n`
          : '';

      toolTypes.push(`${comment}export interface ${typeName}Tool {`);
      toolTypes.push(`  name: '${name}'`);
      toolTypes.push(`  input: ${typeName}Input`);
      toolTypes.push(`  result: ${typeName}Result`);
      toolTypes.push('}\n');
    }

    // Generate tool name union type
    toolTypes.push(`export type ToolName = ${toolNames.join(' | ')}\n`);

    // Generate tool map type
    const toolMapEntries = Object.keys(tools).map((name) => {
      const typeName = this.toTypeName(name);
      return `  '${name}': ${typeName}Tool`;
    });
    toolTypes.push('export interface ToolMap {');
    toolTypes.push(...toolMapEntries);
    toolTypes.push('}\n');

    return toolTypes.join('\n');
  }

  private async generateResourceTypes(
    resources: Record<string, Resource>,
  ): Promise<string> {
    const resourceTypes: string[] = [];
    const resourceUris: string[] = [];

    resourceTypes.push('// === Resource Types ===\n');

    for (const [uri, resource] of Object.entries(resources)) {
      const typeName = this.toTypeName(uri);
      resourceUris.push(`'${uri}'`);

      // Generate resource result type
      resourceTypes.push(
        `export type ${typeName}Result = ReadResourceResult\n`,
      );

      // Generate resource interface
      const comment =
        this.options.includeComments && resource.description
          ? `/**\n * ${resource.description}\n */\n`
          : '';

      resourceTypes.push(`${comment}export interface ${typeName}Resource {`);
      resourceTypes.push(`  uri: '${uri}'`);
      resourceTypes.push(`  name: '${resource.name}'`);
      if (resource.description) {
        resourceTypes.push(`  description: '${resource.description}'`);
      }
      if (resource.mimeType) {
        resourceTypes.push(`  mimeType: '${resource.mimeType}'`);
      }
      resourceTypes.push(`  result: ${typeName}Result`);
      resourceTypes.push('}\n');
    }

    // Generate resource URI union type
    resourceTypes.push(
      `export type ResourceUri = ${resourceUris.join(' | ')}\n`,
    );

    // Generate resource map type
    const resourceMapEntries = Object.entries(resources).map(
      ([uri, _resource]) => {
        const typeName = this.toTypeName(uri);
        return `  '${uri}': ${typeName}Resource`;
      },
    );
    resourceTypes.push('export interface ResourceMap {');
    resourceTypes.push(...resourceMapEntries);
    resourceTypes.push('}\n');

    return resourceTypes.join('\n');
  }

  private async generatePromptTypes(
    prompts: Record<string, Prompt>,
  ): Promise<string> {
    const promptTypes: string[] = [];
    const promptNames: string[] = [];

    promptTypes.push('// === Prompt Types ===\n');

    for (const [name, prompt] of Object.entries(prompts)) {
      const typeName = this.toTypeName(name);
      promptNames.push(`'${name}'`);

      // Generate arguments type
      if (prompt.arguments && prompt.arguments.length > 0) {
        const argTypes = prompt.arguments.map((arg) => {
          const required = arg.required ? '' : '?';
          return `  ${arg.name}${required}: ${this.inferTypeFromDescription(arg.description)}`;
        });
        promptTypes.push(`export interface ${typeName}Arguments {`);
        promptTypes.push(...argTypes);
        promptTypes.push('}\n');
      } else {
        promptTypes.push(`export interface ${typeName}Arguments {}\n`);
      }

      // Generate prompt result type
      promptTypes.push(`export type ${typeName}Result = GetPromptResult\n`);

      // Generate prompt interface
      const comment =
        this.options.includeComments && prompt.description
          ? `/**\n * ${prompt.description}\n */\n`
          : '';

      promptTypes.push(`${comment}export interface ${typeName}Prompt {`);
      promptTypes.push(`  name: '${name}'`);
      promptTypes.push(`  arguments: ${typeName}Arguments`);
      promptTypes.push(`  result: ${typeName}Result`);
      promptTypes.push('}\n');
    }

    // Generate prompt name union type
    promptTypes.push(`export type PromptName = ${promptNames.join(' | ')}\n`);

    // Generate prompt map type
    const promptMapEntries = Object.keys(prompts).map((name) => {
      const typeName = this.toTypeName(name);
      return `  '${name}': ${typeName}Prompt`;
    });
    promptTypes.push('export interface PromptMap {');
    promptTypes.push(...promptMapEntries);
    promptTypes.push('}\n');

    return promptTypes.join('\n');
  }

  private generateClientInterface(definitions: MCPTypeDefinitions): string {
    const clientTypes: string[] = [];

    clientTypes.push('// === Client Interface ===\n');

    clientTypes.push('export interface TypedMCPClient {');

    // Tool methods
    if (Object.keys(definitions.tools).length > 0) {
      clientTypes.push('  // Tool operations');
      clientTypes.push('  listTools(): Promise<ToolName[]>');

      for (const toolName of Object.keys(definitions.tools)) {
        const typeName = this.toTypeName(toolName);
        clientTypes.push(
          `  callTool(name: '${toolName}', args: ${typeName}Input): Promise<${typeName}Result>`,
        );
      }
    }

    // Resource methods
    if (Object.keys(definitions.resources).length > 0) {
      clientTypes.push('\n  // Resource operations');
      clientTypes.push('  listResources(): Promise<ResourceUri[]>');

      for (const resourceUri of Object.keys(definitions.resources)) {
        const typeName = this.toTypeName(resourceUri);
        clientTypes.push(
          `  readResource(uri: '${resourceUri}'): Promise<${typeName}Result>`,
        );
      }
    }

    // Prompt methods
    if (Object.keys(definitions.prompts).length > 0) {
      clientTypes.push('\n  // Prompt operations');
      clientTypes.push('  listPrompts(): Promise<PromptName[]>');

      for (const promptName of Object.keys(definitions.prompts)) {
        const typeName = this.toTypeName(promptName);
        clientTypes.push(
          `  getPrompt(name: '${promptName}', args: ${typeName}Arguments): Promise<${typeName}Result>`,
        );
      }
    }

    clientTypes.push('}\n');

    return clientTypes.join('\n');
  }

  private toTypeName(name: string): string {
    // Convert kebab-case, snake_case, and URI patterns to PascalCase
    return name
      .replace(/[^a-zA-Z0-9]/g, '_') // Replace non-alphanumeric with underscore
      .split('_')
      .map((part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
      .join('')
      .replace(/^([0-9])/, '_$1'); // Prefix with underscore if starts with number
  }

  private inferTypeFromDescription(description?: string): string {
    if (!description) return 'any';

    const desc = description.toLowerCase();

    if (
      desc.includes('number') ||
      desc.includes('count') ||
      desc.includes('age')
    ) {
      return 'number';
    }
    if (
      desc.includes('boolean') ||
      desc.includes('true') ||
      desc.includes('false')
    ) {
      return 'boolean';
    }
    if (desc.includes('array') || desc.includes('list')) {
      return 'any[]';
    }
    if (desc.includes('object')) {
      return 'Record<string, any>';
    }

    return 'string'; // Default to string
  }
}

/**
 * Utility function to extract MCP definitions from a running server
 */
export async function extractMCPDefinitions(
  serverEndpoint: string | unknown, // URL string or server instance
): Promise<MCPTypeDefinitions> {
  // This would integrate with actual MCP client to introspect server
  // For now, return a mock structure

  if (typeof serverEndpoint === 'string') {
    // HTTP endpoint - use MCP client to connect and introspect
    throw new Error('HTTP introspection not yet implemented');
  } else {
    // Direct server instance - extract from server object
    const server = serverEndpoint;

    return {
      serverInfo: {
        name: server.name || 'Unknown MCP Server',
        version: server.version || '1.0.0',
      },
      tools: server.tools || {},
      resources: server.resources || {},
      prompts: server.prompts || {},
    };
  }
}
