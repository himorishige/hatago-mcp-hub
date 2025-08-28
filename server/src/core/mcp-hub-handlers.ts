/**
 * Request handlers for MCP Hub
 * Handles tool calls, resource reads, and prompt processing
 */

import {
  type PromptRegistry,
  type ResourceRegistry,
  type RetryOptions,
  type ToolRegistry,
  withRetry,
} from '@hatago/runtime';
import type { Client } from '@modelcontextprotocol/sdk/client/index.js';
import type {
  CallToolRequest,
  CallToolResult,
  CompleteResourceRequest,
  CompleteResourceResult,
  GetPromptRequest,
  GetPromptResult,
  ReadResourceRequest,
  ReadResourceResult,
} from '@modelcontextprotocol/sdk/types.js';
import type { ServerRegistry } from '../servers/server-registry.js';
import { ErrorCode } from '../utils/error-codes.js';
import { ErrorHelpers, HatagoError } from '../utils/errors.js';
import { logger } from '../utils/logger.js';

/**
 * Handler configuration
 */
export interface HandlerConfig {
  serverRegistry: ServerRegistry;
  toolRegistry: ToolRegistry;
  resourceRegistry: ResourceRegistry;
  promptRegistry: PromptRegistry;
  retryOptions?: RetryOptions;
}

/**
 * Handles MCP requests
 */
export class McpHubHandlers {
  private serverRegistry: ServerRegistry;
  private toolRegistry: ToolRegistry;
  private resourceRegistry: ResourceRegistry;
  private promptRegistry: PromptRegistry;
  private retryOptions: RetryOptions;

  constructor(config: HandlerConfig) {
    this.serverRegistry = config.serverRegistry;
    this.toolRegistry = config.toolRegistry;
    this.resourceRegistry = config.resourceRegistry;
    this.promptRegistry = config.promptRegistry;
    this.retryOptions = config.retryOptions || {
      strategy: {
        maxAttempts: 3,
        initialDelay: 1000,
        maxDelay: 10000,
        multiplier: 2,
        jitter: true,
      },
    };
  }

  /**
   * Handle tool call request
   */
  async handleToolCall(request: CallToolRequest): Promise<CallToolResult> {
    const { name, arguments: args } = request.params;

    logger.debug(`Handling tool call: ${name}`, { args });

    // Resolve tool to server
    const resolved = this.toolRegistry.resolveTool(name);
    if (!resolved) {
      throw new HatagoError(
        ErrorCode.TOOL_NOT_FOUND,
        `Tool not found: ${name}`,
      );
    }

    const { serverId, originalName } = resolved;

    // Get server client
    const client = this.getServerClient(serverId);

    // Execute with retry
    const result = await withRetry(async () => {
      try {
        return await client.callTool({
          params: {
            name: originalName,
            arguments: args,
          },
        });
      } catch (error) {
        logger.error(`Tool call failed for ${name}:`, error);
        throw ErrorHelpers.createToolError(
          `Failed to call tool ${name}`,
          name,
          error,
        );
      }
    }, this.retryOptions);

    if (!result.success) {
      throw (
        result.error?.originalError || new Error(`Tool call failed: ${name}`)
      );
    }

    return result.value!;
  }

  /**
   * Handle resource read request
   */
  async handleResourceRead(
    request: ReadResourceRequest,
  ): Promise<ReadResourceResult> {
    const { uri } = request.params;

    logger.debug(`Handling resource read: ${uri}`);

    // Resolve resource to server
    const resolved = this.resourceRegistry.resolveResource(uri);
    if (!resolved) {
      throw new HatagoError(
        ErrorCode.RESOURCE_NOT_FOUND,
        `Resource not found: ${uri}`,
      );
    }

    const { serverId, originalUri } = resolved;

    // Get server client
    const client = this.getServerClient(serverId);

    // Execute with retry
    const result = await withRetry(async () => {
      try {
        return await client.readResource({
          params: { uri: originalUri },
        });
      } catch (error) {
        logger.error(`Resource read failed for ${uri}:`, error);
        throw ErrorHelpers.createResourceError(
          `Failed to read resource ${uri}`,
          uri,
          error,
        );
      }
    }, this.retryOptions);

    if (!result.success) {
      throw (
        result.error?.originalError || new Error(`Resource read failed: ${uri}`)
      );
    }

    return result.value!;
  }

