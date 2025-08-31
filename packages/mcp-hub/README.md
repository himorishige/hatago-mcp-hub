# @himorishige/hatago-mcp-hub

[![npm](https://img.shields.io/npm/v/@himorishige/hatago-mcp-hub?logo=npm&color=cb0000)](https://www.npmjs.com/package/@himorishige/hatago-mcp-hub)
[![GitHub Release](https://img.shields.io/github/v/release/himorishige/hatago-mcp-hub?display_name=tag&sort=semver)](https://github.com/himorishige/hatago-mcp-hub/releases)

Unified MCP (Model Context Protocol) Hub for managing multiple MCP servers. Works with Claude Code, Codex CLI, Cursor, Windsurf, VS Code and other MCP-compatible tools.

## Quick Start

```bash
# Initialize configuration
npx @himorishige/hatago-mcp-hub init

# Start server in STDIO mode (for Claude Code)
npx @himorishige/hatago-mcp-hub serve --stdio

# Start server in HTTP mode (for development/debugging)
npx @himorishige/hatago-mcp-hub serve --http --port 3535
```

## Installation

### As a Command Line Tool (Recommended)

```bash
# Use directly with npx (no installation needed)
npx @himorishige/hatago-mcp-hub init
npx @himorishige/hatago-mcp-hub serve

# Or install globally
npm install -g @himorishige/hatago-mcp-hub
hatago init
hatago serve
```

### As a Project Dependency

```bash
npm install @himorishige/hatago-mcp-hub
```

## Commands

### `hatago init`

Create a default configuration file with interactive mode selection:

```bash
hatago init                    # Interactive mode selection
hatago init --mode stdio       # Create config for STDIO mode
hatago init --mode http        # Create config for StreamableHTTP mode
hatago init --force            # Overwrite existing config
```

### `hatago serve`

Start the MCP Hub server:

```bash
hatago serve --stdio           # STDIO mode (default)
hatago serve --http            # HTTP mode
hatago serve --watch           # Watch config for changes
hatago serve --config custom.json  # Use custom config file
hatago serve --verbose         # Enable debug logging
```

## Usage with MCP Clients

### STDIO Mode

#### Claude Code, Gemini CLI

Add to your `.mcp.json`:

```json
{
  "mcpServers": {
    "hatago": {
      "command": "npx",
      "args": [
        "@himorishige/hatago-mcp-hub",
        "serve",
        "--stdio",
        "--config",
        "./hatago.config.json"
      ]
    }
  }
}
```

#### Codex CLI

Add to your `~/.codex/config.toml`:

```toml
[mcp_servers.hatago]
command = "npx"
args = ["@himorishige/hatago-mcp-hub", "serve", "--stdio", "--config", "./hatago.config.json"]
```

### StreamableHTTP Mode

#### Claude Code, Gemini CLI

Add to your `.mcp.json`:

```json
{
  "mcpServers": {
    "hatago": {
      "url": "http://localhost:3535"
    }
  }
}
```

#### Codex CLI

Add to your `~/.codex/config.toml`:

```toml
[mcp_servers.hatago]
type = "http"
url = "http://localhost:3535"
```

### MCP Inspector

Start in HTTP mode and connect:

```bash
hatago serve --http --port 3535

# Connect MCP Inspector to:
# - Endpoint: http://localhost:3535/mcp
```

## Configuration

### Basic Configuration

Create a `hatago.config.json`:

```json
{
  "$schema": "https://raw.githubusercontent.com/himorishige/hatago-mcp-hub/main/schemas/config.schema.json",
  "version": 1,
  "logLevel": "info",
  "mcpServers": {
    "filesystem": {
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-filesystem", "/tmp"]
    },
    "github": {
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-github"],
      "env": {
        "GITHUB_TOKEN": "${GITHUB_TOKEN}"
      }
    }
  }
}
```

### Remote Server Configuration

```json
{
  "mcpServers": {
    "deepwiki": {
      "url": "https://mcp.deepwiki.com/sse",
      "type": "sse"
    },
    "custom-api": {
      "url": "https://api.example.com/mcp",
      "type": "http",
      "headers": {
        "Authorization": "Bearer ${API_KEY}"
      }
    }
  }
}
```

### Environment Variables

Hatago supports Claude Code-compatible environment variable expansion:

- `${VAR}` - Expands to the value of VAR (error if undefined)
- `${VAR:-default}` - Uses default value if VAR is undefined

Example:

```json
{
  "mcpServers": {
    "api-server": {
      "url": "${API_URL:-https://api.example.com}/mcp",
      "headers": {
        "Authorization": "Bearer ${API_KEY}"
      }
    }
  }
}
```

## Features

### 🎯 Core Features

- **Unified Interface**: Single endpoint for multiple MCP servers
- **Tool Name Management**: Automatic collision avoidance with prefixing
- **Session Management**: Independent sessions for multiple AI clients
- **Multi-Transport**: STDIO, HTTP, SSE, WebSocket support

### 🔄 Dynamic Updates

- **Hot Reload**: Automatic config reload with `--watch` flag
- **Tool List Updates**: Dynamic tool registration with `notifications/tools/list_changed`
- **Progress Notifications**: Real-time operation updates from child servers
- **Graceful Reconnection**: Maintains sessions during config changes

### 🛠️ Management Tools

Built-in internal tools for server management:

- `_internal_hatago_status`: Get status of all connected servers
- `_internal_hatago_reload`: Manually trigger configuration reload
- `_internal_hatago_list_servers`: List all configured servers with details

### 🚀 Developer Experience

- **Zero Configuration**: Works out of the box with sensible defaults
- **Interactive Setup**: Guided configuration with `hatago init`
- **NPX Ready**: No installation required for basic usage
- **Multi-Runtime**: Supports Node.js and Cloudflare Workers (Bun/Deno: WIP)

## Programmatic Usage

### Node.js API

```typescript
import { startServer } from '@himorishige/hatago-mcp-hub';

// Start server programmatically
await startServer({
  mode: 'stdio',
  config: './hatago.config.json',
  logLevel: 'info',
  watchConfig: true
});
```

### Creating Custom Hub

```typescript
import { createHub } from '@himorishige/hatago-mcp-hub';

const hub = createHub({
  mcpServers: {
    memory: {
      command: 'npx',
      args: ['@modelcontextprotocol/server-memory']
    }
  }
});

// Use hub directly in your application
const tools = await hub.listTools();
```

## Architecture

Hatago uses a modular architecture with platform abstraction:

```
Client (Claude Code, etc.)
    ↓
Hatago Hub (Router + Registry)
    ↓
MCP Servers (Local, NPX, Remote)
```

## Supported MCP Servers

### Local Servers (via command)

- Any executable MCP server
- Python, Node.js, or binary servers
- Custom scripts with MCP protocol

### NPX Servers (via npx)

- `@modelcontextprotocol/server-filesystem`
- `@modelcontextprotocol/server-github`
- `@modelcontextprotocol/server-memory`
- Any npm-published MCP server

### Remote Servers (via HTTP/SSE)

- DeepWiki MCP (`https://mcp.deepwiki.com/sse`)
- Any HTTP-based MCP endpoint
- Custom API servers with MCP protocol

## Troubleshooting

### Common Issues

1. **"No onNotification handler set" warning**
   - This is normal in HTTP mode when using StreamableHTTP transport
   - The hub automatically handles notifications appropriately

2. **Server connection failures**
   - Check environment variables are set correctly
   - Verify remote server URLs are accessible
   - Review logs with `--verbose` flag

3. **Tool name collisions**
   - Hatago automatically prefixes tools with server ID
   - Original tool names are preserved in the hub

### Debug Mode

Enable verbose logging for troubleshooting:

```bash
hatago serve --verbose
```

## Version History

- **v0.0.1** - Initial lightweight release with full MCP support

## License

MIT License

## Contributing

Contributions are welcome! Please see our [GitHub repository](https://github.com/himorishige/hatago-mcp-hub) for more information.

## Links

- [npm Package](https://www.npmjs.com/package/@himorishige/hatago-mcp-hub)
- [GitHub Repository](https://github.com/himorishige/hatago-mcp-hub)
- [MCP Protocol Specification](https://modelcontextprotocol.io/)
