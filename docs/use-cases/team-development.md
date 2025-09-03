# Team Development Use Cases

This document describes how to effectively use Hatago MCP Hub's configuration inheritance feature in team development environments.

## Table of Contents

- [Overview](#overview)
- [Basic Team Setup](#basic-team-setup)
- [Advanced Patterns](#advanced-patterns)
- [Best Practices](#best-practices)

## Overview

The configuration inheritance feature (`extends`) enables teams to:

- Share common configurations through version control
- Allow individual customization without conflicts
- Maintain security by keeping secrets local
- Manage environment-specific settings efficiently

## Basic Team Setup

### 1. Repository Structure

```
your-project/
├── .mcp-configs/                # Team configurations (Git managed)
│   ├── base.config.json        # Base configuration for all environments
│   ├── development.config.json # Development environment settings
│   ├── staging.config.json     # Staging environment settings
│   └── production.config.json  # Production environment settings
├── .gitignore                   # Exclude personal configs
└── hatago.config.json          # Personal configuration (Git ignored)
```

### 2. Base Configuration

Create a shared base configuration that includes common servers and settings:

```json
// .mcp-configs/base.config.json
{
  "$schema": "https://raw.githubusercontent.com/himorishige/hatago-mcp-hub/main/schemas/config.schema.json",
  "version": 1,
  "logLevel": "info",
  "mcpServers": {
    "github": {
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-github"],
      "env": {
        "GITHUB_OWNER": "your-org"
      }
    },
    "filesystem": {
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-filesystem"],
      "env": {
        "ALLOWED_PATHS": "${PROJECT_ROOT}"
      }
    },
    "postgres": {
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-postgres"],
      "env": {
        "DATABASE_URL": "${DATABASE_URL}"
      }
    }
  }
}
```

### 3. Environment-Specific Configurations

#### Development Configuration

```json
// .mcp-configs/development.config.json
{
  "extends": "./base.config.json",
  "logLevel": "debug",
  "mcpServers": {
    "postgres": {
      "env": {
        "DATABASE_URL": "${DEV_DATABASE_URL:-postgresql://localhost/dev}"
      },
      "tags": ["dev", "local"]
    },
    "test-utils": {
      "command": "node",
      "args": ["./scripts/test-server.js"],
      "tags": ["dev", "test"],
      "disabled": false
    }
  }
}
```

#### Staging Configuration

```json
// .mcp-configs/staging.config.json
{
  "extends": "./base.config.json",
  "mcpServers": {
    "postgres": {
      "env": {
        "DATABASE_URL": "${STAGING_DATABASE_URL}"
      },
      "tags": ["staging"]
    },
    "monitoring": {
      "command": "npx",
      "args": ["-y", "@company/mcp-monitoring"],
      "tags": ["staging", "monitoring"]
    }
  }
}
```

### 4. Personal Configuration

Each team member creates their own configuration file (Git ignored):

```json
// hatago.config.json (personal, not committed)
{
  "extends": "./.mcp-configs/development.config.json",
  "mcpServers": {
    "github": {
      "env": {
        "GITHUB_TOKEN": "${MY_PERSONAL_TOKEN}"
      }
    },
    "my-local-tools": {
      "command": "node",
      "args": ["/Users/me/tools/my-server.js"],
      "tags": ["personal"]
    },
    "test-utils": {
      "disabled": true // Disable if not needed
    }
  }
}
```

### 5. .gitignore Setup

```gitignore
# Personal MCP configurations
hatago.config.json
hatago.local.config.json
*.personal.config.json
*.local.config.json

# Environment files with secrets
.env
.env.local
```

## Advanced Patterns

### Multi-Level Inheritance

Create a hierarchy of configurations for complex team structures:

```
.mcp-configs/
├── base.config.json           # Company-wide base
├── team-frontend.config.json  # Frontend team base (extends base)
├── team-backend.config.json   # Backend team base (extends base)
└── team-devops.config.json    # DevOps team base (extends base)
```

Example:

```json
// .mcp-configs/team-frontend.config.json
{
  "extends": "./base.config.json",
  "mcpServers": {
    "webpack-analyzer": {
      "command": "npx",
      "args": ["-y", "@mcp/webpack-analyzer"],
      "tags": ["frontend", "build"]
    },
    "react-devtools": {
      "command": "npx",
      "args": ["-y", "@mcp/react-devtools"],
      "tags": ["frontend", "dev"]
    }
  }
}
```

### Using Tags for Role-Based Access

Define servers with tags that correspond to team roles:

```json
{
  "mcpServers": {
    "prod-database": {
      "tags": ["production", "dba-only"],
      "command": "..."
    },
    "staging-api": {
      "tags": ["staging", "qa-team"],
      "command": "..."
    },
    "dev-tools": {
      "tags": ["dev", "all-developers"],
      "command": "..."
    }
  }
}
```

Team members can then start servers based on their role:

```bash
# DBAs only
hatago serve --tags dba-only

# QA Team
hatago serve --tags qa-team

# All developers
hatago serve --tags all-developers

# Multiple tags (OR logic)
hatago serve --tags dev,staging
```

### Environment Variable Management

Use different environment variable strategies:

```json
// .mcp-configs/base.config.json
{
  "mcpServers": {
    "api-client": {
      "env": {
        // Required variable (will fail if not set)
        "API_KEY": "${API_KEY}",

        // With default value
        "API_URL": "${API_URL:-https://api.example.com}",

        // Computed from other variables
        "FULL_URL": "${API_URL}/v1/${API_VERSION:-v1}"
      }
    }
  }
}
```

### Null Value for Removal

Use `null` to remove inherited environment variables:

```json
// Personal config removing sensitive variable
{
  "extends": "./.mcp-configs/development.config.json",
  "mcpServers": {
    "api-client": {
      "env": {
        "DEBUG_MODE": "true",
        "SENSITIVE_VAR": null // Remove this inherited variable
      }
    }
  }
}
```

## Best Practices

### 1. Security

- **Never commit secrets**: Keep API keys, tokens, and passwords in personal configs
- **Use environment variables**: Reference `${ENV_VAR}` instead of hardcoding values
- **Default values for non-sensitive data**: Use `${VAR:-default}` syntax

### 2. Organization

- **Consistent naming**: Use clear, descriptive names for config files
- **Document required variables**: Add comments or README for required env vars
- **Version control base configs**: Track all shared configurations in Git

### 3. Maintenance

- **Regular updates**: Keep base configurations up to date
- **Communicate changes**: Notify team when base configs change
- **Backward compatibility**: Consider impact before modifying base configs

### 4. Testing

Create test configurations for different scenarios:

```json
// .mcp-configs/test.config.json
{
  "extends": "./base.config.json",
  "mcpServers": {
    "mock-server": {
      "command": "node",
      "args": ["./test/mock-server.js"],
      "tags": ["test"]
    },
    "postgres": {
      "disabled": true // Disable real database in tests
    }
  }
}
```

## Example Workflows

### New Team Member Setup

1. Clone the repository
2. Copy the example personal config:
   ```bash
   cp .mcp-configs/example.personal.config.json hatago.config.json
   ```
3. Update personal tokens and paths:
   ```bash
   export MY_GITHUB_TOKEN="your-token-here"
   export PROJECT_ROOT="$(pwd)"
   ```
4. Start development servers:
   ```bash
   hatago serve --tags dev
   ```

### Switching Environments

```bash
# Development
hatago serve --config .mcp-configs/development.config.json --tags dev

# Staging
hatago serve --config .mcp-configs/staging.config.json --tags staging

# Production (with extra caution)
hatago serve --config .mcp-configs/production.config.json --tags production
```

### CI/CD Integration

```yaml
# .github/workflows/mcp-test.yml
name: MCP Tests
on: [push]
jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v2
      - name: Setup Node.js
        uses: actions/setup-node@v2
      - name: Install dependencies
        run: npm ci
      - name: Run MCP servers for tests
        env:
          DATABASE_URL: postgresql://test:test@localhost/test
          GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
        run: |
          npx @himorishige/hatago-mcp-hub serve \
            --config .mcp-configs/test.config.json \
            --tags test
```

## Troubleshooting

### Common Issues

1. **Missing environment variables**
   - Check error message for required variables
   - Ensure variables are exported in your shell
   - Use default values where appropriate

2. **Circular references**
   - Check that config files don't reference each other in a loop
   - Maximum inheritance depth is 10 levels

3. **Path resolution**
   - Use relative paths from the config file location
   - Use `~` for home directory references
   - Use absolute paths when needed

### Debug Mode

Enable verbose logging to troubleshoot configuration issues:

```bash
hatago serve --verbose --config hatago.config.json
```

This will show:

- Parent configuration loading
- Environment variable expansion
- Server connection attempts
- Configuration merge details

## See Also

- [Configuration Guide](../configuration.md)
- [CLI Reference](../cli.md)
- [API Documentation](../api.md)
