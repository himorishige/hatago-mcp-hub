/**
 * @hatago/transport - Transport abstractions for Hatago MCP Hub
 * 
 * This package provides transport implementations for different
 * communication protocols:
 * - Process/STDIO (Node.js)
 * - HTTP/SSE
 * - WebSocket
 */

// Types
export type {
  ITransport,
  TransportOptions,
  HttpTransportOptions,
  WebSocketTransportOptions,
  ITransportFactory
} from './types.js';

// Node.js specific exports are in './stdio.js'
// Use dynamic import when needed:
// const { StdioClientTransport } = await import('@hatago/transport/stdio');

// Export type for StdioClientTransport without importing the implementation
export type { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
export { SSEClientTransport } from '@modelcontextprotocol/sdk/client/sse.js';

// StreamableHTTP Transport
export { StreamableHTTPTransport } from './streamable-http/index.js';
export type { StreamableHTTPTransportOptions, SSEStream } from './streamable-http/index.js';