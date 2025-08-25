/**
 * MCP Test Utilities
 *
 * Testing utilities for MCP servers and tools.
 */

import { EventEmitter } from 'node:events';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import type {
  CallToolResult,
  GetPromptResult,
  Prompt,
  ReadResourceResult,
  Resource,
  Tool,
} from '@modelcontextprotocol/sdk/types.js';

export interface MockTransport {
  connect(): Promise<void>;
  disconnect(): Promise<void>;
  send(message: any): Promise<any>;
}

export interface MockMCPServerOptions {
  name?: string;
  version?: string;
  tools?: Tool[];
  resources?: Resource[];
  prompts?: Prompt[];
  capabilities?: {
    tools?: boolean;
    resources?: boolean;
    prompts?: boolean;
    logging?: boolean;
  };
}

export interface TestToolCall {
  name: string;
  arguments: any;
  expectedResult?: any;
  expectedError?: string | Error;
  timeout?: number;
}

export interface TestResourceRead {
  uri: string;
  expectedContent?: any;
  expectedError?: string | Error;
  timeout?: number;
}

export interface TestPromptCall {
  name: string;
  arguments: any;
  expectedPrompt?: any;
  expectedError?: string | Error;
  timeout?: number;
}

export class MockMCPServer extends EventEmitter {
  private _tools: Map<string, Tool> = new Map();
  private _resources: Map<string, Resource> = new Map();
  private _prompts: Map<string, Prompt> = new Map();
  private _capabilities: Required<
    NonNullable<MockMCPServerOptions['capabilities']>
  >;
  private _toolHandlers: Map<string, (args: any) => Promise<any>> = new Map();
  private _resourceHandlers: Map<string, () => Promise<any>> = new Map();
  private _promptHandlers: Map<string, (args: any) => Promise<any>> = new Map();

  public readonly name: string;
  public readonly version: string;

  constructor(options: MockMCPServerOptions = {}) {
    super();

    this.name = options.name || 'Mock MCP Server';
    this.version = options.version || '1.0.0';

    this._capabilities = {
      tools: options.capabilities?.tools ?? true,
      resources: options.capabilities?.resources ?? true,
      prompts: options.capabilities?.prompts ?? true,
      logging: options.capabilities?.logging ?? false,
    };

    // Initialize with provided tools/resources/prompts
    if (options.tools) {
      for (const tool of options.tools) {
        this._tools.set(tool.name, tool);
      }
    }

    if (options.resources) {
      for (const resource of options.resources) {
        this._resources.set(resource.uri, resource);
      }
    }

    if (options.prompts) {
      for (const prompt of options.prompts) {
        this._prompts.set(prompt.name, prompt);
      }
    }
  }

  /**
   * Add a tool to the mock server
   */
  addTool(tool: Tool, handler: (args: any) => Promise<any>): void {
    this._tools.set(tool.name, tool);
    this._toolHandlers.set(tool.name, handler);
    this.emit('tool-added', tool);
  }

  /**
   * Add a resource to the mock server
   */
  addResource(resource: Resource, handler: () => Promise<any>): void {
    this._resources.set(resource.uri, resource);
    this._resourceHandlers.set(resource.uri, handler);
    this.emit('resource-added', resource);
  }

  /**
   * Add a prompt to the mock server
   */
  addPrompt(prompt: Prompt, handler: (args: any) => Promise<any>): void {
    this._prompts.set(prompt.name, prompt);
    this._promptHandlers.set(prompt.name, handler);
    this.emit('prompt-added', prompt);
  }

  /**
   * Handle MCP method calls
   */
  async handleRequest(method: string, params: any): Promise<any> {
    switch (method) {
      case 'initialize':
        return {
          protocolVersion: '2024-11-05',
          capabilities: {
            tools: this._capabilities.tools ? { listChanged: true } : undefined,
            resources: this._capabilities.resources
              ? { subscribe: true, listChanged: true }
              : undefined,
            prompts: this._capabilities.prompts
              ? { listChanged: true }
              : undefined,
            logging: this._capabilities.logging ? {} : undefined,
          },
          serverInfo: {
            name: this.name,
            version: this.version,
          },
        };

      case 'tools/list':
        if (!this._capabilities.tools) {
          throw new Error('Tools capability not enabled');
        }
        return { tools: Array.from(this._tools.values()) };

      case 'tools/call':
        if (!this._capabilities.tools) {
          throw new Error('Tools capability not enabled');
        }
        return await this.handleToolCall(params);

      case 'resources/list':
        if (!this._capabilities.resources) {
          throw new Error('Resources capability not enabled');
        }
        return { resources: Array.from(this._resources.values()) };

      case 'resources/read':
        if (!this._capabilities.resources) {
          throw new Error('Resources capability not enabled');
        }
        return await this.handleResourceRead(params);

      case 'prompts/list':
        if (!this._capabilities.prompts) {
          throw new Error('Prompts capability not enabled');
        }
        return { prompts: Array.from(this._prompts.values()) };

      case 'prompts/get':
        if (!this._capabilities.prompts) {
          throw new Error('Prompts capability not enabled');
        }
        return await this.handlePromptGet(params);

      default:
        throw new Error(`Unknown method: ${method}`);
    }
  }

