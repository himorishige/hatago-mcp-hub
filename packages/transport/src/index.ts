/**
 * @himorishige/hatago-transport - Transport abstractions for Hatago MCP Hub
 *
 * This package provides transport implementations for different
 * communication protocols:
 * - Process/STDIO (Node.js)
 * - HTTP/SSE
 * - WebSocket
 */

// Types
export type {
  HttpTransportOptions,
  ITransport,
  ITransportFactory,
  TransportOptions,
  WebSocketTransportOptions
} from './types.js';

// Node.js specific exports are in './stdio.js'
// Use dynamic import when needed:
// const { StdioClientTransport } = await import('@himorishige/hatago-transport/stdio');

export { SSEClientTransport } from '@modelcontextprotocol/sdk/client/sse.js';
// Export type for StdioClientTransport without importing the implementation
export type { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
export type { SSEStream, StreamableHTTPTransportOptions } from './streamable-http/index.js';
// StreamableHTTP Transport
export { StreamableHTTPTransport } from './streamable-http/index.js';

// Thin facade - new lightweight transport interface
export type {
  ThinHttpTransport,
  ThinHttpRequest,
  ThinHttpResponse,
  StreamChunk,
  ThinJsonRpcTransport,
  ThinTransportOptions
} from './thin-facade.js';

// Relay Transport - lightweight transport implementation
export { RelayTransport, createRelayHttpTransport } from './relay-transport.js';

// JSON-RPC Transport adapter
export { RelayJsonRpcTransport, createRelayJsonRpcTransport } from './relay-jsonrpc-transport.js';
