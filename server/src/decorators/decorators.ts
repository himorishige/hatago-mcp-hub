/**
 * MCP Decorators
 *
 * TypeScript decorators for defining MCP servers declaratively.
 */

import type { JSONSchema } from '@modelcontextprotocol/sdk/types.js';
import {
  extractInputSchemaFromMethod,
  type MCPClassMetadata,
  MetadataStore,
} from './metadata.js';

/**
 * Class decorator to mark a class as an MCP server
 */
export function mcp(options: {
  name: string;
  version: string;
  description?: string;
  capabilities?: {
    tools?: boolean;
    resources?: boolean;
    prompts?: boolean;
    logging?: boolean;
  };
}) {
  return <T extends new (...args: any[]) => {}>(constructor: T) => {
    const metadata: MCPClassMetadata = {
      name: options.name,
      version: options.version,
      description: options.description,
      capabilities: {
        tools: true,
        resources: true,
        prompts: true,
        logging: false,
        ...options.capabilities,
      },
    };

    MetadataStore.setMCPClass(constructor.prototype, metadata);
    return constructor;
  };
}

/**
 * Method decorator to mark a method as an MCP tool
 */
export function tool(options: {
  name?: string;
  description: string;
  inputSchema?: JSONSchema;
}) {
  return (
    target: any,
    propertyKey: string | symbol,
    _descriptor: PropertyDescriptor,
  ) => {
    const toolName = options.name || String(propertyKey);
    const inputSchema =
      options.inputSchema || extractInputSchemaFromMethod(target, propertyKey);

    MetadataStore.addTool(target, {
      name: toolName,
      description: options.description,
      inputSchema,
      propertyKey,
    });
  };
}

/**
 * Method decorator to mark a method as an MCP resource handler
 */
export function resource(options: {
  uri: string;
  name?: string;
  description?: string;
  mimeType?: string;
}) {
  return (
    target: any,
    propertyKey: string | symbol,
    _descriptor: PropertyDescriptor,
  ) => {
    MetadataStore.addResource(target, {
      uri: options.uri,
      name: options.name || options.uri,
      description: options.description,
      mimeType: options.mimeType || 'text/plain',
      propertyKey,
    });
  };
}

/**
 * Method decorator to mark a method as an MCP prompt handler
 */
export function prompt(options: {
  name?: string;
  description: string;
  arguments?: Array<{
    name: string;
    description?: string;
    required?: boolean;
  }>;
}) {
  return (
    target: any,
    propertyKey: string | symbol,
    _descriptor: PropertyDescriptor,
  ) => {
    const promptName = options.name || String(propertyKey);

    MetadataStore.addPrompt(target, {
      name: promptName,
      description: options.description,
      arguments: options.arguments || [],
      propertyKey,
    });
  };
}

/**
 * Utility decorators for common patterns
 */

/**
 * Mark a method parameter for automatic validation
 */
export function validate(_schema: JSONSchema) {
  return (
    _target: any,
    _propertyKey: string | symbol | undefined,
    _parameterIndex: number,
  ) => {
    // Parameter decorator - would integrate with validation middleware
    // In a full implementation, this would store parameter validation metadata
  };
}

/**
 * Mark a method as requiring authentication
 */
export function authenticated(
  _target: any,
  _propertyKey: string | symbol,
  _descriptor: PropertyDescriptor,
) {
  // Method decorator for authentication requirement
  // Would integrate with auth middleware
}

/**
 * Apply rate limiting to a method
 */
export function rateLimit(_options: { requests: number; windowMs: number }) {
  return (
    _target: any,
    _propertyKey: string | symbol,
    _descriptor: PropertyDescriptor,
  ) => {
    // Method decorator for rate limiting
    // Would integrate with rate limiting middleware
  };
}
