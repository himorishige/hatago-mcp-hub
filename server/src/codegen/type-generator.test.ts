import { beforeEach, describe, expect, it } from 'vitest';
import { type MCPTypeDefinitions, TypeGenerator } from './type-generator.js';

describe('TypeGenerator', () => {
  let generator: TypeGenerator;
  let mockDefinitions: MCPTypeDefinitions;

  beforeEach(() => {
    generator = new TypeGenerator({
      namespace: 'TestMCP',
      includeComments: true,
      strictMode: true,
    });

    mockDefinitions = {
      serverInfo: {
        name: 'Test MCP Server',
        version: '1.0.0',
      },
      tools: {
        'greet-user': {
          name: 'greet-user',
          description: 'Greets a user with a personalized message',
          inputSchema: {
            type: 'object',
            properties: {
              name: {
                type: 'string',
                description: 'The name of the user to greet',
              },
              greeting: {
                type: 'string',
                description: 'Optional greeting prefix',
                default: 'Hello',
              },
            },
            required: ['name'],
          },
        },
        'calculate-sum': {
          name: 'calculate-sum',
          description: 'Calculates the sum of two numbers',
          inputSchema: {
            type: 'object',
            properties: {
              a: { type: 'number' },
              b: { type: 'number' },
            },
            required: ['a', 'b'],
          },
        },
      },
      resources: {
        'file://test.txt': {
          uri: 'file://test.txt',
          name: 'Test File',
          description: 'A test text file',
          mimeType: 'text/plain',
        },
        'config://settings': {
          uri: 'config://settings',
          name: 'Configuration Settings',
          description: 'Application configuration',
        },
      },
      prompts: {
        'summarize-text': {
          name: 'summarize-text',
          description: 'Generates a summary of the provided text',
          arguments: [
            {
              name: 'text',
              description: 'The text to summarize',
              required: true,
            },
            {
              name: 'maxLength',
              description: 'Maximum length of the summary in words',
              required: false,
            },
          ],
        },
      },
    };
  });

  it('should generate TypeScript types from MCP definitions', async () => {
    const result = await generator.generateTypes(mockDefinitions);

    expect(result).toContain(
      'Auto-generated TypeScript types for MCP Server: Test MCP Server',
    );
    expect(result).toContain('Version: 1.0.0');
    expect(result).toContain('WARNING: This file is auto-generated');
  });

  it('should generate tool types correctly', async () => {
    const result = await generator.generateTypes(mockDefinitions);

    // Check tool input interfaces
    expect(result).toContain('export interface GreetUserInput');
    expect(result).toContain('name: string');
    expect(result).toContain('greeting?: string');

    expect(result).toContain('export interface CalculateSumInput');
    expect(result).toContain('a: number');
    expect(result).toContain('b: number');

    // Check tool result types
    expect(result).toContain('export type GreetUserResult = CallToolResult');
    expect(result).toContain('export type CalculateSumResult = CallToolResult');

    // Check tool interfaces
    expect(result).toContain('export interface GreetUserTool');
    expect(result).toContain("name: 'greet-user'");
    expect(result).toContain('input: GreetUserInput');
    expect(result).toContain('result: GreetUserResult');

    // Check tool union and map types
    expect(result).toContain(
      "export type ToolName = 'greet-user' | 'calculate-sum'",
    );
    expect(result).toContain('export interface ToolMap');
    expect(result).toContain("'greet-user': GreetUserTool");
    expect(result).toContain("'calculate-sum': CalculateSumTool");
  });

  it('should generate resource types correctly', async () => {
    const result = await generator.generateTypes(mockDefinitions);

    // Check resource interfaces
    expect(result).toContain('export interface FileTestTxtResource');
    expect(result).toContain("uri: 'file://test.txt'");
    expect(result).toContain("name: 'Test File'");
    expect(result).toContain("mimeType: 'text/plain'");

    expect(result).toContain('export interface ConfigSettingsResource');
    expect(result).toContain("uri: 'config://settings'");

    // Check resource result types
    expect(result).toContain(
      'export type FileTestTxtResult = ReadResourceResult',
    );
    expect(result).toContain(
      'export type ConfigSettingsResult = ReadResourceResult',
    );

    // Check resource union and map types
    expect(result).toContain(
      "export type ResourceUri = 'file://test.txt' | 'config://settings'",
    );
    expect(result).toContain('export interface ResourceMap');
    expect(result).toContain("'file://test.txt': FileTestTxtResource");
    expect(result).toContain("'config://settings': ConfigSettingsResource");
  });

  it('should generate prompt types correctly', async () => {
    const result = await generator.generateTypes(mockDefinitions);

    // Check prompt argument interfaces
    expect(result).toContain('export interface SummarizeTextArguments');
    expect(result).toContain('text: string');
    expect(result).toContain('maxLength?: number');

    // Check prompt result types
    expect(result).toContain(
      'export type SummarizeTextResult = GetPromptResult',
    );

    // Check prompt interfaces
    expect(result).toContain('export interface SummarizeTextPrompt');
    expect(result).toContain("name: 'summarize-text'");
    expect(result).toContain('arguments: SummarizeTextArguments');

    // Check prompt union and map types
    expect(result).toContain("export type PromptName = 'summarize-text'");
    expect(result).toContain('export interface PromptMap');
    expect(result).toContain("'summarize-text': SummarizeTextPrompt");
  });

  it('should generate typed client interface', async () => {
    const result = await generator.generateTypes(mockDefinitions);

    expect(result).toContain('export interface TypedMCPClient');

    // Tool operations
    expect(result).toContain('listTools(): Promise<ToolName[]>');
    expect(result).toContain(
      "callTool(name: 'greet-user', args: GreetUserInput): Promise<GreetUserResult>",
    );
    expect(result).toContain(
      "callTool(name: 'calculate-sum', args: CalculateSumInput): Promise<CalculateSumResult>",
    );

    // Resource operations
    expect(result).toContain('listResources(): Promise<ResourceUri[]>');
    expect(result).toContain(
      "readResource(uri: 'file://test.txt'): Promise<FileTestTxtResult>",
    );
    expect(result).toContain(
      "readResource(uri: 'config://settings'): Promise<ConfigSettingsResult>",
    );

    // Prompt operations
    expect(result).toContain('listPrompts(): Promise<PromptName[]>');
    expect(result).toContain(
      "getPrompt(name: 'summarize-text', args: SummarizeTextArguments): Promise<SummarizeTextResult>",
    );
  });

  it('should include comments when enabled', async () => {
    const result = await generator.generateTypes(mockDefinitions);

    expect(result).toContain(
      '/**\n * Greets a user with a personalized message\n */',
    );
    expect(result).toContain('/**\n * A test text file\n */');
    expect(result).toContain(
      '/**\n * Generates a summary of the provided text\n */',
    );
  });

  it('should handle empty definitions gracefully', async () => {
    const emptyDefinitions: MCPTypeDefinitions = {
      serverInfo: { name: 'Empty Server' },
      tools: {},
      resources: {},
      prompts: {},
    };

    const result = await generator.generateTypes(emptyDefinitions);

    expect(result).toContain(
      'Auto-generated TypeScript types for MCP Server: Empty Server',
    );
    expect(result).toContain('export interface TypedMCPClient {');
    // Should not contain any tool/resource/prompt specific types
    expect(result).not.toContain('export type ToolName =');
    expect(result).not.toContain('export type ResourceUri =');
    expect(result).not.toContain('export type PromptName =');
  });

  it('should handle invalid JSON schemas gracefully', async () => {
    const invalidDefinitions: MCPTypeDefinitions = {
      serverInfo: { name: 'Test Server' },
      tools: {
        'invalid-tool': {
          name: 'invalid-tool',
          description: 'Tool with invalid schema',
          inputSchema: {
            // Invalid schema that might cause json-schema-to-typescript to fail
            type: 'invalid-type',
          } as unknown as JSONSchema,
        },
      },
      resources: {},
      prompts: {},
    };

    const result = await generator.generateTypes(invalidDefinitions);

    // Should fallback to generic input type
    expect(result).toContain('export interface InvalidToolInput');
    expect(result).toContain('[key: string]: any');
  });

  it('should convert names to valid TypeScript identifiers', async () => {
    const complexNames: MCPTypeDefinitions = {
      serverInfo: { name: 'Test Server' },
      tools: {
        'tool-with-dashes': {
          name: 'tool-with-dashes',
          description: 'Tool with dashes in name',
        },
        tool_with_underscores: {
          name: 'tool_with_underscores',
          description: 'Tool with underscores',
        },
        '123-numeric-start': {
          name: '123-numeric-start',
          description: 'Tool starting with number',
        },
      },
      resources: {},
      prompts: {},
    };

    const result = await generator.generateTypes(complexNames);

    expect(result).toContain('export interface ToolWithDashesInput');
    expect(result).toContain('export interface ToolWithUnderscoresInput');
    expect(result).toContain('export interface _123NumericStartInput'); // Should prefix with underscore
  });
});
