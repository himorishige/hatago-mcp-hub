# Configuration Guide

## Overview

Hatago MCP Hub uses a JSON configuration file to manage MCP server connections. The configuration supports environment variable expansion and hot-reload capabilities.

## Quick Start

### Generate Configuration

```bash
# Interactive mode selection
npx @himorishige/hatago-mcp-hub init

# Or specify mode directly
npx @himorishige/hatago-mcp-hub init --mode stdio  # For Claude Code
npx @himorishige/hatago-mcp-hub init --mode http   # For debugging
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
  "$schema": "https://raw.githubusercontent.com/himorishige/hatago-mcp-hub/main/schemas/config.schema.json",
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

| Field      | Type     | Description                                 | Required                 |
| ---------- | -------- | ------------------------------------------- | ------------------------ |
| `command`  | string   | Command to execute (local/NPX)              | Yes (local)              |
| `args`     | string[] | Command arguments                           | No                       |
| `env`      | object   | Environment variables                       | No                       |
| `cwd`      | string   | Working directory                           | No (default: config dir) |
| `url`      | string   | Server URL (remote)                         | Yes (remote)             |
| `type`     | string   | Remote server type: "http" or "sse"         | No (default: "http")     |
| `headers`  | object   | HTTP headers (remote)                       | No                       |
| `disabled` | boolean  | Disable this server                         | No (default: false)      |
| `tags`     | string[] | Optional tags for server grouping/filtering | No                       |

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
  "$schema": "https://raw.githubusercontent.com/himorishige/hatago-mcp-hub/main/schemas/config.schema.json",
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

## Hot Reload

Configuration hot-reload can be enabled via the `--watch` flag:

```bash
hatago serve --watch
```

When enabled:

- Configuration file is monitored for changes
- Changes are detected with a 1-second debounce
- Servers are gracefully reconnected on changes
- Active sessions are preserved when possible
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
  "$schema": "https://raw.githubusercontent.com/himorishige/hatago-mcp-hub/main/schemas/config.schema.json",
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

- [JSON Schema](https://raw.githubusercontent.com/himorishige/hatago-mcp-hub/main/schemas/config.schema.json)
- [Example Configurations](https://github.com/himorishige/hatago-mcp-hub/tree/main/schemas)
- [MCP Protocol Documentation](https://modelcontextprotocol.io/)
