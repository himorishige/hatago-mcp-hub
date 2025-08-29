# Hatago Hub Node.js Example

Minimal example demonstrating Hatago MCP Hub in a Node.js environment.

## Features

- ✅ Local MCP server support (via process spawning)
- ✅ Remote MCP server support (HTTP/SSE)
- ✅ File-based configuration
- ✅ MCP protocol endpoint
- ✅ SSE endpoint for progress notifications

## Setup

```bash
# Install dependencies
pnpm install

# Run the server
pnpm start

# Development mode with auto-reload
pnpm dev
```

## Configuration

Edit `hatago.config.json` to configure MCP servers:

```json
{
  "mcpServers": {
    "filesystem": {
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-filesystem", "/tmp"],
      "hatagoOptions": {
        "start": "eager"
      }
    }
  }
}
```

Or use environment variable:
```bash
HATAGO_CONFIG=./my-config.json pnpm start
```

## API Endpoints

- `GET /health` - Health check
- `ALL /mcp` - MCP protocol endpoint
- `GET /sse` - SSE endpoint for progress notifications

## Testing

```bash
# Test with the provided script
../test-mcp-simple.sh http://localhost:3000

# Or use curl directly
curl -X POST http://localhost:3000/mcp \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","method":"initialize","params":{"protocolVersion":"2024-11-05","capabilities":{}},"id":1}'
```

## Platform Capabilities

In Node.js, all capabilities are available:
- ✅ Local process spawning
- ✅ File system access
- ✅ Network requests
- ✅ WebSocket connections