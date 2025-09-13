/**
 * Thin HTTP Transport Facade
 *
 * Following Hatago philosophy: "Don't transform, relay"
 * This is a minimal interface for HTTP transport operations.
 * All data passes through transparently without transformation.
 */

import type {
  JSONRPCRequest,
  JSONRPCResponse,
  JSONRPCNotification
} from '@modelcontextprotocol/sdk/types.js';

/**
 * Minimal HTTP request representation
 */
export type ThinHttpRequest = {
  method: 'GET' | 'POST' | 'DELETE';
  path: string;
  headers?: Record<string, string>;
  body?: string;
  sessionId?: string;
};

/**
 * Minimal HTTP response representation
 */
export type ThinHttpResponse = {
  status: number;
  headers?: Record<string, string>;
  body?: string;
};

/**
 * Stream chunk for SSE/streaming responses
 */
export type StreamChunk = {
  data: string;
  event?: string;
  id?: string;
};

/**
 * Thin HTTP Transport Interface
 *
 * Core principle: Pure relay without judgment
 * - No retry logic (handled by policy layer)
 * - No error transformation (pass through as-is)
 * - No data processing (transparent relay)
 */
export type ThinHttpTransport = {
  /**
   * Send a request and get a response
   * Pure passthrough - no retries, no transformations
   */
  send(request: ThinHttpRequest): Promise<ThinHttpResponse>;

  /**
   * Stream response chunks
   * Preserves order, no buffering beyond necessary
   */
  stream(request: ThinHttpRequest): AsyncIterable<StreamChunk>;

  /**
   * Close transport and cleanup resources
   */
  close(): Promise<void>;
};

/**
 * JSON-RPC Transport built on thin HTTP
 * Minimal wrapper for MCP protocol compliance
 */
export type ThinJsonRpcTransport = {
  /**
   * Send JSON-RPC request
   */
  request(message: JSONRPCRequest): Promise<JSONRPCResponse>;

  /**
   * Send JSON-RPC notification (no response expected)
   */
  notify(message: JSONRPCNotification): Promise<void>;

  /**
   * Subscribe to incoming notifications
   */
  onNotification(handler: (notification: JSONRPCNotification) => void): void;

  /**
   * Close transport
   */
  close(): Promise<void>;
};

/**
 * Transport options - minimal configuration
 */
export type ThinTransportOptions = {
  /**
   * Base URL for HTTP transport
   */
  baseUrl?: string;

  /**
   * Session ID for multiplexing
   */
  sessionId?: string;

  /**
   * Headers to include in requests
   */
  headers?: Record<string, string>;

  /**
   * Enable debug logging (to stderr only)
   */
  debug?: boolean;
};

/**
 * Create a thin HTTP transport
 * This will be implemented to wrap existing StreamableHTTPTransport initially
 */
export function createThinHttpTransport(_options: ThinTransportOptions): ThinHttpTransport {
  // Phase 1: Delegate to existing implementation
  // This will be replaced with truly thin implementation in later phases
  throw new Error('Not implemented yet - will delegate to StreamableHTTPTransport');
}

/**
 * Create a thin JSON-RPC transport
 */
export function createThinJsonRpcTransport(
  _httpTransport: ThinHttpTransport,
  _options?: ThinTransportOptions
): ThinJsonRpcTransport {
  throw new Error('Not implemented yet - will wrap thin HTTP transport');
}
