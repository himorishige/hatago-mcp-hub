**English** | [日本語](./README.ja.md)

# 🏮 Hatago MCP Hub

[![npm](https://img.shields.io/npm/v/@drmikecrowe/hatago-mcp-hub?logo=npm&color=cb0000)](https://www.npmjs.com/package/@drmikecrowe/hatago-mcp-hub)
[![GitHub Release](https://img.shields.io/github/v/release/drmikecrowe/hatago-mcp-hub?display_name=tag&sort=semver)](https://github.com/drmikecrowe/hatago-mcp-hub/releases)
[![Ask DeepWiki](https://deepwiki.com/badge.svg)](https://deepwiki.com/drmikecrowe/hatago-mcp-hub)

> Hatago (旅籠) — A relay point connecting modern AI tools with MCP servers.

> [!NOTE]
> **This is a fork of [himorishige/hatago-mcp-hub](https://github.com/himorishige/hatago-mcp-hub)**, created by [Hiroshi Morishige (@himorishige)](https://github.com/himorishige). Full credit for Hatago's original design, architecture, and "thin implementation" philosophy belongs to the upstream project — this fork only layers the optional customization features described below on top of it.
>
> This work was built on a branch intended for upstream contribution. **If upstream resumes development and adopts these (or equivalent) features, this fork will converge back to track upstream** as the canonical source rather than maintain a permanent divergence.

## Overview

Hatago MCP Hub is a lightweight hub that unifies access to multiple MCP (Model Context Protocol) servers from tools like Claude Code, Codex CLI, Cursor, Windsurf, and VS Code.

## 🆕 New: Customize Any MCP Server Without Touching It

Hatago now lets you reshape what a connected MCP server exposes and how agents use it — purely at the hub layer, with zero changes to the upstream server:

- **🧠 Per-server Skills (`skill://`)** — Drop a `skills` directory on a server and Hatago publishes each one as a `skill://<serverId>/<name>` resource, discoverable by any connecting agent — a lightweight way to teach agents how to use that server. See [Per-Server Skills](#per-server-skills) below.
- **📝 Server Instructions** — Attach an `instructions` string (or file) to any server; Hatago aggregates them into `initialize.instructions` so agents get that guidance automatically at connect time — and can point them at a skill for the details. See [Server Instructions](#server-instructions) below.
- **🎛️ Tool Filtering & Overrides** — Choose exactly which upstream tools are exposed (`tools.include` / `exclude`) and rename or enrich their descriptions per server (`tools.overrides`), so duplicate or noisy tool sets stay clean in your client's context. See [Per-Server Tool Filtering](#per-server-tool-filtering) below.

All three are optional and off by default — existing configs behave exactly as before.

## Documentation

- Docs index: `docs/README.md`
- Canonical CLI & Hub guide: `packages/mcp-hub/README.md`
- Public docs site (JA default): https://hatago.dev/ja/ — English: https://hatago.dev/en/

[Dev.to: Getting Started with Multi-MCP Using Hatago MCP Hub — One Config to Connect Them All](https://dev.to/himorishige/getting-started-with-multi-mcp-using-hatago-mcp-hub-one-config-to-connect-them-all-2bjp)

## ✨ Features

### 🚀 Performance (v0.0.14)

- **8.44x Faster Startup** - 85.66ms → 10.14ms
- **17% Smaller Package** - 1.04MB → 854KB
- **Simplified Architecture** - Direct server management without abstraction layers

### 🎯 Simple & Lightweight

- **Zero Configuration Start (HTTP mode)** - `npx @drmikecrowe/hatago-mcp-hub serve --http`
- **Non-invasive to Existing Projects** - Doesn't pollute your project directory

### 🔌 Rich Connectivity

- **Multi-Transport Support** - STDIO / HTTP / SSE
- **Remote MCP Proxy** - Transparent connection to HTTP-based MCP servers
- **NPX Server Integration** - Dynamic management of npm package MCP servers

### 🏮 Additional Features

#### Configuration Updates

- **Manual Restart Required** - Configuration changes require server restart
- **Alternative Solutions**:
  - Use process managers (PM2, nodemon) for auto-restart
  - Example: `nodemon --exec "hatago serve --http" --watch hatago.config.json`
  - Or with PM2: `pm2 start "hatago serve" --watch hatago.config.json`
- **Dynamic Tool List Updates** - Supports `notifications/tools/list_changed` notification

#### Progress Notification Forwarding

- **Child Server Notification Forwarding** - Transparent forwarding of `notifications/progress`
- **Long-running Operation Support** - Real-time progress updates
- **Local/Remote Support** - Works with many MCP server types

#### Built-in Internal Resource

- `hatago://servers` - JSON snapshot of currently connected servers (id, `description`, status, type, tools, resources, prompts). The optional per-server `description` field is a routing hint an agent can read _before_ issuing any call. See [Server Descriptions](docs/configuration.md#server-descriptions-routing-hints).

#### Per-server Skills (`skill://`)

- Add a `skills` directory to any server and Hatago exposes each skill as a `skill://<serverId>/<name>` resource in `resources/list`, so any connecting agent discovers it immediately. Skills share the server's lifecycle (removed when it disconnects/disables) and appear under it in the manifest. Supports both flat `<name>.md` files and the `<name>/SKILL.md` directory convention. See [Local Skills](docs/configuration.md#local-skills).

#### Server Instructions

- Give any server an `instructions` string (or `{ "file": "..." }`); Hatago aggregates active servers' instructions into its `initialize.instructions` so a connecting agent receives the guidance at session start (Claude Code loads server instructions on connect). Keep it lean — Claude Code truncates at 2KB total. See [Server Instructions](docs/configuration.md#server-instructions).

#### Enhanced Features

- **Environment Variable Expansion** - Claude Code compatible `${VAR}` and `${VAR:-default}` syntax
- **Configuration Validation** - Type-safe configuration with Zod schemas
- **Tag-based Server Filtering** - Group and filter servers using tags
- **Per-server Tool Filtering & Overrides** - Choose which upstream tools are exposed and rename/retitle them per server (`tools.include` / `exclude` / `overrides`)
- **Configuration Inheritance** - Extend base configurations with `extends` field for DRY principle

### Minimal Hub Interface (IHub)

External packages (server/test-utils) use a thin `IHub` interface to avoid tight coupling with the concrete class.

```ts
import type { IHub } from '@himorishige/hatago-hub';
import { createHub } from '@himorishige/hatago-hub/node';

const hub: IHub = createHub({
  preloadedConfig: { data: { version: 1, mcpServers: {} } }
}) as IHub;
await hub.start();
hub.on('tool:called', (evt) => {
  /* metrics, logs */
});
await hub.stop();
```

Extracted modules for thin hub:

- RPC handlers: `packages/hub/src/rpc/handlers.ts`
- HTTP handler: `packages/hub/src/http/handler.ts`

## 📁 Project Structure

```
packages/
├── mcp-hub/        # Main npm package (@drmikecrowe/hatago-mcp-hub)
├── server/         # Server implementation (@himorishige/hatago-server)
├── hub/            # Hub core (@himorishige/hatago-hub)
├── core/           # Shared types (@himorishige/hatago-core)
├── runtime/        # Runtime components (@himorishige/hatago-runtime)
├── transport/      # Transport layer (@himorishige/hatago-transport)
├── cli/            # CLI tools (@himorishige/hatago-cli)
├── hub-management/ # Management components (@himorishige/hatago-hub-management)
└── test-fixtures/  # Test utilities
```

## 📦 Installation

### Quick Start (No Installation)

```bash
# Initialize configuration
npx @drmikecrowe/hatago-mcp-hub init

# Start in STDIO mode (for Claude Code)
# NOTE: STDIO requires a config file path
npx @drmikecrowe/hatago-mcp-hub serve --stdio --config ./hatago.config.json

# Or start in HTTP mode without a config (demo/dev)
npx @drmikecrowe/hatago-mcp-hub serve --http
```

### Global Installation

```bash
# Install globally
npm install -g @drmikecrowe/hatago-mcp-hub

# Use with hatago command
hatago init
hatago serve
```

### As Project Dependency

```bash
# Install as dependency
npm install @drmikecrowe/hatago-mcp-hub

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
        "@drmikecrowe/hatago-mcp-hub",
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
args = ["-y", "@drmikecrowe/hatago-mcp-hub", "serve", "--stdio", "--config", "./hatago.config.json"]
```

#### HTTP Mode

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

### Metrics (opt-in)

Enable lightweight in-memory metrics and expose an HTTP endpoint:

```bash
HATAGO_METRICS=1 hatago serve --http --port 3535
# Then visit: http://localhost:3535/metrics
```

Notes:

- Metrics are disabled by default and add near-zero overhead when off.
- JSON logs are available when `HATAGO_LOG=json` (respecting `HATAGO_LOG_LEVEL`).

## ⚙️ Configuration

### Basic Configuration

Create `hatago.config.json`:

```json
{
  "$schema": "https://raw.githubusercontent.com/drmikecrowe/hatago-mcp-hub/main/schemas/config.schema.json",
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

### Per-Server Tool Filtering

Some MCP servers expose many tools, all of which land in your client's context. Use the optional `tools` field on any server to expose only the tools you actually use. Filtering is by the server's **original** tool name (before Hatago prefixing) and happens at registration, so hidden tools never enter context and are not invocable.

```json
{
  "$schema": "https://raw.githubusercontent.com/drmikecrowe/hatago-mcp-hub/main/schemas/config.schema.json",
  "mcpServers": {
    "atlassian": {
      "url": "https://mcp.atlassian.com/v1/sse",
      "type": "sse",
      "tools": {
        "include": ["getJiraIssue", "searchJiraIssues", "createJiraIssue"]
      }
    },
    "github": {
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-github"],
      "tools": {
        "exclude": ["delete_repository"]
      }
    }
  }
}
```

- `include` — expose only these tools (allow-list). Omit to start from all tools.
- `exclude` — hide these tools (deny-list).
- If both are set, `exclude` is applied after `include`, so **exclude wins**.
- Omitting `tools` entirely exposes all of the server's tools (unchanged default).

### Per-Server Tool Overrides

When you attach **two instances of the same server** (e.g. two Atlassian servers pointing at different Confluence instances), Hatago already keeps their tools from colliding by prefixing each with the server id (`serverId_toolName`). But the two instances still expose identical descriptions, so an LLM can't tell them apart. Use `tools.overrides` — keyed by the **original** tool name — to rename a tool and/or rewrite its description per instance:

```json
{
  "$schema": "https://raw.githubusercontent.com/drmikecrowe/hatago-mcp-hub/main/schemas/config.schema.json",
  "mcpServers": {
    "confluence-internal": {
      "command": "npx",
      "args": ["-y", "mcp-atlassian"],
      "tools": {
        "overrides": {
          "createConfluencePage": {
            "name": "create_internal_page",
            "description": "For the INTERNAL engineering Confluence. {description}"
          }
        }
      }
    },
    "confluence-customer": {
      "command": "npx",
      "args": ["-y", "mcp-atlassian"],
      "tools": {
        "overrides": {
          "createConfluencePage": {
            "name": "create_customer_page",
            "description": "For the CUSTOMER-facing Confluence instance. {description}"
          }
        }
      }
    }
  }
}
```

- `name` — renames the exposed tool. The server-id prefix is still applied, so the result is `serverId_<name>` (e.g. `confluence_customer_create_customer_page`). Omit to keep the original name.
- `description` — a **template**: the placeholder `{description}` expands to the tool's upstream description, letting you _augment_ it (`"For the INTERNAL Confluence. {description}"`). A string with no placeholder fully replaces the description. Omit to keep the upstream text unchanged.
- Overrides are metadata only — the tool is still relayed to the underlying server under its original name.
- Combine with `include` / `exclude`: filtering runs first, then overrides apply to whatever remains.

### Per-Server Skills

A **skill** is a markdown document that Hatago binds to one MCP server and exposes to connecting agents as a `skill://<serverId>/<name>` resource — discoverable via `resources/list` with no server call required. Use it for guidance on _how to use_ a particular server (a routing guide, a reference doc, worked examples).

Point a server's `skills` field at a directory:

```json
{
  "$schema": "https://raw.githubusercontent.com/drmikecrowe/hatago-mcp-hub/main/schemas/config.schema.json",
  "mcpServers": {
    "confluence-primary": {
      "url": "https://example.atlassian.net/mcp",
      "type": "sse",
      "skills": "./skills/confluence-primary"
    }
  }
}
```

Each skill is either a flat `<dir>/<name>.md` file or a `<dir>/<name>/SKILL.md` directory (the Claude Code convention), with required YAML frontmatter:

```markdown
---
name: kb-router
description: Routes strategy questions to the primary knowledge base. Read first when unsure which Atlassian server to search.
---

# Knowledge Base Router

For anything about product strategy or the platform, search this server first...
```

- Skills are namespaced per server (`skill://confluence-primary/kb-router`), so two servers can reuse the same skill name without collision.
- They share their server's lifecycle — registered on connect, removed on disconnect/disable/`--tags` filter-out.
- The `skills` path must resolve **within** the config directory (symlinks are followed, so an external directory can be linked in).
- See [Local Skills](docs/configuration.md#local-skills) for the full contract.

### Server Instructions

A server `description` only helps an agent that reads the `hatago://servers` manifest. To **push** guidance to the agent at connect time instead, set the optional `instructions` field on any server — Hatago aggregates every active server's instructions into its own `initialize.instructions` (Claude Code loads this at session start, same as a system-prompt addition).

```json
{
  "$schema": "https://raw.githubusercontent.com/drmikecrowe/hatago-mcp-hub/main/schemas/config.schema.json",
  "mcpServers": {
    "confluence-primary": {
      "url": "https://example.atlassian.net/mcp",
      "type": "sse",
      "instructions": "For product-strategy or platform questions, search this server first — see the kb-router skill for detailed routing rules.",
      "skills": "./skills/confluence-primary"
    },
    "jira": {
      "url": "https://example.atlassian.net/mcp",
      "type": "sse",
      "instructions": { "file": "./instructions/jira.md" }
    }
  }
}
```

- Accepts a literal string or a `{ "file": "..." }` reference, resolved against the config file's directory.
- **Use it to redirect, not to duplicate.** Instructions share Claude Code's 2KB *aggregate* budget across every active server, while skills are only loaded when an agent reads them. Keep the instructions text itself to a one-line pointer — `"See the kb-router skill before routing questions here."` — and put the actual detail in the skill.
- **2KB aggregate budget, enforced.** Hatago fails startup with an error if the combined text exceeds that, rather than silently truncating. Keep each server's text short.
- A `{ file }` path must resolve **within** the config directory; out-of-tree paths are skipped with a warning.
- See [Server Instructions](docs/configuration.md#server-instructions) for the full contract.

### Putting It Together: Gating an OAuth-Only Remote Server

`url` + `type: "http" | "sse"` only get you so far — Hatago's remote transport forwards a **static** `headers` map (bearer token, API key) and nothing else. It has no OAuth client: no dynamic client registration, no browser consent screen, no token cache. That's fine for servers that accept a fixed credential, but a server that requires interactive OAuth — Atlassian's hosted MCP endpoint is a common example — can't be reached with a bare `url` entry. For those, run the server as a local **process** via `command`/`args` using an OAuth-capable bridge like [`mcp-remote`](https://www.npmjs.com/package/mcp-remote), which owns the browser handshake and caches tokens on disk; Hatago then talks STDIO to that bridge like any other local server.

This is also where `description`, `instructions`, `skills`, and `tools.overrides` stop being independent features and start composing into one routing story for a single high-value server:

```json
{
  "$schema": "https://raw.githubusercontent.com/drmikecrowe/hatago-mcp-hub/main/schemas/config.schema.json",
  "version": 1,
  "logLevel": "info",
  "mcpServers": {
    "confluence-internal": {
      "command": "npx",
      "args": [
        "-y",
        "mcp-remote",
        "https://mcp.atlassian.com/v1/mcp",
        "--resource",
        "https://your-org.atlassian.net"
      ],
      "tags": ["atlassian", "confluence", "confluence-internal"],
      "description": "Internal engineering Confluence (your-org.atlassian.net) — team documentation, onboarding, architecture, and processes. Read-only. ALWAYS invoke the kb-router skill first — it maps intent to the exact right page without manual searching.",
      "instructions": "When answering a question that internal documentation might cover, read the kb-router resource before calling any confluence-internal tool: ListMcpResourcesTool(server=\"confluence-internal\") → URI skill://confluence-internal/kb-router. Follow its instructions. Use confluence-internal search/fetch tools only when the router explicitly falls back to them.",
      "skills": "./skills",
      "tools": {
        "include": ["fetch", "search", "getConfluencePage", "getConfluenceSpaces", "searchConfluenceUsingCql"],
        "overrides": {
          "search": {
            "name": "searchInternal",
            "description": "REQUIRED: Read the kb-router resource first: ListMcpResourcesTool(server=\"confluence-internal\"). Only use this tool as a fallback if the skill instructs it. {description}"
          },
          "fetch": {
            "name": "fetchInternal",
            "description": "Retrieves from the internal engineering Confluence instance. {description}"
          }
        }
      }
    }
  }
}
```

What each layer buys you, in the order an agent actually hits them:

1. **`command`/`args` (mcp-remote)** — the only way in, because the upstream needs a real OAuth flow Hatago itself can't perform.
2. **`description`** — read passively via `hatago://servers`; tells an agent *that* this server exists and what it's authoritative for, before any tool call.
3. **`instructions`** — pushed into `initialize.instructions` at connect, so the agent is told *up front*, without reading the manifest, to check the router skill before calling tools.
4. **`skills`** — the actual routing logic (which page answers which kind of question) lives in a `skill://confluence-internal/kb-router` resource, pulled on demand instead of bloating the 2KB instructions budget.
5. **`tools.overrides`** — renames the generic `search`/`fetch` tools to `searchInternal`/`fetchInternal` and rewrites their descriptions to repeat the "read the router first" gate at the point the model is about to call them — the last line of defense if it skipped steps 2–4.

None of this is Hatago making decisions on the server's behalf — it's config-only routing metadata layered on a plain passthrough connection, consistent with Hatago's ["thin implementation" philosophy](#-hatago-mcp-hub) (see the note at the top of this README).

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
hatago serve --config custom.json  # Custom config
hatago serve --verbose         # Debug logging
hatago serve --tags dev,test   # Filter servers by tags
hatago serve --env-file ./.env # Load variables from .env before start (repeatable)
hatago serve --env-override    # Override existing env vars when using --env-file
```

#### Loading Environment Variables from Files

Use `--env-file <path...>` to load variables before config parsing. This helps resolve `${VAR}` and `${VAR:-default}` placeholders without exporting variables globally.

- Format: `KEY=VALUE`, `export KEY=VALUE`, `#` comments, blank lines.
- Quotes are stripped; supports escaped `\n`, `\r`, `\t`.
- Paths: relative to CWD, `~/` expanded to home.
- Precedence: files are applied in the given order; existing `process.env` keys are preserved unless `--env-override` is provided.

## ✨ Performance Improvements (v0.0.14)

- **8.44x faster startup**: 85.66ms → 10.14ms
- **17% smaller package**: 1.04MB → 854KB (181KB reduction)
- **Simplified architecture**: Removed EnhancedHub and management layers
- **Trade-off**: Built-in config watching removed (use nodemon/PM2 instead)

## 🔧 Advanced Usage

### Programmatic API

```typescript
import { startServer } from '@drmikecrowe/hatago-mcp-hub';

// Start server programmatically
await startServer({
  mode: 'stdio',
  config: './hatago.config.json',
  logLevel: 'info'
});
```

### Creating Custom Hub

```typescript
import { createHub } from '@drmikecrowe/hatago-mcp-hub';

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
- [Architecture Overview](./docs/ARCHITECTURE.md)
- [API Reference](./docs/api.md)
- [Team Development Use Cases](./docs/use-cases/team-development.md)

## 🤝 Contributing

Contributions are welcome! Please see our [GitHub repository](https://github.com/drmikecrowe/hatago-mcp-hub) for more information.

## 📄 License

MIT License

## 🔗 Links

- [npm Package](https://www.npmjs.com/package/@drmikecrowe/hatago-mcp-hub)
- [GitHub Repository](https://github.com/drmikecrowe/hatago-mcp-hub)
- [MCP Protocol Specification](https://modelcontextprotocol.io/)

## 🙏 Credits

Built with the [Hono](https://github.com/honojs/hono) and the [Model Context Protocol SDK](https://github.com/modelcontextprotocol/sdk) by Anthropic.
