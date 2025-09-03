**English** | [日本語](./README.ja.md)

# 🏮 Hatago MCP Hub

[![npm](https://img.shields.io/npm/v/@himorishige/hatago-mcp-hub?logo=npm&color=cb0000)](https://www.npmjs.com/package/@himorishige/hatago-mcp-hub)
[![GitHub Release](https://img.shields.io/github/v/release/himorishige/hatago-mcp-hub?display_name=tag&sort=semver)](https://github.com/himorishige/hatago-mcp-hub/releases)
[![Ask DeepWiki](https://deepwiki.com/badge.svg)](https://deepwiki.com/himorishige/hatago-mcp-hub)

> **Hatago (旅籠)** - Traditional Japanese inn from the Edo period that provided lodging for travelers. A relay point connecting modern AI tools with MCP servers.

## Overview

Hatago MCP Hub is a lightweight hub server that provides unified management for multiple MCP (Model Context Protocol) servers. It enables centralized access to various MCP servers from development tools like Claude Code, Codex CLI, Cursor, Windsurf, and VS Code.

## ✨ Features

### 🎯 Simple & Lightweight

- **Zero Configuration Start (HTTP mode)** - `npx @himorishige/hatago-mcp-hub serve --http`
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
- **Tag-based Server Filtering** - Group and filter servers using tags
- **Configuration Inheritance** - Extend base configurations with `extends` field for DRY principle

## 📦 Installation

### Quick Start (No Installation)

```bash
# Initialize configuration
npx @himorishige/hatago-mcp-hub init

# Start in STDIO mode (for Claude Code)
# NOTE: STDIO requires a config file path
npx @himorishige/hatago-mcp-hub serve --stdio --config ./hatago.config.json

# Or start in HTTP mode without a config (demo/dev)
npx @himorishige/hatago-mcp-hub serve --http
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
args = ["-y", "@himorishige/hatago-mcp-hub", "serve", "--stdio", "--config", "./hatago.config.json"]
```

#### StreamableHTTP Mode

##### Claude Code / Gemini CLI

Add to `.mcp.json`:

```json
{
  "mcpServers": {
    "hatago": {
      "url": "http://localhost:3535/mcp"
    }
  }
}
```

##### Codex CLI

Add to `~/.codex/config.toml`:

```toml
[mcp_servers.hatago]
command = "npx"
args = ["-y", "mcp-remote", "http://localhost:3535/mcp"]
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

### Configuration Strategies

#### Strategy 1: Tag-based Filtering

Group servers with tags in a single configuration file:

```json
{
  "mcpServers": {
    "filesystem-dev": {
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-filesystem", "."],
      "tags": ["dev", "local"]
    },
    "github-prod": {
      "url": "https://api.github.com/mcp",
      "type": "http",
      "tags": ["production", "github"]
    },
    "database": {
      "command": "mcp-server-postgres",
      "tags": ["dev", "production", "database"]
    }
  }
}
```

Start with specific tags:

```bash
# Only start servers tagged as "dev"
hatago serve --tags dev

# Start servers with either "dev" or "test" tags
hatago serve --tags dev,test

# Japanese tags are supported
hatago serve --tags 開発,テスト
```

#### Strategy 2: Configuration Inheritance

Split configurations by environment using the `extends` field:

**Base configuration** (`~/.hatago/base.config.json`):

```json
{
  "version": 1,
  "logLevel": "info",
  "mcpServers": {
    "github": {
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-github"],
      "env": {
        "GITHUB_TOKEN": "${GITHUB_TOKEN}"
      }
    },
    "filesystem": {
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-filesystem", "."]
    }
  }
}
```

**Work configuration** (`./work.config.json`):

```json
{
  "extends": "~/.hatago/base.config.json",
  "logLevel": "debug",
  "mcpServers": {
    "github": {
      "env": {
        "GITHUB_TOKEN": "${WORK_GITHUB_TOKEN}",
        "DEBUG": null
      }
    },
    "internal-tools": {
      "url": "https://internal.company.com/mcp",
      "type": "http",
      "headers": {
        "Authorization": "Bearer ${INTERNAL_TOKEN}"
      }
    }
  }
}
```

Features:

- **Inheritance**: Child configs override parent values
- **Multiple parents**: `"extends": ["./base1.json", "./base2.json"]`
- **Path resolution**: Supports `~`, relative, and absolute paths
- **Environment deletion**: Use `null` to remove inherited env vars

#### Choosing a Strategy

| Strategy       | Tag-based                   | Inheritance-based                            |
| -------------- | --------------------------- | -------------------------------------------- |
| **Files**      | Single config               | Multiple configs                             |
| **Switch**     | `--tags` option             | `--config` option                            |
| **Management** | Centralized                 | Distributed                                  |
| **Best for**   | Team sharing, Simple setups | Complex environments, Personal customization |

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
hatago serve --stdio --config ./hatago.config.json  # STDIO mode (default, requires config)
hatago serve --http                                     # HTTP mode (config optional)
hatago serve --watch           # Watch config changes
hatago serve --config custom.json  # Custom config
hatago serve --verbose         # Debug logging
hatago serve --tags dev,test   # Filter servers by tags
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
- [Team Development Use Cases](./docs/use-cases/team-development.md)

## 🤝 Contributing

Contributions are welcome! Please see our [GitHub repository](https://github.com/himorishige/hatago-mcp-hub) for more information.

## 📄 License

MIT License

## 🔗 Links

- [npm Package](https://www.npmjs.com/package/@himorishige/hatago-mcp-hub)
- [GitHub Repository](https://github.com/himorishige/hatago-mcp-hub)
- [MCP Protocol Specification](https://modelcontextprotocol.io/)

## 🙏 Credits

Built with the [Hono](https://github.com/honojs/hono) and the [Model Context Protocol SDK](https://github.com/modelcontextprotocol/sdk) by Anthropic.
