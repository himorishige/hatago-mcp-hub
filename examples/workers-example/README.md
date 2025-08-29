# Hatago Hub Cloudflare Workers Example

Minimal example demonstrating Hatago MCP Hub in a Cloudflare Workers environment.

## Features

- ✅ Remote MCP server support (HTTP/SSE only)
- ✅ KV-based configuration storage
- ✅ Durable Objects for session management
- ✅ SSE streaming support
- ✅ Environment variable expansion in configurations

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

### Method 1: Using KV Storage with Environment Variables (Recommended)

Store MCP server configuration in KV with environment variable placeholders:

```bash
# Set environment variables first
wrangler secret put GITHUB_TOKEN
wrangler secret put API_BASE_URL

# Store config with environment variable placeholders
wrangler kv:key put --namespace-id=<your-kv-id> "mcp-servers" '{
  "github-server": {
    "url": "${API_BASE_URL:-https://api.github.com}/mcp",
    "type": "http",
    "headers": {
      "Authorization": "Bearer ${GITHUB_TOKEN}"
    }
  },
  "another-server": {
    "url": "${CUSTOM_SERVER_URL}",
    "type": "sse"
  }
}'
```

The configuration will automatically expand environment variables:

- `${VAR}` - Expands to the value of VAR (throws error if not found)
- `${VAR:-default}` - Expands to VAR if set, otherwise uses default value

### Method 2: Using Environment Variables

You can also configure MCP servers through environment variables in `wrangler.toml`:

```toml
# wrangler.toml
[vars]
MCP_SERVERS = '''
{
  "remote-server": {
    "url": "https://example.com/mcp",
    "type": "sse"
  }
}
'''
```

Or use secrets for sensitive data:

```bash
# Set secrets (for API keys, tokens, etc.)
wrangler secret put MCP_SERVER_TOKEN
```

Then access in your code:

```typescript
// In src/index.ts
app.all("/mcp", async (c) => {
  const hub = createHub(c.env);

  // Load from KV first
  const kvConfig = await c.env.CONFIG_KV.get("mcp-servers", "json");

  // Or load from environment variables
  const envConfig = c.env.MCP_SERVERS ? JSON.parse(c.env.MCP_SERVERS) : null;

  // Or construct config with secrets
  const config = envConfig ||
    kvConfig || {
      "secure-server": {
        url: "https://api.example.com/mcp",
        type: "http",
        headers: {
          Authorization: `Bearer ${c.env.MCP_SERVER_TOKEN}`,
        },
      },
    };

  // Add servers to hub
  if (config && typeof config === "object") {
    for (const [id, serverSpec] of Object.entries(config)) {
      await hub.addServer(id, serverSpec as any);
    }
  }

  return handleMCPEndpoint(hub, c);
});
```

### Configuration Format

Each MCP server configuration should include:

```typescript
interface MCPServerConfig {
  url: string; // Server URL (required)
  type: "http" | "sse"; // Transport type (required)
  headers?: {
    // Optional HTTP headers
    [key: string]: string;
  };
  timeout?: number; // Optional timeout in ms
}
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
