# Configuration Guide

## Overview

Hatago MCP Hub uses a JSON configuration file to manage MCP server connections. The configuration supports environment variable expansion and hot-reload capabilities.

## Quick Start

### Generate Configuration

```bash
# Interactive mode selection
npx @drmikecrowe/hatago-mcp-hub init

# Or specify mode directly
npx @drmikecrowe/hatago-mcp-hub init --mode stdio  # For Claude Code
npx @drmikecrowe/hatago-mcp-hub init --mode http   # For debugging
```

### Configuration File Location

The configuration file can be specified via:

1. Command line: `hatago serve --config ./hatago.config.json`
2. Environment variable: `HATAGO_CONFIG=./my-config.json`
3. Default location: `./hatago.config.json`

## Configuration Schema

### Basic Structure

```json
{
  "$schema": "https://raw.githubusercontent.com/drmikecrowe/hatago-mcp-hub/main/schemas/config.schema.json",
  "version": 1,
  "logLevel": "info",
  "mcpServers": {
    // Server configurations
  }
}
```

## Configuration Strategies

Hatago supports two primary strategies for managing configurations across different environments and use cases:

### Strategy 1: Tag-based Filtering

Use a single configuration file with tags to group servers, then filter at runtime using the `--tags` option. This approach uses OR logic: a server is included if it has ANY of the specified tags.

**Advantages:**

- Single source of truth for all configurations
- Easy to see all available servers at once
- Quick switching between environments via CLI
- Good for team sharing and simple setups

**Best for:**

- Small to medium projects
- Teams sharing a common configuration
- Quick prototyping and development
- Environments with similar server requirements

### Strategy 2: Configuration Inheritance

Use the `extends` field to create a hierarchy of configuration files, where child configs inherit and override parent settings.

**Advantages:**

- Clean separation of concerns
- Environment-specific customization
- Avoids duplication (DRY principle)
- Better for complex multi-environment setups

**Best for:**

- Large projects with many environments
- Personal customization on top of team defaults
- Complex deployment scenarios
- Strict environment isolation requirements

### Choosing a Strategy

Consider these factors when choosing between strategies:

| Factor                    | Tag-based           | Inheritance-based      |
| ------------------------- | ------------------- | ---------------------- |
| **Configuration Files**   | Single file         | Multiple files         |
| **Environment Switching** | CLI `--tags` option | Different config files |
| **Management Style**      | Centralized         | Distributed            |
| **Complexity Threshold**  | <10 servers         | 10+ servers            |
| **Team Collaboration**    | Easier sharing      | More flexibility       |
| **Override Granularity**  | Server level        | Field level            |
| **Learning Curve**        | Lower               | Higher                 |

### Hybrid Approach

You can combine both strategies for maximum flexibility:

1. Use inheritance for major environment differences (dev/staging/prod)
2. Use tags within each environment for feature flags or optional servers

Example:

```json
// base.config.json
{
  "version": 1,
  "mcpServers": {
    "github": {
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-github"],
      "tags": ["vcs", "essential"]
    },
    "filesystem": {
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-filesystem", "."],
      "tags": ["essential"]
    }
  }
}

// dev.config.json
{
  "extends": "./base.config.json",
  "mcpServers": {
    "debug-tools": {
      "command": "./debug-server",
      "tags": ["debug", "optional"]
    }
  }
}
```

Then use: `hatago serve --config dev.config.json --tags essential,debug`

## Tag-based Filtering

Tags allow you to group servers and filter which ones the Hub loads at startup.

### Adding Tags in Configuration

```json
{
  "mcpServers": {
    "server-a": {
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-filesystem", "."],
      "tags": ["dev", "fs"]
    },
    "server-b": {
      "url": "https://api.example.com/mcp",
      "type": "http",
      "tags": ["prod", "api"]
    }
  }
}
```

### Selecting Tags via CLI

Use the `--tags` option to load only matching servers:

```bash
hatago serve --tags dev,api
```