  private async handleToolCall(params: any): Promise<CallToolResult> {
    const { name, arguments: args } = params;

    if (!this._tools.has(name)) {
      throw new Error(`Tool not found: ${name}`);
    }

    const handler = this._toolHandlers.get(name);
    if (!handler) {
      throw new Error(`No handler registered for tool: ${name}`);
    }

    try {
      const result = await handler(args);

      this.emit('tool-called', { name, arguments: args, result });

      return {
        content: [
          {
            type: 'text',
            text: typeof result === 'string' ? result : JSON.stringify(result),
          },
        ],
      };
    } catch (error) {
      this.emit('tool-error', { name, arguments: args, error });
      throw error;
    }
  }

  private async handleResourceRead(params: any): Promise<ReadResourceResult> {
    const { uri } = params;

    if (!this._resources.has(uri)) {
      throw new Error(`Resource not found: ${uri}`);
    }

    const handler = this._resourceHandlers.get(uri);
    if (!handler) {
      throw new Error(`No handler registered for resource: ${uri}`);
    }

    try {
      const content = await handler();

      this.emit('resource-read', { uri, content });

      return {
        contents: [
          {
            uri,
            mimeType: this._resources.get(uri)?.mimeType || 'text/plain',
            text:
              typeof content === 'string' ? content : JSON.stringify(content),
          },
        ],
      };
    } catch (error) {
      this.emit('resource-error', { uri, error });
      throw error;
    }
  }

  private async handlePromptGet(params: any): Promise<GetPromptResult> {
    const { name, arguments: args } = params;

    if (!this._prompts.has(name)) {
      throw new Error(`Prompt not found: ${name}`);
    }

    const handler = this._promptHandlers.get(name);
    if (!handler) {
      throw new Error(`No handler registered for prompt: ${name}`);
    }

    try {
      const result = await handler(args);

      this.emit('prompt-called', { name, arguments: args, result });

      return {
        description: result.description || `Generated prompt for ${name}`,
        messages: result.messages || [
          {
            role: 'user',
            content: {
              type: 'text',
              text:
                typeof result === 'string' ? result : JSON.stringify(result),
            },
          },
        ],
      };
    } catch (error) {
      this.emit('prompt-error', { name, arguments: args, error });
      throw error;
    }
  }

  /**
   * Get server statistics
   */
  getStats() {
    return {
      tools: this._tools.size,
      resources: this._resources.size,
      prompts: this._prompts.size,
      capabilities: this._capabilities,
    };
  }
}

export class MCPTestClient {
  private client: Client;
  private server: MockMCPServer;
  private connected = false;

  constructor(server: MockMCPServer) {
    this.server = server;
    this.client = new Client(
      { name: 'Test Client', version: '1.0.0' },
      { capabilities: {} },
    );
  }

  /**
   * Connect to the mock server
   */
  async connect(): Promise<void> {
    if (this.connected) return;

    // Create a mock transport that routes directly to the server
    const mockTransport: any = {
      start: async () => {},
      close: async () => {},
      send: async (request: any) => {
        return await this.server.handleRequest(request.method, request.params);
      },
    };

    await this.client.connect(mockTransport);
    this.connected = true;
  }

  /**
   * Disconnect from the server
   */
  async disconnect(): Promise<void> {
    if (!this.connected) return;

    await this.client.close();
    this.connected = false;
  }

  /**
   * Test tool calls with assertions
   */
  async testToolCalls(testCalls: TestToolCall[]): Promise<void> {
    for (const testCall of testCalls) {
      try {
        const result = await this.callTool(
          testCall.name,
          testCall.arguments,
          testCall.timeout,
        );

        if (testCall.expectedResult !== undefined) {
          this.assertResult(
            result,
            testCall.expectedResult,
            `Tool ${testCall.name}`,
          );
        }

        if (testCall.expectedError) {
          throw new Error(
            `Expected error but got result for tool ${testCall.name}`,
          );
        }
      } catch (error) {
        if (testCall.expectedError) {
          this.assertError(
            error,
            testCall.expectedError,
            `Tool ${testCall.name}`,
          );
        } else {
          throw error;
        }
      }
    }
  }

  /**
   * Test resource reads with assertions
   */
  async testResourceReads(testReads: TestResourceRead[]): Promise<void> {
    for (const testRead of testReads) {
      try {
        const result = await this.readResource(testRead.uri, testRead.timeout);

        if (testRead.expectedContent !== undefined) {
          this.assertResult(
            result,
            testRead.expectedContent,
            `Resource ${testRead.uri}`,
          );
        }

        if (testRead.expectedError) {
          throw new Error(
            `Expected error but got result for resource ${testRead.uri}`,
          );
        }
      } catch (error) {
        if (testRead.expectedError) {
          this.assertError(
            error,
            testRead.expectedError,
            `Resource ${testRead.uri}`,
          );
        } else {
          throw error;
        }
      }
    }
  }

