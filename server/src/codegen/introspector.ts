/**
 * MCP Server Introspector
 *
 * Extracts type information from MCP servers for code generation.
 */

import { EventEmitter } from 'node:events';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import type {
  Prompt,
  Resource,
  Tool,
} from '@modelcontextprotocol/sdk/types.js';
import { logger } from '../observability/structured-logger.js';
import { WebSocketTransport } from '../transport/websocket.js';
import type { MCPTypeDefinitions } from './type-generator.js';

export interface IntrospectionOptions {
  timeoutMs?: number;
  retries?: number;
  includeSchema?: boolean;
}

export interface ServerTarget {
  type: 'stdio' | 'http' | 'websocket' | 'npx';
  endpoint?: string; // URL for http/websocket
  command?: string; // Command for stdio/npx
  args?: string[]; // Arguments for stdio/npx
  cwd?: string; // Working directory for stdio/npx
  env?: Record<string, string>; // Environment variables
}

export class MCPIntrospector extends EventEmitter {
  private options: Required<IntrospectionOptions>;

  constructor(options: IntrospectionOptions = {}) {
    super();
    this.options = {
      timeoutMs: options.timeoutMs ?? 30000,
      retries: options.retries ?? 3,
      includeSchema: options.includeSchema ?? true,
    };
  }

  /**
   * Introspect an MCP server to extract type definitions
   */
  async introspect(target: ServerTarget): Promise<MCPTypeDefinitions> {
    logger.info('Starting MCP server introspection', {
      type: target.type,
      endpoint: target.endpoint,
      command: target.command,
    });

    let attempt = 0;
    let lastError: Error | undefined;

    while (attempt < this.options.retries) {
      try {
        return await this.performIntrospection(target);
      } catch (error) {
        lastError = error as Error;
        attempt++;

        if (attempt < this.options.retries) {
          logger.warn('Introspection attempt failed, retrying', {
            attempt,
            error: lastError.message,
            remainingRetries: this.options.retries - attempt,
          });

          // Exponential backoff
          await this.delay(2 ** attempt * 1000);
        }
      }
    }

    throw new Error(
      `Failed to introspect MCP server after ${this.options.retries} attempts: ${lastError?.message}`,
    );
  }

  private async performIntrospection(
    target: ServerTarget,
  ): Promise<MCPTypeDefinitions> {
    switch (target.type) {
      case 'stdio':
        return await this.introspectStdio(target);
      case 'npx':
        return await this.introspectNpx(target);
      case 'websocket':
        return await this.introspectWebSocket(target);
      case 'http':
        return await this.introspectHttp(target);
      default:
        throw new Error(
          `Unsupported server type: ${(target as { type?: string }).type}`,
        );
    }
  }

  private async introspectStdio(
    target: ServerTarget,
  ): Promise<MCPTypeDefinitions> {
    if (!target.command) {
      throw new Error('Command is required for stdio introspection');
    }

    const transport = new StdioClientTransport({
      command: target.command,
      args: target.args || [],
      env: { ...process.env, ...target.env },
    });

    const client = new Client(
      { name: 'hatago-introspector', version: '1.0.0' },
      { capabilities: {} },
    );

    try {
      await client.connect(transport);
      return await this.extractDefinitions(client);
    } finally {
      await client.close();
    }
  }

  private async introspectNpx(
    target: ServerTarget,
  ): Promise<MCPTypeDefinitions> {
    if (!target.command) {
      throw new Error('Package name is required for npx introspection');
    }

    // Create temporary npm process
    const _args = ['npx', '--yes', target.command, ...(target.args || [])];

    const transport = new StdioClientTransport({
      command: 'node',
      args: ['-e', this.generateNpxWrapper(target.command, target.args || [])],
      env: { ...process.env, ...target.env },
      stderr: 'pipe', // Capture stderr for debugging
    });

    const client = new Client(
      { name: 'hatago-introspector', version: '1.0.0' },
      { capabilities: {} },
    );

    try {
      await client.connect(transport);
      return await this.extractDefinitions(client);
    } finally {
      await client.close();
    }
  }

