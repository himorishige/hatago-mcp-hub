# Configuration Guide

## Overview

Hatago MCP Hub uses a JSON configuration file to manage server settings, activation policies, and runtime behavior. The configuration supports environment variable expansion and hot-reload capabilities.

## Configuration File Location

The configuration file can be specified via:

1. Command line: `hatago serve --config hatago.config.json`
2. Default locations (searched in order):
   - `./hatago.config.json`
   - `./hatago.json`
   - `./.hatago.json`

## Configuration Schema

### Root Configuration

```json
{
  "version": 1,
  "logLevel": "info",
  "notifications": {
    "enabled": true,
    "rateLimitSec": 60,
    "severity": ["warn", "error"]
  },
  "mcpServers": {
    // Server configurations
  }
}
```

### Field Descriptions

| Field                        | Type     | Description                                     | Default           |
| ---------------------------- | -------- | ----------------------------------------------- | ----------------- |
| `version`                    | number   | Configuration schema version                    | 1                 |
| `logLevel`                   | string   | Logging level: "debug", "info", "warn", "error" | "info"            |
| `notifications`              | object   | Notification settings                           | -                 |
| `notifications.enabled`      | boolean  | Enable notifications                            | true              |
| `notifications.rateLimitSec` | number   | Rate limit in seconds                           | 60                |
| `notifications.severity`     | string[] | Severity levels to notify                       | ["warn", "error"] |
| `mcpServers`                 | object   | MCP server configurations                       | {}                |

## Server Configuration

Each server in `mcpServers` can be configured with the following properties:

### Basic Configuration

```json
{
  "mcpServers": {
    "server-id": {
      "type": "local",
      "command": "node",
      "args": ["./server.js"],
      "env": {
        "API_KEY": "${API_KEY}"
      },
      "cwd": "/path/to/server"
    }
  }
}
```

### Full Configuration with Management Features

```json
{
  "mcpServers": {
    "server-id": {
      // Basic settings
      "type": "local",
      "command": "node",
      "args": ["./server.js"],
      "env": {},
      "cwd": ".",

      // Management features (v0.3.0+)
      "disabled": false,
      "activationPolicy": "onDemand",
      "idlePolicy": {
        "idleTimeoutMs": 300000,
        "minLingerMs": 30000,
        "activityReset": "onCallEnd"
      },
      "timeouts": {
        "connectMs": 5000,
        "requestMs": 30000,
        "keepAliveMs": 60000
      },

      // Metadata (managed by system)
      "_metadata": {
        "lastConnected": "2024-01-01T00:00:00Z",
        "toolCount": 10,
        "resourceCount": 5
      }
    }
  }
}
```

### Server Configuration Fields

| Field              | Type     | Description                      | Default               |
| ------------------ | -------- | -------------------------------- | --------------------- |
| `type`             | string   | Server type: "local" or "remote" | Required              |
| `command`          | string   | Command to execute (local only)  | Required for local    |
| `args`             | string[] | Command arguments                | []                    |
| `url`              | string   | Server URL (remote only)         | Required for remote   |
| `headers`          | object   | HTTP headers (remote only)       | {}                    |
| `env`              | object   | Environment variables            | {}                    |
| `cwd`              | string   | Working directory                | Config file directory |
| `disabled`         | boolean  | Disable server                   | false                 |
| `activationPolicy` | string   | Activation policy                | "manual"              |
| `idlePolicy`       | object   | Idle management settings         | null                  |
| `timeouts`         | object   | Timeout configurations           | Default timeouts      |

## Activation Policies

### Policy Types

| Policy     | Description                                | Use Case              |
| ---------- | ------------------------------------------ | --------------------- |
| `always`   | Server starts with hub and stays running   | Critical services     |
| `onDemand` | Server starts when needed, stops when idle | Resource optimization |
| `manual`   | Server requires explicit activation        | Development/testing   |

### Policy Behavior

