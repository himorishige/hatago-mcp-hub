/**
 * Shared initialization logic for both Node.js and Workers environments
 *
 * This module contains common initialization code that can be used
 * across different runtime environments.
 */

import type { HatagoConfig } from './config/types.js';
import type { MCPHub } from './core/mcp-hub.js';
import type { Platform } from './platform/types.js';
import { ConsoleLogger } from './utils/logger.js';

const logger = new ConsoleLogger('index.shared');

/**
 * Common configuration defaults
 */
export const DEFAULT_CONFIG: Partial<HatagoConfig> = {
  timeouts: {
    connectionMs: 30000,
    requestMs: 30000,
    spawnMs: 8000,
  },
  servers: [],
};

/**
 * Initialize MCPHub with platform-specific implementations
 */
export async function initializeMCPHub(
  platform: Platform,
  config?: Partial<HatagoConfig>,
): Promise<MCPHub> {
  const { MCPHub } = await import('./core/mcp-hub.js');

  // Merge config with defaults
  const finalConfig = {
    ...DEFAULT_CONFIG,
    ...config,
  };

  logger.info('Initializing MCPHub', {
    runtime: platform.capabilities.name,
    supportedMCPTypes: platform.capabilities.supportedMCPTypes,
  });

  // Create hub instance with platform
  const hub = new MCPHub({
    platform,
    config: finalConfig,
  });

  return hub;
}

/**
 * Common health check response
 */
export interface HealthCheckResponse {
  status: 'healthy' | 'degraded' | 'unhealthy';
  runtime: string;
  supportedMCPTypes: string[];
  timestamp: string;
  details?: Record<string, any>;
}

/**
 * Generate health check response
 */
export function getHealthCheck(
  platform: Platform,
  additionalDetails?: Record<string, any>,
): HealthCheckResponse {
  return {
    status: 'healthy',
    runtime: platform.capabilities.name,
    supportedMCPTypes: platform.capabilities.supportedMCPTypes,
    timestamp: new Date().toISOString(),
    details: additionalDetails,
  };
}

/**
 * Common error response format
 */
export interface ErrorResponse {
  jsonrpc?: '2.0';
  error: {
    code: number;
    message: string;
    data?: any;
  };
  id?: string | number | null;
}

/**
 * Create standardized error response
 */
export function createErrorResponse(
  error: Error | unknown,
  id?: string | number | null,
  code = -32603,
): ErrorResponse {
  const message = error instanceof Error ? error.message : 'Internal error';

  return {
    jsonrpc: '2.0',
    error: {
      code,
      message,
      data: error instanceof Error ? { stack: error.stack } : undefined,
    },
    id: id || null,
  };
}

/**
 * Validate runtime capabilities
 */
export function validateCapabilities(
  platform: Platform,
  requiredTypes: string[],
): boolean {
  const supported = platform.capabilities.supportedMCPTypes;

  for (const type of requiredTypes) {
    if (!supported.includes(type)) {
      logger.warn(
        `Required MCP type '${type}' not supported in ${platform.capabilities.name}`,
      );
      return false;
    }
  }

  return true;
}

/**
 * Common CORS configuration
 */
export interface CorsConfig {
  origin: string | string[];
  credentials: boolean;
  maxAge?: number;
}

/**
 * Get CORS configuration from environment
 */
export function getCorsConfig(env: Record<string, any>): CorsConfig {
  const origin = env.CORS_ORIGIN || '*';

  return {
    origin: origin.includes(',')
      ? origin.split(',').map((o) => o.trim())
      : origin,
    credentials: true,
    maxAge: 86400, // 24 hours
  };
}

/**
 * Parse log level from environment
 */
export function getLogLevel(
  env: Record<string, any>,
): 'debug' | 'info' | 'warn' | 'error' {
  const level = env.LOG_LEVEL?.toLowerCase();

  switch (level) {
    case 'debug':
    case 'info':
    case 'warn':
    case 'error':
      return level;
    default:
      return 'info';
  }
}

/**
 * Shared SSE event formatter
 */
export function formatSSEEvent(event: string, data: any, id?: string): string {
  let message = '';

  if (id) {
    message += `id: ${id}\n`;
  }

  if (event) {
    message += `event: ${event}\n`;
  }

  const dataString = typeof data === 'string' ? data : JSON.stringify(data);
  message += `data: ${dataString}\n\n`;

  return message;
}

/**
 * SSE keepalive message
 */
export const SSE_KEEPALIVE = ': keepalive\n\n';

export type { HatagoConfig } from './config/types.js';
export type { MCPHub } from './core/mcp-hub.js';
/**
 * Export common types
 */
export type { Platform, RuntimeCapabilities } from './platform/types.js';