  /**
   * Handle prompt get request
   */
  async handlePromptGet(request: GetPromptRequest): Promise<GetPromptResult> {
    const { name, arguments: args } = request.params;

    logger.debug(`Handling prompt get: ${name}`, { args });

    // Resolve prompt to server
    const resolved = this.promptRegistry.resolvePrompt(name);
    if (!resolved) {
      throw new HatagoError(
        ErrorCode.PROMPT_NOT_FOUND,
        `Prompt not found: ${name}`,
      );
    }

    const { serverId, originalName } = resolved;

    // Get server client
    const client = this.getServerClient(serverId);

    // Execute with retry
    const result = await withRetry(async () => {
      try {
        // Check if client supports getPrompt
        if (!client.getPrompt) {
          throw new Error(`Server ${serverId} does not support prompts`);
        }

        return await client.getPrompt({
          params: {
            name: originalName,
            arguments: args,
          },
        });
      } catch (error) {
        logger.error(`Prompt get failed for ${name}:`, error);
        throw new HatagoError(
          ErrorCode.PROMPT_ERROR,
          `Failed to get prompt ${name}`,
          { name, serverId },
          error,
        );
      }
    }, this.retryOptions);

    if (!result.success) {
      throw (
        result.error?.originalError || new Error(`Prompt get failed: ${name}`)
      );
    }

    return result.value!;
  }

  /**
   * Handle resource completion request
   */
  async handleResourceComplete(
    request: CompleteResourceRequest,
  ): Promise<CompleteResourceResult> {
    const { ref, argument } = request.params;

    logger.debug(`Handling resource completion:`, { ref, argument });

    // Parse ref to extract server ID
    const parts = ref.uri.split('_');
    if (parts.length < 2) {
      throw new HatagoError(
        ErrorCode.INVALID_REQUEST,
        `Invalid resource reference: ${ref.uri}`,
      );
    }

    const serverId = parts[parts.length - 1];
    const originalUri = parts.slice(0, -1).join('_');

    // Get server client
    const client = this.getServerClient(serverId);

    // Check if client supports completion
    if (!client.completeResource) {
      return { completion: { values: [] } };
    }

    // Execute with retry
    const result = await withRetry(
      async () => {
        try {
          return await client.completeResource?.({
            params: {
              ref: { uri: originalUri },
              argument,
            },
          });
        } catch (error) {
          logger.error(`Resource completion failed:`, error);
          // Completion failures are not critical
          return { completion: { values: [] } };
        }
      },
      {
        ...this.retryOptions,
        strategy: {
          ...this.retryOptions.strategy!,
          maxAttempts: 2, // Less retries for completion
        },
      },
    );

    return result.success ? result.value! : { completion: { values: [] } };
  }

  /**
   * Get server client
   */
  private getServerClient(serverId: string): Client {
    const serverInfo = this.serverRegistry.getServer(serverId);
    if (!serverInfo?.client) {
      throw new HatagoError(
        ErrorCode.SERVER_NOT_CONNECTED,
        `Server not connected: ${serverId}`,
        { serverId },
      );
    }

    return serverInfo.client;
  }

  /**
   * Check if handler can process a method
   */
  canHandle(method: string): boolean {
    const handledMethods = [
      'tools/call',
      'resources/read',
      'prompts/get',
      'completion/complete',
    ];
    return handledMethods.includes(method);
  }

  /**
   * Route request to appropriate handler
   */
  async handleRequest(method: string, params: any): Promise<any> {
    switch (method) {
      case 'tools/call':
        return this.handleToolCall({ params });

      case 'resources/read':
        return this.handleResourceRead({ params });

      case 'prompts/get':
        return this.handlePromptGet({ params });

      case 'completion/complete':
        return this.handleResourceComplete({ params });

      default:
        throw new HatagoError(
          ErrorCode.METHOD_NOT_FOUND,
          `Method not supported: ${method}`,
        );
    }
  }
}

/**
 * Create request handlers
 */
export function createHandlers(config: HandlerConfig): McpHubHandlers {
  return new McpHubHandlers(config);
}