```json
{
  "mcpServers": {
    "critical-service": {
      "type": "local",
      "command": "node",
      "args": ["./critical.js"],
      "activationPolicy": "always"
    },

    "occasional-tool": {
      "type": "local",
      "command": "python",
      "args": ["./tool.py"],
      "activationPolicy": "onDemand",
      "idlePolicy": {
        "idleTimeoutMs": 300000
      }
    },

    "dev-server": {
      "type": "local",
      "command": "npm",
      "args": ["run", "dev"],
      "activationPolicy": "manual"
    }
  }
}
```

## Idle Management

### Idle Policy Configuration

```json
{
  "idlePolicy": {
    "idleTimeoutMs": 300000,
    "minLingerMs": 30000,
    "activityReset": "onCallEnd"
  }
}
```

| Field           | Type   | Description                                            | Default        |
| --------------- | ------ | ------------------------------------------------------ | -------------- |
| `idleTimeoutMs` | number | Time before stopping idle server (ms)                  | 300000 (5 min) |
| `minLingerMs`   | number | Minimum time to keep server running (ms)               | 30000 (30 sec) |
| `activityReset` | string | When to reset idle timer: "onCallStart" or "onCallEnd" | "onCallEnd"    |

### Activity Reset Strategies

- **onCallStart**: Reset timer when tool call begins (keeps server active during long operations)
- **onCallEnd**: Reset timer when tool call completes (allows server to idle during operations)

## Environment Variable Expansion

Hatago supports Claude Code compatible environment variable expansion:

### Syntax

```json
{
  "env": {
    "API_KEY": "${API_KEY}",
    "BASE_URL": "${BASE_URL:-https://api.example.com}",
    "LOG_LEVEL": "${LOG_LEVEL:-info}"
  }
}
```

### Expansion Rules

| Syntax            | Description           | Example         |
| ----------------- | --------------------- | --------------- |
| `${VAR}`          | Required variable     | `${API_KEY}`    |
| `${VAR:-default}` | Variable with default | `${PORT:-3000}` |

### Platform Support

Environment variable expansion works across all platforms:

- **Node.js**: Uses `process.env`
- **Cloudflare Workers**: Uses worker environment bindings
- **Deno/Bun**: Uses respective environment APIs

## Server Types

### Local Server

```json
{
  "filesystem": {
    "type": "local",
    "command": "npx",
    "args": ["-y", "@modelcontextprotocol/server-filesystem", "/tmp"],
    "env": {
      "DEBUG": "${DEBUG:-false}"
    }
  }
}
```

### NPX Server

```json
{
  "npx-tool": {
    "type": "local",
    "command": "npx",
    "args": ["-y", "@example/mcp-server"],
    "activationPolicy": "onDemand"
  }
}
```

### Remote HTTP Server

```json
{
  "api-server": {
    "type": "remote",
    "url": "${API_URL:-https://api.example.com}/mcp",
    "headers": {
      "Authorization": "Bearer ${API_TOKEN}"
    }
  }
}
```

### Remote SSE Server

```json
{
  "sse-server": {
    "type": "remote",
    "url": "https://mcp.example.com/sse",
    "transport": "sse"
  }
}
```

## Timeout Configuration

```json
{
  "timeouts": {
    "connectMs": 5000,
    "requestMs": 30000,
    "keepAliveMs": 60000
  }
}
```

| Timeout       | Description         | Default  |
| ------------- | ------------------- | -------- |
| `connectMs`   | Connection timeout  | 5000 ms  |
| `requestMs`   | Request timeout     | 30000 ms |
| `keepAliveMs` | Keep-alive interval | 60000 ms |

## Configuration Examples

### Development Configuration

```json
{
  "version": 1,
  "logLevel": "debug",
  "mcpServers": {
    "dev-tools": {
      "type": "local",
      "command": "npm",
      "args": ["run", "dev:mcp"],
      "activationPolicy": "manual",
      "env": {
        "NODE_ENV": "development",
        "DEBUG": "*"
      }
    }
  }
}
```

### Production Configuration

