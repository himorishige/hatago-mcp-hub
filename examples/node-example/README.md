# Hatago Hub Node.js Example

Minimal example demonstrating Hatago MCP Hub in a Node.js environment.

Uses `tsx` for fast TypeScript execution without compilation step.

## Features

- ✅ Local MCP server support (via process spawning)
- ✅ Remote MCP server support (HTTP/SSE)
- ✅ File-based configuration
- ✅ MCP protocol endpoint
- ✅ SSE endpoint for progress notifications

## Setup

### Monorepo (this repo)

```bash
# Install dependencies
pnpm install

# Run the server
pnpm start

# Development mode with auto-reload
pnpm dev
```

### Outside monorepo (general users)

```bash
# 1) Create a new project
mkdir hatago-node-example && cd $_ && npm init -y

# 2) Install deps (Node.js >= 20)
npm i @himorishige/hatago-mcp-hub hono @hono/node-server
npm i -D typescript tsx @types/node

# 3) Add scripts to package.json
#   "scripts": { "start": "tsx src/index.ts", "dev": "tsx --watch src/index.ts" }

# 4) Copy this example's src/index.ts and hatago.config.json

# 5) Run
npm run start
```

## Configuration

Edit `hatago.config.json` to configure MCP servers:

```json
{
  "mcpServers": {
    "everything": {
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-everything"],
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
  -d '{"jsonrpc":"2.0","method":"initialize","params":{"protocolVersion":"2025-06-18","capabilities":{}},"id":1}'
```

## Platform Capabilities

In Node.js, all capabilities are available:

- ✅ Local process spawning
- ✅ File system access
- ✅ Network requests
- ✅ WebSocket connections
