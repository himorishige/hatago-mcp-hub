# @himorishige/hatago-mcp-hub

Unified MCP (Model Context Protocol) Hub for managing multiple MCP servers.

## Quick Start

```bash
# Run as MCP server (STDIO mode)
npx @himorishige/hatago-mcp-hub

# Run with custom config
npx @himorishige/hatago-mcp-hub --config ./my-config.json

# Run in HTTP mode for development
npx @himorishige/hatago-mcp-hub --http --port 3000
```

## Installation

```bash
npm install @himorishige/hatago-mcp-hub
```

## Usage with MCP Clients

### Claude Desktop

Add to your Claude Desktop config:

```json
{
  "mcpServers": {
    "hatago": {
      "command": "npx",
      "args": ["-y", "@himorishige/hatago-mcp-hub"]
    }
  }
}
```

### Cline (Codex)

Add to your `~/.codex/config.toml`:

```toml
[mcp_servers.hatago]
command = "npx"
args = ["-y", "@himorishige/hatago-mcp-hub"]
```

## Programmatic Usage

### Node.js

```typescript
import { createHub, startServer } from "@himorishige/hatago-mcp-hub/node";

// Create hub instance
const hub = createHub({
  mcpServers: {
    memory: {
      command: "npx",
      args: ["@modelcontextprotocol/server-memory"],
    },
  },
});

// Start STDIO server
await startServer({ mode: "stdio" });
```

### Cloudflare Workers

```typescript
import { createWorkersApp } from "@himorishige/hatago-mcp-hub/workers";

export default createWorkersApp({
  mcpServers: {
    // Remote servers only in Workers
    example: {
      url: "https://api.example.com/mcp",
    },
  },
});
```

## Configuration

Create a `hatago.config.json`:

```json
{
  "version": 1,
  "mcpServers": {
    "memory": {
      "command": "npx",
      "args": ["@modelcontextprotocol/server-memory"]
    },
    "filesystem": {
      "command": "npx",
      "args": ["@modelcontextprotocol/server-filesystem", "/tmp"]
    }
  }
}
```

## Features

- 🎯 **Unified Interface**: Single endpoint for multiple MCP servers
- 🔧 **Tool Name Management**: Automatic collision avoidance
- 🌐 **Multi-Transport**: STDIO, HTTP, SSE support
- 🚀 **Multi-Runtime**: Node.js, Cloudflare Workers, Browser (planned)
- 📦 **NPX Ready**: Zero configuration startup
- 🔄 **Hot Reload**: Watch config changes (--watch flag)
- 📊 **Progress Notifications**: Real-time operation updates

## License

Apache-2.0
