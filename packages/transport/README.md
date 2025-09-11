# @himorishige/hatago-transport

Transport layer implementations for Hatago MCP Hub.

## Features

- **STDIO Client (Node.js)**: Process/stdio transport for local or NPX servers
- **HTTP (StreamableHTTP) Server**: Server-side transport for JSON-RPC over HTTP with streaming
- **SSE Client (re-export)**: Convenience re-export of MCP SDK's SSE client transport

> Note: HTTP client transports are provided by the MCP SDK. This package focuses on server-side StreamableHTTP and stdio client for Node.js.

## Installation

```bash
npm install @himorishige/hatago-transport
```

## Usage

### STDIO Client (Node.js)

```typescript
import { StdioClientTransport } from '@himorishige/hatago-transport/stdio';

const transport = new StdioClientTransport({
  command: 'node',
  args: ['./mcp-server.js'],
  env: process.env
});

await transport.connect();
```

### SSE Client (re-export)

```typescript
import { SSEClientTransport } from '@himorishige/hatago-transport';

const transport = new SSEClientTransport(new URL('http://localhost:3000/sse'));
await transport.connect();
```

### StreamableHTTP Server (for hubs)

```typescript
import { StreamableHTTPTransport } from '@himorishige/hatago-transport';

const http = new StreamableHTTPTransport({ enableJsonResponse: true });
await http.start();

http.onmessage = async (message) => {
  // handle JSON-RPC and respond using http.send(...)
};
```

## Types

This package exposes a minimal transport surface compatible with the MCP SDK.

```ts
export type {
  ITransport,
  HttpTransportOptions,
  WebSocketTransportOptions,
  TransportOptions
} from '@himorishige/hatago-transport';
```

## License

MIT
