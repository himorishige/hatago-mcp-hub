# Progress Notifications Guide

Hatago Hub supports real-time progress notifications for long-running MCP tool operations using Server-Sent Events (SSE).

## Overview

Progress notifications allow MCP servers to report incremental progress during tool execution, providing better user experience for operations that take time to complete.

## Architecture

```
┌─────────┐       SSE        ┌──────────┐      MCP       ┌────────────┐
│ Client  │◄─────────────────►│ Hatago   │◄─────────────►│ MCP Server │
│ (AI/UI) │   notifications   │   Hub    │   protocol     │            │
└─────────┘                   └──────────┘                └────────────┘
```

## Features

- **Real-time Updates**: Progress notifications via SSE stream
- **Token-based Routing**: Each progress stream identified by unique token
- **Multi-client Support**: Multiple clients can receive different progress streams
- **Automatic Cleanup**: Disconnected clients automatically removed
- **Keep-alive**: Automatic heartbeat to maintain connection

## Implementation

### 1. SSE Endpoint Setup

#### Node.js Example

```typescript
import { createHub, handleMCPEndpoint } from "@hatago/hub/node";
import { Hono } from "hono";
import { streamSSE } from "hono/streaming";

const app = new Hono();
const hub = createHub();

// SSE endpoint for progress notifications
app.get("/sse", async (c) => {
  const clientId = c.req.query("clientId") || `client-${Date.now()}`;
  const sseManager = hub.getSSEManager();

  return streamSSE(c, async (stream) => {
    // Register client
    sseManager.addClient(clientId, stream.writer, stream);

    // Cleanup on disconnect
    stream.onAbort(() => {
      sseManager.removeClient(clientId);
    });

    // Keep connection open
    await new Promise(() => {});
  });
});
```

#### Cloudflare Workers Example

```typescript
import { createHub } from "@hatago/hub/workers";
import { streamSSE } from "hono/streaming";

// Similar setup, but with Workers environment
app.get("/sse", async (c) => {
  const hub = createHub(c.env);
  // ... same SSE logic
});
```

### 2. Calling Tools with Progress

```typescript
// Call a tool with progress token
const result = await hub.callTool({
  name: "long_running_tool",
  arguments: { data: "input" },
  progressToken: "unique-token-123",
});
```

### 3. Client-side Implementation

#### JavaScript/EventSource

```javascript
const eventSource = new EventSource("/sse?clientId=my-client");

eventSource.addEventListener("progress", (event) => {
  const data = JSON.parse(event.data);
  console.log(`Progress: ${data.progress}/${data.total} - ${data.message}`);
});
```

#### HTML Example

See `examples/test-progress-client.html` for a complete web-based client implementation.

### 4. Testing

#### Browser Test

1. Open `examples/test-progress-client.html` in a browser
2. Click "Connect SSE" to establish connection
3. Click "Test Progress" to see demo notifications

#### CLI Test

```bash
# Run the test script
./examples/test-progress.sh http://localhost:3000

# Or use curl directly
curl -N -H "Accept: text/event-stream" \
     "http://localhost:3000/sse?clientId=test"
```

## Protocol Details

### Progress Notification Format

```json
{
  "jsonrpc": "2.0",
  "method": "notifications/progress",
  "params": {
    "progressToken": "unique-token",
    "progress": 5,
    "total": 10,
    "message": "Processing item 5 of 10"
  }
}
```

### SSE Event Format

```
event: progress
data: {"progressToken":"token","progress":5,"total":10,"message":"Processing..."}

```

## API Reference

### SSEManager Methods

```typescript
class SSEManager {
  // Add a new SSE client
  addClient(
    clientId: string,
    writer: WritableStreamDefaultWriter,
    stream?: any,
  ): void;

  // Remove a client
  removeClient(clientId: string): void;

  // Register progress token for routing
  registerProgressToken(progressToken: string, clientId: string): void;

  // Send progress notification
  sendProgressNotification(notification: ProgressNotification): Promise<void>;
}
```

### Hub Integration

```typescript
// Get SSE manager from hub
const sseManager = hub.getSSEManager();

// Get StreamableHTTP transport (for advanced use)
const transport = hub.getStreamableTransport();
```

## Best Practices

1. **Unique Tokens**: Always use unique progress tokens per operation
2. **Cleanup**: Unregister tokens when operation completes
3. **Error Handling**: Handle SSE connection errors gracefully
4. **Heartbeat**: Use keep-alive to detect disconnections
5. **Buffering**: Consider buffering rapid progress updates

## Platform Support

| Platform           | SSE Support | Progress Notifications |
| ------------------ | ----------- | ---------------------- |
| Node.js            | ✅ Full     | ✅ Full                |
| Cloudflare Workers | ✅ Full     | ✅ Full                |
| Deno               | ✅ Full     | ✅ Full                |
| Bun                | ✅ Full     | ✅ Full                |

## Troubleshooting

### Connection Drops

- Check firewall/proxy settings
- Ensure keep-alive is enabled
- Verify client reconnection logic

### Missing Notifications

- Verify progress token registration
- Check SSE connection status
- Ensure client is listening for correct event type

### Performance Issues

- Limit notification frequency
- Use buffering for rapid updates
- Consider WebSocket for high-frequency updates

## Examples

- `examples/node-example/` - Node.js with SSE endpoint
- `examples/workers-example/` - Cloudflare Workers with SSE
- `examples/test-progress-client.html` - Browser test client
- `examples/test-progress.sh` - CLI test script

## Migration from Old Implementation

If migrating from `hono-mcp-hub`:

1. Replace `/events` endpoint with `/sse`
2. Use `hub.getSSEManager()` instead of direct SSE handling
3. Update client to use `progressToken` in tool calls
4. Use `handleMCPEndpoint` for MCP protocol handling