The above will load servers that contain at least one of the provided tags (`dev` OR `api`). If `--tags` is omitted, all non-disabled servers are loaded.

## Server Descriptions (Routing Hints)

When several servers look alike by id alone (e.g. three Atlassian instances), an agent has no way to decide _where_ to send a query before issuing a call. The optional `description` field on any server is a free-text routing hint. Hatago does not interpret it — it simply relays it into the `hatago://servers` manifest so an agent can reason about routing up front.

```json
{
  "mcpServers": {
    "jira": {
      "url": "https://example.atlassian.net/mcp",
      "type": "sse",
      "description": "Jira only — project tracking. Use for issues, sprints, and boards."
    },
    "confluence-internal": {
      "url": "https://example.atlassian.net/mcp",
      "type": "sse",
      "description": "Internal engineering Confluence — team documentation."
    },
    "confluence-primary": {
      "url": "https://example.atlassian.net/mcp",
      "type": "sse",
      "description": "Primary knowledge base — product strategy and platform docs. Search here first for strategy questions."
    }
  }
}
```

The value surfaces in the built-in `hatago://servers` resource, one entry per server:

```json
{
  "total": 3,
  "servers": [
    {
      "id": "confluence-primary",
      "description": "Primary knowledge base — product strategy and platform docs. Search here first for strategy questions.",
      "status": "connected",
      "type": "remote",
      "url": "https://example.atlassian.net/mcp",
      "command": null,
      "tools": ["confluence-primary_search", "..."],
      "resources": [],
      "prompts": [],
      "error": null
    }
  ]
}
```

Servers without a `description` report `"description": null`. This is the recommended way to give a connecting agent routing guidance without hard-coding it into every prompt.

## Server Instructions

A server `description` is a passive hint that only helps an agent that reads the `hatago://servers` manifest. To **push** guidance into the agent at connect — the closest thing to "add this to the system prompt" — use the optional `instructions` field.

Hatago aggregates the `instructions` of all active servers and returns them as its own MCP `initialize.instructions`. Per the MCP spec this string is a hint that clients MAY add to the model's context; **Claude Code loads server instructions at session start** (like skills — telling the model what each server is for and when to reach for it).

