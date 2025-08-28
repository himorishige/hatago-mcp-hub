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
  ProcessTransportOptions,
  HttpTransportOptions,
  WebSocketTransportOptions,
  ITransportFactory
} from './types.js';

// Implementations
export { ProcessTransport } from './process-transport.js';

// Re-export MCP SDK transports for convenience
export { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
export { SSEClientTransport } from '@modelcontextprotocol/sdk/client/sse.js';

// StreamableHTTP Transport
export { StreamableHTTPTransport } from './streamable-http/index.js';
export type { StreamableHTTPTransportOptions, SSEStream } from './streamable-http/index.js';