```json
{
  "version": 1,
  "logLevel": "info",
  "notifications": {
    "enabled": true,
    "rateLimitSec": 300,
    "severity": ["error"]
  },
  "mcpServers": {
    "database": {
      "type": "local",
      "command": "node",
      "args": ["./db-server.js"],
      "activationPolicy": "always",
      "env": {
        "DB_HOST": "${DB_HOST}",
        "DB_PASS": "${DB_PASS}"
      }
    },
    "cache": {
      "type": "remote",
      "url": "${CACHE_URL}",
      "activationPolicy": "always"
    },
    "analytics": {
      "type": "local",
      "command": "python",
      "args": ["./analytics.py"],
      "activationPolicy": "onDemand",
      "idlePolicy": {
        "idleTimeoutMs": 600000,
        "minLingerMs": 60000
      }
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
      "type": "remote",
      "url": "${API_BASE_URL:-https://api.example.com}/mcp",
      "headers": {
        "Authorization": "Bearer ${API_TOKEN}",
        "X-Environment": "${ENVIRONMENT:-production}"
      },
      "activationPolicy": "${API_ACTIVATION:-onDemand}"
    }
  }
}
```

## Hot Reload

Configuration hot-reload can be enabled via command line:

```bash
hatago serve --config hatago.config.json --watch
```

When enabled:

- Configuration file is monitored for changes
- Changes are applied without restarting the hub
- Active connections are maintained when possible
- Incompatible changes trigger graceful reconnection

## Migration from v0.2.x

### Key Changes

1. **Unified Configuration**: Both `servers` and `mcpServers` are now supported
2. **Activation Policies**: New `activationPolicy` field replaces `autoStart`
3. **Idle Management**: New `idlePolicy` configuration
4. **Environment Expansion**: Now supports `${VAR:-default}` syntax

### Migration Example

**Before (v0.2.x):**

```json
{
  "servers": {
    "myserver": {
      "command": "node",
      "args": ["./server.js"],
      "autoStart": true
    }
  }
}
```

**After (v0.3.x):**

```json
{
  "mcpServers": {
    "myserver": {
      "type": "local",
      "command": "node",
      "args": ["./server.js"],
      "activationPolicy": "always"
    }
  }
}
```

## Best Practices

### 1. Use Environment Variables for Secrets

```json
{
  "env": {
    "API_KEY": "${API_KEY}",
    "DB_PASSWORD": "${DB_PASSWORD}"
  }
}
```

### 2. Configure Appropriate Activation Policies

- Use `always` for critical services
- Use `onDemand` for resource-intensive tools
- Use `manual` for development/debugging

### 3. Set Reasonable Idle Timeouts

```json
{
  "idlePolicy": {
    "idleTimeoutMs": 300000, // 5 minutes for standard tools
    "minLingerMs": 30000 // 30 seconds minimum
  }
}
```

### 4. Use Metadata for Monitoring

The system automatically maintains `_metadata` fields:

- Monitor `lastConnected` for connection health
- Track `toolCount` and `resourceCount` for capability changes
- Review `_lastError` for troubleshooting

### 5. Leverage Hot Reload for Development

```bash
# Development with hot-reload
hatago serve --config dev.config.json --watch --log-level debug

# Production without hot-reload
hatago serve --config prod.config.json
```

## Troubleshooting

### Common Issues

1. **Environment Variable Not Found**
   - Error: `Environment variable 'API_KEY' is not defined`
   - Solution: Ensure variable is exported or use default value

2. **Server Won't Activate**
   - Check `activationPolicy` setting
   - Review `disabled` flag
   - Check `_lastError` in metadata

3. **Server Stops Unexpectedly**
   - Review `idlePolicy` settings
   - Check `minLingerMs` value
   - Monitor activity patterns

4. **Configuration Not Reloading**
   - Ensure `--watch` flag is used
   - Check file permissions
   - Review audit logs for errors

### Debug Mode

Enable debug logging for detailed information:

```json
{
  "logLevel": "debug"
}
```

Or via command line:

```bash
hatago serve --log-level debug
```
