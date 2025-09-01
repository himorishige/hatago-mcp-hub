/**
 * Configuration schemas for Hatago MCP Hub
 * Using Zod for runtime validation and type inference
 */

import { z } from 'zod';

// Constants
export const MIN_TIMEOUT_MS = 1000; // 1 second
export const MAX_TIMEOUT_MS = 300000; // 5 minutes
export const DEFAULT_CONNECT_TIMEOUT_MS = 5000; // 5 seconds
export const DEFAULT_REQUEST_TIMEOUT_MS = 30000; // 30 seconds
export const DEFAULT_KEEPALIVE_TIMEOUT_MS = 20000; // 20 seconds

/**
 * Timeout configuration schema
 */
export const TimeoutConfigSchema = z.object({
  connectMs: z
    .number()
    .min(MIN_TIMEOUT_MS)
    .max(MAX_TIMEOUT_MS)
    .optional()
    .default(DEFAULT_CONNECT_TIMEOUT_MS)
    .describe('Connection timeout in milliseconds'),
  requestMs: z
    .number()
    .min(MIN_TIMEOUT_MS)
    .max(MAX_TIMEOUT_MS)
    .optional()
    .default(DEFAULT_REQUEST_TIMEOUT_MS)
    .describe('Request timeout in milliseconds'),
  keepAliveMs: z
    .number()
    .min(MIN_TIMEOUT_MS)
    .max(MAX_TIMEOUT_MS)
    .optional()
    .default(DEFAULT_KEEPALIVE_TIMEOUT_MS)
    .describe('Keep-alive timeout in milliseconds')
});

/**
 * Base server configuration (shared fields)
 */
const BaseServerConfigSchema = z.object({
  disabled: z.boolean().optional().default(false).describe('Whether this server is disabled'),
  timeouts: TimeoutConfigSchema.optional().describe('Server-specific timeout overrides'),
  tags: z.array(z.string()).optional().describe('Tags for grouping servers')
});

/**
 * STDIO server configuration (Claude Code compatible - no type field)
 */
export const StdioServerConfigSchema = BaseServerConfigSchema.extend({
  command: z.string().describe('Command to execute'),
  args: z.array(z.string()).optional().default([]).describe('Command arguments'),
  cwd: z.string().optional().describe('Working directory'),
  env: z.record(z.string()).optional().describe('Environment variables for the server')
}).strict();

/**
 * HTTP server configuration (type optional, defaults to streamable-http)
 */
export const HttpServerConfigSchema = BaseServerConfigSchema.extend({
  type: z.literal('http').optional(),
  url: z.string().url().describe('Server URL'),
  headers: z.record(z.string()).optional().describe('HTTP headers for the request')
}).strict();

/**
 * SSE server configuration (type required for SSE)
 */
export const SseServerConfigSchema = BaseServerConfigSchema.extend({
  type: z.literal('sse'),
  url: z.string().url().describe('Server URL'),
  headers: z.record(z.string()).optional().describe('HTTP headers for the request')
}).strict();

/**
 * Union of all server types (Claude Code compatible)
 * Order matters: SSE first (type required), then HTTP, then STDIO
 */
export const ServerConfigSchema = z.union([
  SseServerConfigSchema,
  HttpServerConfigSchema,
  StdioServerConfigSchema
]);

/**
 * Tool naming configuration
 */
export const ToolNamingConfigSchema = z.object({
  strategy: z
    .enum(['prefix', 'suffix', 'none', 'namespace', 'error', 'alias'])
    .default('prefix')
    .describe('Tool naming strategy'),
  separator: z.string().default('__').describe('Separator for tool names'),
  serverIdInName: z.boolean().default(true).describe('Include server ID in tool names'),
  format: z.string().optional().describe('Custom format string for tool names'),
  aliases: z.record(z.string()).optional().describe('Alias mappings for tool names')
});

/**
 * Notification configuration
 */
