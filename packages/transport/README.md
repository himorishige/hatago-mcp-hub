# @hatago/transport

Transport layer implementations for Hatago MCP Hub.

## Features

- **STDIO Transport**: Standard input/output communication
- **HTTP/SSE Transport**: HTTP with Server-Sent Events
- **WebSocket Transport**: Real-time bidirectional communication
- **Connection Management**: Robust connection handling with retry logic

## Installation

```bash
npm install @hatago/transport
```

## Usage

### STDIO Transport

```typescript
import { createStdioTransport } from '@hatago/transport';

const transport = await createStdioTransport({
  command: 'node',
  args: ['./mcp-server.js'],
  env: process.env
});

await transport.connect();
```

### HTTP/SSE Transport

```typescript
import { createHttpTransport } from '@hatago/transport';

const transport = createHttpTransport({
  url: 'http://localhost:3000',
  sessionId: 'my-session'
});

await transport.connect();
```

### WebSocket Transport

```typescript
import { createWebSocketTransport } from '@hatago/transport';

const transport = createWebSocketTransport({
  url: 'ws://localhost:3000',
  reconnect: true,
  reconnectInterval: 5000
});

await transport.connect();
```

## API

### Transport Interface

All transports implement the common `Transport` interface:

```typescript
interface Transport {
  connect(): Promise<void>;
  disconnect(): Promise<void>;
  send(message: any): Promise<void>;
  onMessage(handler: (message: any) => void): void;
  onError(handler: (error: Error) => void): void;
  onClose(handler: () => void): void;
}
```

## License

MIT