  private async introspectWebSocket(
    target: ServerTarget,
  ): Promise<MCPTypeDefinitions> {
    if (!target.endpoint) {
      throw new Error('WebSocket endpoint is required');
    }

    const transport = new WebSocketTransport({
      url: target.endpoint,
    });

    const client = new Client(
      { name: 'hatago-introspector', version: '1.0.0' },
      { capabilities: {} },
    );

    try {
      await client.connect(transport as Transport);
      return await this.extractDefinitions(client);
    } finally {
      await client.close();
    }
  }

  private async introspectHttp(
    _target: ServerTarget,
  ): Promise<MCPTypeDefinitions> {
    // HTTP introspection would use StreamableHTTP transport
    throw new Error('HTTP introspection not yet implemented');
  }

  private async extractDefinitions(
    client: Client,
  ): Promise<MCPTypeDefinitions> {
    const startTime = Date.now();

    try {
      // Extract server info
      const serverInfo = {
        name: 'Unknown MCP Server',
        version: '1.0.0',
      };

      // List and extract tools
      const toolsResponse = await Promise.race([
        client.request({ method: 'tools/list' }, {}),
        this.timeoutPromise('tools/list'),
      ]);

      const tools: Record<string, Tool> = {};
      if (toolsResponse.tools) {
        for (const tool of toolsResponse.tools) {
          tools[tool.name] = tool;
        }
      }

      // List and extract resources
      const resourcesResponse = await Promise.race([
        client.request({ method: 'resources/list' }, {}),
        this.timeoutPromise('resources/list'),
      ]);

      const resources: Record<string, Resource> = {};
      if (resourcesResponse.resources) {
        for (const resource of resourcesResponse.resources) {
          resources[resource.uri] = resource;
        }
      }

      // List and extract prompts
      const promptsResponse = await Promise.race([
        client.request({ method: 'prompts/list' }, {}),
        this.timeoutPromise('prompts/list'),
      ]);

      const prompts: Record<string, Prompt> = {};
      if (promptsResponse.prompts) {
        for (const prompt of promptsResponse.prompts) {
          prompts[prompt.name] = prompt;
        }
      }

      const definitions: MCPTypeDefinitions = {
        serverInfo,
        tools,
        resources,
        prompts,
      };

      const duration = Date.now() - startTime;

      logger.info('MCP server introspection completed', {
        duration,
        toolCount: Object.keys(tools).length,
        resourceCount: Object.keys(resources).length,
        promptCount: Object.keys(prompts).length,
      });

      this.emit('introspection-complete', {
        definitions,
        duration,
        counts: {
          tools: Object.keys(tools).length,
          resources: Object.keys(resources).length,
          prompts: Object.keys(prompts).length,
        },
      });

      return definitions;
    } catch (error) {
      const duration = Date.now() - startTime;

      logger.error('MCP server introspection failed', {
        duration,
        error: error instanceof Error ? error.message : String(error),
      });

      this.emit('introspection-error', { error, duration });
      throw error;
    }
  }

  private generateNpxWrapper(packageName: string, args: string[]): string {
    // Generate a Node.js wrapper that spawns the npx process
    return `
      const { spawn } = require('child_process');
      const process = require('process');
      
      const child = spawn('npx', ['--yes', '${packageName}', ...${JSON.stringify(args)}], {
        stdio: ['pipe', 'pipe', 'inherit'],
        env: process.env
      });
      
      // Forward stdin/stdout
      process.stdin.pipe(child.stdin);
      child.stdout.pipe(process.stdout);
      
      child.on('exit', (code) => {
        process.exit(code || 0);
      });
      
      child.on('error', (error) => {
        console.error('NPX process error:', error);
        process.exit(1);
      });
    `;
  }

  private timeoutPromise<T>(operation: string): Promise<T> {
    return new Promise((_, reject) => {
      setTimeout(() => {
        reject(
          new Error(
            `Timeout after ${this.options.timeoutMs}ms waiting for ${operation}`,
          ),
        );
      }, this.options.timeoutMs);
    });
  }

  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}

/**
 * Convenience function for quick introspection
 */
export async function introspectMCPServer(
  target: ServerTarget,
  options?: IntrospectionOptions,
): Promise<MCPTypeDefinitions> {
  const introspector = new MCPIntrospector(options);
  return await introspector.introspect(target);
}