export const NotificationConfigSchema = z.object({
  enabled: z.boolean().default(false).describe('Enable notification system'),
  rateLimitSec: z
    .number()
    .min(1)
    .max(3600)
    .default(60)
    .describe('Rate limit for same notification in seconds'),
  severity: z
    .array(z.enum(['info', 'warn', 'error']))
    .default(['warn', 'error'])
    .describe('Severity levels to notify')
});

/**
 * HTTP server configuration
 */
export const HttpConfigSchema = z.object({
  port: z.number().min(1).max(65535).default(3000).describe('Port to listen on'),
  host: z.string().default('localhost').describe('Host to bind to')
});

/**
 * Main configuration schema
 */
export const HatagoConfigSchema = z.object({
  version: z.number().default(1).describe('Configuration version'),
  logLevel: z.enum(['debug', 'info', 'warn', 'error']).default('info').describe('Logging level'),
  http: HttpConfigSchema.optional().describe('HTTP server configuration'),
  mcpServers: z.record(ServerConfigSchema).default({}).describe('MCP server configurations'),
  toolNaming: ToolNamingConfigSchema.optional().describe('Tool naming configuration'),
  timeouts: TimeoutConfigSchema.optional().describe('Global timeout defaults'),
  notifications: NotificationConfigSchema.optional().describe('Notification configuration')
});

/**
 * Inferred TypeScript types from schemas
 */
export type TimeoutConfig = z.infer<typeof TimeoutConfigSchema>;
export type StdioServerConfig = z.infer<typeof StdioServerConfigSchema>;
export type HttpServerConfig = z.infer<typeof HttpServerConfigSchema>;
export type SseServerConfig = z.infer<typeof SseServerConfigSchema>;
export type ServerConfig = z.infer<typeof ServerConfigSchema>;
export type ToolNamingConfig = z.infer<typeof ToolNamingConfigSchema>;
export type NotificationConfig = z.infer<typeof NotificationConfigSchema>;
export type HttpConfig = z.infer<typeof HttpConfigSchema>;
export type HatagoConfig = z.infer<typeof HatagoConfigSchema>;

/**
 * Parse and validate configuration
 * @param config Raw configuration object
 * @returns Validated configuration or throws ZodError
 */
export function parseConfig(config: unknown): HatagoConfig {
  return HatagoConfigSchema.parse(config);
}

/**
 * Safe parse configuration without throwing
 * @param config Raw configuration object
 * @returns Parse result with success flag
 */
export function safeParseConfig(config: unknown) {
  return HatagoConfigSchema.safeParse(config);
}

/**
 * Format Zod error messages for human readability
 * @param error ZodError instance
 * @returns Formatted error message
 */
export function formatConfigError(error: z.ZodError): string {
  const messages = error.errors.map((err) => {
    const path = err.path.join('.');
    const message = err.message;
    return path ? `${path}: ${message}` : message;
  });
  return `Configuration validation failed:\n${messages.join('\n')}`;
}

/**
 * Transport types for MCP servers
 */
export type TransportType = 'stdio' | 'http' | 'streamable-http' | 'sse';

/**
 * Determine the transport type for a server configuration
 * @param config Server configuration
 * @returns Transport type
 */
export function getServerTransportType(config: ServerConfig): TransportType {
  // STDIO server (has command field)
  if ('command' in config) {
    return 'stdio';
  }

  // URL-based servers
  if ('url' in config) {
    // SSE server (type: 'sse')
    if ('type' in config && config.type === 'sse') {
      return 'sse';
    }
    // HTTP server (type: 'http' or no type)
    // Default to streamable-http for better streaming support
    return 'streamable-http';
  }

  // Should never reach here due to schema validation
  throw new Error('Invalid server configuration: missing command or url');
}

/**
 * Check if server config is STDIO type
 */
export function isStdioServer(config: ServerConfig): config is StdioServerConfig {
  return 'command' in config;
}

/**
 * Check if server config is HTTP type
 */
export function isHttpServer(config: ServerConfig): config is HttpServerConfig {
  return 'url' in config && (!('type' in config) || config.type === 'http');
}

/**
 * Check if server config is SSE type
 */
export function isSseServer(config: ServerConfig): config is SseServerConfig {
  return 'url' in config && 'type' in config && config.type === 'sse';
}