`instructions` accepts either a literal string or a `{ "file": "..." }` reference (path resolved against the config file's directory):

```json
{
  "mcpServers": {
    "confluence-primary": {
      "url": "https://example.atlassian.net/mcp",
      "type": "sse",
      "instructions": "For product-strategy or platform questions, search this server first."
    },
    "jira": {
      "url": "https://example.atlassian.net/mcp",
      "type": "sse",
      "instructions": { "file": "./instructions/jira.md" }
    }
  }
}
```

produces, in hatago's `initialize` result:

```json
{
  "protocolVersion": "…",
  "capabilities": { "tools": {}, "resources": {}, "prompts": {} },
  "serverInfo": { "…": "…" },
  "instructions": "## confluence-primary\nFor product-strategy or platform questions, search this server first.\n\n## jira\n<contents of jira.md>"
}
```

Notes:

- **Config-sourced, connection-independent.** Instructions are read from config at startup and included for every **active** server (not `disabled`, matching any `--tags` filter) — regardless of whether that server's upstream connection later succeeds. There is no per-server file convention or directory scan; one string or one file per server.
- **2KB budget (enforced).** Claude Code truncates a server's instructions at **2KB**, and it sees hatago as a *single* server — so the *entire aggregated* string shares one 2KB budget. Keep each server's text short and put the critical guidance first. **Hatago enforces this: if the aggregate exceeds 2KB, startup fails with an error** (rather than silently losing guidance to client-side truncation).
- **Path containment.** A `{ file }` path must resolve **within the config-file directory** (`..` traversal and out-of-tree absolute paths are rejected — that server's instructions are skipped with a warning, and the file is never read). To source instructions from elsewhere, place a symlink inside the config directory. A single file larger than 2KB is likewise skipped with a warning. This mirrors how a bad `skills` path degrades. (The **aggregate** 2KB limit above is the one hard error — it fails startup.)
- **Client-dependent.** The `initialize.instructions` field is verified to load in Claude Code; other clients MAY ignore it (per the MCP spec). It is a hint, not a guarantee.
- The three guidance mechanisms compose: `description` (manifest routing hint), `instructions` (push at connect), and per-server [skills](#local-skills) (pull on demand).

## Tool Filtering and Overrides

The optional `tools` field on any server lets you control which of that server's tools are exposed and how they are presented. Both filtering and overrides key off the server's **original** tool name (before Hatago prefixing) and are applied at registration, so hidden tools never enter your client's context.

### Filtering (`include` / `exclude`)

Some MCP servers expose many tools, all of which land in your client's context. Filter them down:

```json
{
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
- Omitting `tools` entirely exposes all of the server's tools (the default).

### Overrides (`overrides`)

When you attach two instances of the same server (for example, two Atlassian servers pointing at different Confluence instances), Hatago already prevents name collisions by prefixing every tool with the server id (`serverId_toolName`). But the instances still expose identical descriptions, so an LLM cannot tell them apart. Use `overrides` — keyed by the original tool name — to rename a tool and/or rewrite its description per instance:

```json
{
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

- `name` — renames the exposed tool. The server-id prefix is still applied, so the result is `serverId_<name>`. Omit to keep the original name portion.
- `description` — a **template**. The placeholder `{description}` expands to the tool's upstream description, so you can _augment_ it (`"For the INTERNAL Confluence. {description}"`). A string with no placeholder fully replaces the description. Omit the field — or set an **empty string** — to keep the upstream text unchanged.
- Overrides are metadata only — the tool is still relayed to the underlying server under its original name.
- Filtering runs first; overrides then apply to whatever tools remain.

## Local Skills

A **skill** is a markdown document (instructions, a routing guide, reference content) that Hatago binds to a specific MCP server and exposes to connecting agents as a `skill://<serverId>/<name>` resource. Skills appear in Hatago's aggregated `resources/list`, so an agent discovers them on connect — no server call required.

Skills are **per server**. Each skill is owned by the server it is attached to, which means it:

- is namespaced by server id (`skill://confluence-primary/kb-router`), so two servers can ship a same-named skill without collision;
- shares that server's lifecycle — it is registered when the server connects and removed when the server is disconnected, disabled, or filtered out by `--tags`;
- appears under that server's entry in the `hatago://servers` manifest.

This is the right home for guidance about _how to use a particular server_ — for example, a routing skill that tells an agent to search the primary knowledge base first for strategy questions.

### Enabling Skills

Add a `skills` field to a server entry, pointing at a directory of skills:

```json
{
  "version": 1,
  "mcpServers": {
    "confluence-primary": {
      "url": "https://example.atlassian.net/mcp",
      "type": "sse",
      "description": "Primary knowledge base — product strategy and platform docs.",
      "skills": "./skills/confluence-primary"
    }
  }
}
```

The path resolves against the configuration file's directory and **must stay within it** (`..` traversal and out-of-tree absolute paths are rejected — skills for that server are skipped with a warning, and the server still connects). Symlinks are followed, so you can link an external skills directory in from inside the config tree.

### Skill File Layout

Hatago discovers skills in two layouts inside the server's `skills` directory:

- **Flat file** — `<dir>/<name>.md`
- **Directory per skill** — `<dir>/<name>/SKILL.md` (the Claude Code convention; a subdirectory may hold supporting files, only `SKILL.md` is loaded)

Subdirectories without a `SKILL.md` are ignored. Every skill file needs YAML frontmatter with `name` and `description`; the body below the frontmatter is served verbatim.

```markdown
---
name: kb-router
description: Routes strategy questions to the primary knowledge base. Read first when unsure which Atlassian server to search.
---

# Knowledge Base Router

For anything about product strategy or the platform, search this server first...
```

### How Agents See It

With the skill above attached to the `confluence-primary` server, it is registered as:

- A `resources/list` entry: `{ "uri": "skill://confluence-primary/kb-router", "name": "kb-router", "description": "...", "mimeType": "text/markdown" }`
- An entry in `confluence-primary`'s `resources` array in the `hatago://servers` manifest.
- Its body is returned when the agent reads `skill://confluence-primary/kb-router`.

The `description` is what an agent scans to decide whether to open the skill, so make it specific about _when_ the skill applies. Pair the skill with the owning server's [description](#server-descriptions-routing-hints): the server description says what the server is, and the skill spells out how to use it.

## Configuration Inheritance

The `extends` field allows you to inherit settings from parent configuration files, enabling DRY (Don't Repeat Yourself) principles and cleaner environment-specific configurations.

### Basic Inheritance

```json
// parent.config.json
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
    }
  }
}

// child.config.json
{
  "extends": "./parent.config.json",
  "logLevel": "debug",  // Overrides parent's logLevel
  "mcpServers": {
    "filesystem": {  // Adds new server
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-filesystem", "."]
    }
  }
}
```

### Multiple Parent Inheritance

Configurations are merged in order, with later parents overriding earlier ones:

```json
{
  "extends": ["./base.config.json", "./team.config.json", "./local.config.json"]
}
```

### Path Resolution

The `extends` field supports various path formats:

- **Relative paths**: `"./config.json"`, `"../shared/base.json"`
- **Absolute paths**: `"/etc/hatago/base.config.json"`
- **Home directory**: `"~/hatago/configs/base.json"`

### Deep Merging Rules

1. **Objects are deeply merged**: Child properties override parent properties at each level
2. **Arrays are replaced**: Child arrays completely replace parent arrays
3. **Primitives are overridden**: Strings, numbers, booleans are replaced
4. **Null values delete fields**: Use `null` to remove inherited values

Example of field deletion:

```json
// parent.config.json
{
  "mcpServers": {
    "github": {
      "env": {
        "GITHUB_TOKEN": "${GITHUB_TOKEN}",
        "DEBUG": "true"
      }
    }
  }
}

// child.config.json
{
  "extends": "./parent.config.json",
  "mcpServers": {
    "github": {
      "env": {
        "DEBUG": null  // Removes DEBUG from environment
      }
    }
  }
}
```

### Circular Reference Protection

Hatago automatically detects and prevents circular references in configuration inheritance:

```json
// ❌ This will cause an error:
// a.json: { "extends": "./b.json" }
// b.json: { "extends": "./a.json" }
```

### Inheritance Depth Limit

To prevent excessive nesting, inheritance is limited to 10 levels deep by default.

### Root Fields

| Field        | Type               | Description                                     | Default | Required |
| ------------ | ------------------ | ----------------------------------------------- | ------- | -------- |
| `$schema`    | string             | JSON Schema URL for validation                  | -       | No       |
| `version`    | number             | Configuration schema version                    | 1       | Yes      |
| `extends`    | string \| string[] | Parent configuration file(s) to inherit from    | -       | No       |
| `logLevel`   | string             | Logging level: "debug", "info", "warn", "error" | "info"  | No       |
| `mcpServers` | object             | MCP server configurations                       | {}      | No       |

## Server Configuration

Each server in `mcpServers` can be configured as either a local/NPX server or a remote server.

### Local/NPX Server

```json
{
  "mcpServers": {
    "filesystem": {
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-filesystem", "/tmp"],
      "env": {
        "LOG_LEVEL": "${LOG_LEVEL:-info}"
      },
      "cwd": "./servers",
      "disabled": false
    }
  }
}
```

### Remote Server (HTTP)

```json
{
  "mcpServers": {
    "api-server": {
      "url": "https://api.example.com/mcp",
      "type": "http",
      "headers": {
        "Authorization": "Bearer ${API_TOKEN}"
      },
      "disabled": false
    }
  }
}
```

### Remote Server (SSE)

```json
{
  "mcpServers": {
    "deepwiki": {
      "url": "https://mcp.deepwiki.com/sse",
      "type": "sse",
      "disabled": false
    }
  }
}
```

### Server Configuration Fields

| Field      | Type     | Description                                                                    | Required                 |
| ---------- | -------- | ------------------------------------------------------------------------------ | ------------------------ |
| `command`  | string   | Command to execute (local/NPX)                                                 | Yes (local)              |
| `args`     | string[] | Command arguments                                                              | No                       |
| `env`      | object   | Environment variables                                                          | No                       |
| `cwd`      | string   | Working directory                                                              | No (default: config dir) |
| `url`      | string   | Server URL (remote)                                                            | Yes (remote)             |
| `type`     | string   | Remote server type: "http" or "sse"                                            | No (default: "http")     |
| `headers`  | object   | HTTP headers (remote)                                                          | No                       |
| `disabled` | boolean  | Disable this server                                                            | No (default: false)      |
| `description` | string | Routing hint surfaced per server in the `hatago://servers` manifest          | No                       |
| `tags`     | string[] | Optional tags for server grouping/filtering                                    | No                       |
| `tools`    | object   | Tool filtering (`include`/`exclude`) and per-tool name/description `overrides` | No                       |
| `skills`   | string   | Path (within the config dir) to a skills directory → `skill://<serverId>/<name>` resources | No          |
| `instructions` | string \| `{ file }` | Guidance aggregated into the hub's `initialize.instructions` (hard 2KB total; startup fails if exceeded) | No |

## Security Considerations

The configuration file is a **trusted, operator-authored** input — the person who writes it already controls the host. The per-server fields above are read and relayed accordingly:

- **File paths are contained.** `skills` and `instructions.file` are resolved against the config-file directory and must stay within it; `..` traversal and out-of-tree absolute paths are rejected. Use a symlink inside the config tree to include an external directory deliberately.
- **`instructions` and `skills` content is surfaced to the agent.** Instruction text enters the client's context at connect (via `initialize.instructions`) and skill bodies are served as `skill://` resources. Treat these files as trusted; do not populate them from untrusted sources (the same caution applies to `extends`ed config fragments).
- **Tool overrides are high-privilege.** Renaming/retitling a tool changes only how it is *presented* to the agent — the original upstream tool is still invoked. Don't disguise a destructive tool as a benign one, and don't accept `overrides` from untrusted config.
- **The `hatago://servers` manifest** exposes each server's `command`/`url` (but never `headers`/`env`). If you serve the hub over HTTP to untrusted clients, treat this as reconnaissance surface.

## Environment Variable Expansion

Hatago supports Claude Code compatible environment variable expansion throughout the configuration.

### Syntax

| Syntax            | Description           | Example         |
| ----------------- | --------------------- | --------------- |
| `${VAR}`          | Required variable     | `${API_KEY}`    |
| `${VAR:-default}` | Variable with default | `${PORT:-3000}` |

### Expansion Locations

Environment variables can be used in:

- `command` - Server command
- `args` - Command arguments
- `env` - Environment variables
- `url` - Remote server URLs
- `headers` - HTTP headers

### Examples

```json
{
  "mcpServers": {
    "github": {
      "command": "${MCP_PATH:-npx}",
      "args": ["-y", "@modelcontextprotocol/server-github"],
      "env": {
        "GITHUB_TOKEN": "${GITHUB_TOKEN}"
      }
    },
    "api": {
      "url": "${API_BASE_URL:-https://api.example.com}/mcp",
      "headers": {
        "Authorization": "Bearer ${API_KEY}",
        "X-Environment": "${ENVIRONMENT:-production}"
      }
    }
  }
}
```

### Management Components

Management components are available under `@himorishige/hatago-hub-management/*`. Import from that package when you need lifecycle, idle control, audit logging, or metadata features.

## Configuration Examples

### Minimal Configuration

```json
{
  "version": 1,
  "mcpServers": {
    "filesystem": {
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-filesystem", "."]
    }
  }
}
```

### Development Configuration

```json
{
  "$schema": "https://raw.githubusercontent.com/drmikecrowe/hatago-mcp-hub/main/schemas/config.schema.json",
  "version": 1,
  "logLevel": "debug",
  "mcpServers": {
    "filesystem": {
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-filesystem", "."],
      "env": {
        "DEBUG": "true"
      }
    },
    "github": {
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-github"],
      "env": {
        "GITHUB_TOKEN": "${GITHUB_TOKEN}"
      }
    },
    "deepwiki": {
      "url": "https://mcp.deepwiki.com/sse",
      "type": "sse"
    }
  }
}
```

### Production Configuration

```json
{
  "version": 1,
  "logLevel": "info",
  "mcpServers": {
    "database": {
      "command": "node",
      "args": ["./db-server.js"],
      "env": {
        "DB_HOST": "${DB_HOST}",
        "DB_USER": "${DB_USER}",
        "DB_PASS": "${DB_PASS}"
      },
      "cwd": "/opt/mcp-servers"
    },
    "cache": {
      "url": "${CACHE_URL}",
      "type": "http",
      "headers": {
        "Authorization": "Bearer ${CACHE_TOKEN}"
      }
    },
    "monitoring": {
      "url": "https://monitor.example.com/mcp",
      "type": "sse"
    }
  }
}
```

### Multi-Environment Configuration

```json
{
  "version": 1,
  "logLevel": "${LOG_LEVEL:-info}",
  "mcpServers": {
    "api": {
      "url": "${API_BASE_URL:-https://api.example.com}/mcp",
      "type": "${API_TYPE:-http}",
      "headers": {
        "Authorization": "Bearer ${API_TOKEN}",
        "X-Environment": "${ENVIRONMENT:-production}",
        "X-Region": "${AWS_REGION:-us-east-1}"
      }
    },
    "local-dev": {
      "command": "npm",
      "args": ["run", "mcp:${ENVIRONMENT:-dev}"],
      "disabled": "${DISABLE_LOCAL:-false}"
    }
  }
}
```

## Auto-reload Configuration Changes

Since v0.0.14, the built-in --watch flag has been removed for simplicity.
For auto-reload functionality, use external process managers:

```bash
# Using nodemon
npm install -g nodemon
nodemon --exec "hatago serve --http" --watch hatago.config.json

# Using PM2
npm install -g pm2
pm2 start "hatago serve --http" --name hatago --watch hatago.config.json
```

When using these tools:

- Configuration changes trigger server restart
- Servers are reconnected after restart
- `notifications/tools/list_changed` is sent to clients

## Server Types

### NPX Servers

Common NPX-based MCP servers:

```json
{
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
    },
    "memory": {
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-memory"]
    }
  }
}
```

### Local Executable Servers

```json
{
  "mcpServers": {
    "python-server": {
      "command": "python",
      "args": ["./mcp_server.py"],
      "cwd": "./python-servers"
    },
    "node-server": {
      "command": "node",
      "args": ["./server.js"],
      "env": {
        "NODE_ENV": "production"
      }
    },
    "binary-server": {
      "command": "/usr/local/bin/mcp-tool",
      "args": ["--port", "0"]
    }
  }
}
```

### Remote Servers

```json
{
  "mcpServers": {
    "http-api": {
      "url": "https://api.example.com/mcp",
      "type": "http",
      "headers": {
        "Authorization": "Bearer ${API_TOKEN}"
      }
    },
    "sse-stream": {
      "url": "https://stream.example.com/sse",
      "type": "sse"
    },
    "deepwiki": {
      "url": "https://mcp.deepwiki.com/sse",
      "type": "sse"
    }
  }
}
```

## Platform-Specific Configuration

### Node.js

All server types are supported:

```json
{
  "mcpServers": {
    "local": { "command": "node", "args": ["./server.js"] },
    "npx": { "command": "npx", "args": ["-y", "@example/server"] },
    "remote": { "url": "https://api.example.com/mcp" }
  }
}
```

### Cloudflare Workers

Only remote servers are supported:

```json
{
  "mcpServers": {
    "api": {
      "url": "https://api.example.com/mcp",
      "headers": {
        "Authorization": "Bearer ${CF_API_TOKEN}"
      }
    }
  }
}
```

## Validation

Configuration files are validated against the JSON Schema. To validate your configuration:

1. Use the `$schema` field for IDE support
2. Run `hatago serve` to validate on startup
3. Check logs for validation errors

## Best Practices

### 1. Use Environment Variables for Secrets

Never hardcode sensitive information:

```json
{
  "env": {
    "API_KEY": "${API_KEY}",
    "DB_PASSWORD": "${DB_PASSWORD}"
  }
}
```

### 2. Provide Defaults for Optional Variables

```json
{
  "env": {
    "LOG_LEVEL": "${LOG_LEVEL:-info}",
    "TIMEOUT": "${TIMEOUT_MS:-30000}"
  }
}
```

### 3. Use Descriptive Server IDs

```json
{
  "mcpServers": {
    "github-api": {
      /* ... */
    }, // Good
    "filesystem-tmp": {
      /* ... */
    }, // Good
    "server1": {
      /* ... */
    } // Bad
  }
}
```

### 4. Group Related Servers

```json
{
  "mcpServers": {
    // Development tools
    "dev-filesystem": {
      /* ... */
    },
    "dev-github": {
      /* ... */
    },

    // Production services
    "prod-api": {
      /* ... */
    },
    "prod-cache": {
      /* ... */
    }
  }
}
```

### 5. Use Schema Validation

Always include the schema URL:

```json
{
  "$schema": "https://raw.githubusercontent.com/drmikecrowe/hatago-mcp-hub/main/schemas/config.schema.json",
  "version": 1
}
```

### 6. Leverage Configuration Inheritance

For complex setups, use inheritance to avoid duplication:

```json
// Base config for shared settings
{
  "version": 1,
  "logLevel": "info",
  "mcpServers": {
    "common-tools": { /* ... */ }
  }
}

// Environment-specific overrides
{
  "extends": "./base.config.json",
  "logLevel": "debug",  // Override log level
  "mcpServers": {
    "env-specific": { /* ... */ }
  }
}
```

## Troubleshooting

### Common Issues

1. **Environment Variable Not Found**

   ```
   Error: Environment variable 'API_KEY' is not defined
   ```

   Solution: Export the variable or provide a default value

2. **Server Command Not Found**

   ```
   Error: spawn npx ENOENT
   ```

   Solution: Ensure the command is in PATH or use absolute path

3. **Invalid Configuration**

   ```
   Error: Configuration validation failed
   ```

   Solution: Check against schema, ensure required fields are present

4. **Remote Server Connection Failed**
   ```
   Error: Failed to connect to https://api.example.com/mcp
   ```
   Solution: Verify URL, check network connectivity, validate headers

### Debug Mode

Enable debug logging for detailed information:

```bash
# Via command line
hatago serve --verbose

# Or in configuration
{
  "logLevel": "debug"
}
```

### Checking Configuration

View the parsed configuration:

```bash
# Display loaded configuration (with secrets masked)
hatago config show

# Validate configuration without starting
hatago config validate
```

## Migration from Earlier Versions

If you're using an older configuration format, update as follows:

### Old Format (pre-0.0.1)

```json
{
  "servers": {
    "myserver": {
      "command": "node",
      "args": ["./server.js"]
    }
  }
}
```

### New Format (0.0.1+)

```json
{
  "version": 1,
  "mcpServers": {
    "myserver": {
      "command": "node",
      "args": ["./server.js"]
    }
  }
}
```

Key changes:

- Added `version` field (required)
- Renamed `servers` to `mcpServers`
- Added schema support
- Enhanced environment variable expansion

## Additional Resources

- [JSON Schema](https://raw.githubusercontent.com/drmikecrowe/hatago-mcp-hub/main/schemas/config.schema.json)
- [Example Configurations](https://github.com/drmikecrowe/hatago-mcp-hub/tree/main/schemas)
- [MCP Protocol Documentation](https://modelcontextprotocol.io/)