  /**
   * Test prompt calls with assertions
   */
  async testPromptCalls(testCalls: TestPromptCall[]): Promise<void> {
    for (const testCall of testCalls) {
      try {
        const result = await this.getPrompt(
          testCall.name,
          testCall.arguments,
          testCall.timeout,
        );

        if (testCall.expectedPrompt !== undefined) {
          this.assertResult(
            result,
            testCall.expectedPrompt,
            `Prompt ${testCall.name}`,
          );
        }

        if (testCall.expectedError) {
          throw new Error(
            `Expected error but got result for prompt ${testCall.name}`,
          );
        }
      } catch (error) {
        if (testCall.expectedError) {
          this.assertError(
            error,
            testCall.expectedError,
            `Prompt ${testCall.name}`,
          );
        } else {
          throw error;
        }
      }
    }
  }

  private async callTool(
    name: string,
    args: any,
    timeoutMs = 5000,
  ): Promise<any> {
    return this.withTimeout(
      this.client.request({ method: 'tools/call' }, { name, arguments: args }),
      timeoutMs,
      `Tool call ${name}`,
    );
  }

  private async readResource(uri: string, timeoutMs = 5000): Promise<any> {
    return this.withTimeout(
      this.client.request({ method: 'resources/read' }, { uri }),
      timeoutMs,
      `Resource read ${uri}`,
    );
  }

  private async getPrompt(
    name: string,
    args: any,
    timeoutMs = 5000,
  ): Promise<any> {
    return this.withTimeout(
      this.client.request({ method: 'prompts/get' }, { name, arguments: args }),
      timeoutMs,
      `Prompt get ${name}`,
    );
  }

  private async withTimeout<T>(
    promise: Promise<T>,
    timeoutMs: number,
    operation: string,
  ): Promise<T> {
    const timeout = new Promise<never>((_, reject) => {
      setTimeout(
        () => reject(new Error(`${operation} timed out after ${timeoutMs}ms`)),
        timeoutMs,
      );
    });

    return await Promise.race([promise, timeout]);
  }

  private assertResult(actual: any, expected: any, context: string): void {
    if (typeof expected === 'function') {
      // Custom assertion function
      if (!expected(actual)) {
        throw new Error(`${context}: Custom assertion failed`);
      }
    } else if (typeof expected === 'object' && expected !== null) {
      // Deep object comparison
      if (!this.deepEqual(actual, expected)) {
        throw new Error(
          `${context}: Expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`,
        );
      }
    } else {
      // Simple equality
      if (actual !== expected) {
        throw new Error(`${context}: Expected ${expected}, got ${actual}`);
      }
    }
  }

  private assertError(
    error: any,
    expected: string | Error,
    context: string,
  ): void {
    const errorMessage = error instanceof Error ? error.message : String(error);
    const expectedMessage =
      expected instanceof Error ? expected.message : expected;

    if (!errorMessage.includes(expectedMessage)) {
      throw new Error(
        `${context}: Expected error containing "${expectedMessage}", got "${errorMessage}"`,
      );
    }
  }

  private deepEqual(a: any, b: any): boolean {
    if (a === b) return true;
    if (a == null || b == null) return false;
    if (typeof a !== typeof b) return false;

    if (typeof a === 'object') {
      const keysA = Object.keys(a);
      const keysB = Object.keys(b);

      if (keysA.length !== keysB.length) return false;

      for (const key of keysA) {
        if (!keysB.includes(key)) return false;
        if (!this.deepEqual(a[key], b[key])) return false;
      }
    }

    return true;
  }
}

/**
 * Helper function to create a test environment
 */
export async function createTestEnvironment(
  serverOptions: MockMCPServerOptions = {},
): Promise<{ server: MockMCPServer; client: MCPTestClient }> {
  const server = new MockMCPServer(serverOptions);
  const client = new MCPTestClient(server);

  await client.connect();

  return { server, client };
}

/**
 * Helper function to run a complete MCP test suite
 */
export async function runMCPTestSuite(options: {
  server: MockMCPServer;
  toolTests?: TestToolCall[];
  resourceTests?: TestResourceRead[];
  promptTests?: TestPromptCall[];
}): Promise<void> {
  const client = new MCPTestClient(options.server);

  try {
    await client.connect();

    if (options.toolTests) {
      await client.testToolCalls(options.toolTests);
    }

    if (options.resourceTests) {
      await client.testResourceReads(options.resourceTests);
    }

    if (options.promptTests) {
      await client.testPromptCalls(options.promptTests);
    }
  } finally {
    await client.disconnect();
  }
}
