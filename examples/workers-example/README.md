# Hatago Hub Cloudflare Workers Example

Minimal example demonstrating Hatago MCP Hub in a Cloudflare Workers environment.

## Features

- ✅ Remote MCP server support (HTTP/SSE only)
- ✅ KV-based configuration storage
- ✅ Durable Objects for session management
- ✅ SSE streaming support

## Setup

```bash
# Install dependencies
pnpm install

# Configure KV namespace IDs in wrangler.toml
# Update with your actual KV namespace IDs

# Run locally with Wrangler
pnpm dev

# Deploy to Cloudflare Workers
pnpm deploy
```

## Configuration

Store MCP server configuration in KV:

```bash
# Using wrangler CLI
wrangler kv:key put --namespace-id=<your-kv-id> "mcp-servers" '[
  {
    "id": "remote-server",
    "url": "https://example.com/mcp",
    "type": "sse"
  }
]'
```

## API Endpoints

- `GET /health` - Health check
- `ALL /mcp` - MCP protocol endpoint
- `GET /sse` - SSE endpoint for progress notifications

## Platform Limitations

In Cloudflare Workers:
- ❌ No local MCP servers (no process spawning)
- ❌ No file system access
- ✅ Remote HTTP/SSE servers only
- ✅ KV for configuration
- ✅ Durable Objects for sessions

## Development

```bash
# Start local development server
pnpm dev

# The server will be available at http://localhost:8787

# Test MCP endpoint
curl -X POST http://localhost:8787/mcp \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","method":"initialize","params":{"protocolVersion":"2024-11-05","capabilities":{}},"id":1}'
```