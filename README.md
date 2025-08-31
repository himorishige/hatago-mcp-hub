**English** | [日本語](./README.ja.md)

# 🏮 Hatago MCP Hub

[![npm](https://img.shields.io/npm/v/@himorishige/hatago-mcp-hub?logo=npm&color=cb0000)](https://www.npmjs.com/package/@himorishige/hatago-mcp-hub)
[![GitHub Release](https://img.shields.io/github/v/release/himorishige/hatago-mcp-hub?display_name=tag&sort=semver)](https://github.com/himorishige/hatago-mcp-hub/releases)

> **Hatago (旅籠)** - Traditional Japanese inn from the Edo period that provided lodging for travelers. A relay point connecting modern AI tools with MCP servers.

## Overview

Hatago MCP Hub is a lightweight hub server that provides unified management for multiple MCP (Model Context Protocol) servers. It enables centralized access to various MCP servers from development tools like Claude Code, Codex CLI, Cursor, Windsurf, and VS Code.

## ✨ Features

### 🎯 Simple & Lightweight

- **Zero Configuration Start** - `npx @himorishige/hatago-mcp-hub`
- **Non-invasive to Existing Projects** - Doesn't pollute your project directory

### 🔌 Rich Connectivity

- **Multi-Transport Support** - STDIO / HTTP / SSE / WebSocket
- **Remote MCP Proxy** - Transparent connection to HTTP-based MCP servers
- **NPX Server Integration** - Dynamic management of npm package MCP servers

### 🏮 Additional Features

#### Hot Reload & Dynamic Updates

- **Config File Watching** - Auto-reload on configuration changes (no restart required)
- **Dynamic Tool List Updates** - Supports `notifications/tools/list_changed` notification

#### Progress Notification Forwarding

- **Child Server Notification Forwarding** - Transparent forwarding of `notifications/progress`
- **Long-running Operation Support** - Real-time progress updates
- **Local/Remote Support** - Works with many MCP server types

#### Internal Management Tools

- **`_internal_hatago_status`** - Check connection status and tool count for all servers
- **`_internal_hatago_reload`** - Manually trigger configuration reload
- **`_internal_hatago_list_servers`** - List details of configured servers

#### Enhanced Features

- **Environment Variable Expansion** - Claude Code compatible `${VAR}` and `${VAR:-default}` syntax
- **Configuration Validation** - Type-safe configuration with Zod schemas

## 📦 Installation

### Quick Start (No Installation)

```bash
# Initialize configuration
npx @himorishige/hatago-mcp-hub init

# Start in STDIO mode (for Claude Code)
npx @himorishige/hatago-mcp-hub serve
```

### Global Installation

```bash
# Install globally
npm install -g @himorishige/hatago-mcp-hub

# Use with hatago command
hatago init
hatago serve
```

### As Project Dependency

```bash
# Install as dependency
npm install @himorishige/hatago-mcp-hub

# Add to package.json scripts
{
  "scripts": {
    "mcp": "hatago serve"
  }
}
```

## 🚀 Usage

### Claude Code, Codex CLI, Gemini CLI

#### STDIO Mode (Recommended)

##### Claude Code / Gemini CLI

Add to `.mcp.json`:

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

##### Codex CLI

Add to `~/.codex/config.toml`:

```toml
[mcp_servers.hatago]
command = "npx"
args = ["@himorishige/hatago-mcp-hub", "serve", "--stdio", "--config", "./hatago.config.json"]
```

#### StreamableHTTP Mode

##### Claude Code / Gemini CLI

Add to `.mcp.json`:

```json
{
  "mcpServers": {
    "hatago": {
      "url": "http://localhost:3535"
    }
  }
}
```

##### Codex CLI

Add to `~/.codex/config.toml`:

```toml
[mcp_servers.hatago]
type = "http"
url = "http://localhost:3535"
```

### MCP Inspector

For testing and debugging:

```bash
# Start in HTTP mode
hatago serve --http --port 3535

# Connect with MCP Inspector
# Endpoint: http://localhost:3535/mcp
```

Visit [MCP Inspector](https://inspector.mcphub.com/)

## ⚙️ Configuration

### Basic Configuration

Create `hatago.config.json`:

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

### Environment Variable Expansion

Supports Claude Code compatible syntax:

- `${VAR}` - Expands to the value of VAR (error if undefined)
- `${VAR:-default}` - Uses default value if VAR is undefined

## 📋 Commands

### `hatago init`

Create configuration file with interactive setup:

```bash
hatago init                    # Interactive mode
hatago init --mode stdio       # STDIO mode config
hatago init --mode http        # HTTP mode config
hatago init --force            # Overwrite existing
```

### `hatago serve`

Start MCP Hub server:

```bash
hatago serve                   # STDIO mode (default)
hatago serve --http            # HTTP mode
hatago serve --watch           # Watch config changes
hatago serve --config custom.json  # Custom config
hatago serve --verbose         # Debug logging
```

## 🔧 Advanced Usage

### Programmatic API

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

## 🏗️ Architecture

```
Client (Claude Code, etc.)
    ↓
Hatago Hub (Router + Registry)
    ↓
MCP Servers (Local, NPX, Remote)
```

### Supported MCP Servers

#### Local Servers

- Any executable MCP server
- Python, Node.js, or binary servers
- Custom scripts with MCP protocol

#### NPX Servers

- `@modelcontextprotocol/server-filesystem`
- `@modelcontextprotocol/server-github`
- `@modelcontextprotocol/server-memory`
- Any npm-published MCP server

#### Remote Servers

- DeepWiki MCP (`https://mcp.deepwiki.com/sse`)
- Any HTTP-based MCP endpoint
- Custom API servers with MCP protocol

## 🐛 Troubleshooting

### Common Issues

1. **"No onNotification handler set" warning**
   - Normal in HTTP mode with StreamableHTTP transport
   - Hub handles notifications appropriately

2. **Server connection failures**
   - Verify environment variables are set
   - Check remote server URLs are accessible
   - Use `--verbose` flag for detailed logs

3. **Tool name collisions**
   - Hatago automatically prefixes with server ID
   - Original names preserved in hub

### Debug Mode

```bash
# Enable verbose logging
hatago serve --verbose

# Check server status
hatago status
```

## 📚 Documentation

- [Configuration Guide](./docs/configuration.md)
- [Architecture Overview](./docs/architecture.md)
- [API Reference](./docs/api.md)

## 🤝 Contributing

Contributions are welcome! Please see our [GitHub repository](https://github.com/himorishige/hatago-mcp-hub) for more information.

## 📄 License

MIT License

## 🔗 Links

- [npm Package](https://www.npmjs.com/package/@himorishige/hatago-mcp-hub)
- [GitHub Repository](https://github.com/himorishige/hatago-mcp-hub)
- [MCP Protocol Specification](https://modelcontextprotocol.io/)

## 🙏 Credits

Built with the [Model Context Protocol SDK](https://github.com/modelcontextprotocol/sdk) by Anthropic.
