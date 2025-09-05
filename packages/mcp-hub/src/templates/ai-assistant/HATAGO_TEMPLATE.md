# Hatago AI Assistant Template

AI-powered development setup with comprehensive MCP servers for enhanced productivity.

## 🚀 30-Second Quick Start

```bash
# 1. Set up environment variables (REQUIRED)
cp .env.hatago.example .env
# Edit .env and add your GITHUB_TOKEN

# 2. Start Hatago server with hot-reload
hatago serve --stdio --watch

# 3. Verify setup
echo '{"jsonrpc":"2.0","id":1,"method":"tools/list","params":{}}' | hatago serve --stdio
```

## 📦 Included MCP Servers

| Server         | Description                         | Tags                 | Required |
| -------------- | ----------------------------------- | -------------------- | -------- |
| **filesystem** | Local file read/write operations    | local, filesystem    | ✅       |
| **git**        | Git operations (diff, commit, push) | local, git           | ✅       |
| **github**     | GitHub API (Issues, PRs, repos)     | cloud, github        | ⚠️ Token |
| **search**     | Fast codebase search                | local, search        | ✅       |
| **browser**    | Web browsing for research           | cloud, browser       | ✅       |
| **memory**     | Context persistence                 | local, memory, ai    | ✅       |
| **deepwiki**   | GitHub docs search & Q&A            | cloud, documentation | ✅       |
| **openai**     | OpenAI integration                  | cloud, ai            | Optional |

## 🔑 Environment Variables

### Required

- `GITHUB_TOKEN`: GitHub Personal Access Token
  - Create at: https://github.com/settings/tokens
  - Required scopes: `repo`, `read:org`, `read:user`

### Optional

- `OPENAI_API_KEY`: For OpenAI integration
- `ANTHROPIC_API_KEY`: For Claude integration
- `PROJECT_PATH`: Override default project path
- `LOG_LEVEL`: Set to `debug` for verbose logging

## 🎯 Use Cases

### AI-Powered Code Review

```bash
# Enable all AI services
hatago serve --tags ai,github,local

# Review recent changes
echo "Review the recent commits and suggest improvements"
```

### Documentation Research

```bash
# Focus on documentation services
hatago serve --tags documentation,search

# Search across GitHub docs
echo "Find best practices for React hooks"
```

### Full Development Workflow

```bash
# All services for comprehensive development
hatago serve --stdio --watch

# Complete development cycle: edit, commit, push, create PR
```

## 🏷️ Tag-Based Filtering

Control which servers start based on your needs:

```bash
# Local development only
hatago serve --tags local

# Cloud services only
hatago serve --tags cloud

# AI features only
hatago serve --tags ai

# GitHub workflow
hatago serve --tags github,git
```

## 🔧 Customization

### Add Custom MCP Servers

Edit `hatago.config.json`:

```json
{
  "mcpServers": {
    "custom-llm": {
      "command": "custom-llm-server",
      "env": {
        "API_KEY": "${CUSTOM_API_KEY}"
      },
      "tags": ["custom", "ai"]
    }
  }
}
```

### Optimize for Your Workflow

```json
{
  "mcpServers": {
    "filesystem": {
      "args": ["-y", "@modelcontextprotocol/server-filesystem", "/specific/project/path"],
      "timeouts": { "requestMs": 30000 }
    }
  }
}
```

## 📝 Claude Code / Cursor Integration

Add to `.mcp.json`:

```json
{
  "mcpServers": {
    "hatago-ai": {
      "command": "npx",
      "args": ["@himorishige/hatago-mcp-hub", "serve", "--stdio", "--watch"],
      "env": {
        "HATAGO_CONFIG": "./hatago.config.json",
        "GITHUB_TOKEN": "${GITHUB_TOKEN}"
      }
    }
  }
}
```

## 🔍 Troubleshooting

### GitHub Authentication Issues

```bash
# Verify token
curl -H "Authorization: token ${GITHUB_TOKEN}" https://api.github.com/user

# Check token scopes
curl -I -H "Authorization: token ${GITHUB_TOKEN}" https://api.github.com | grep x-oauth-scopes
```

### Memory Server Not Persisting

```bash
# Check memory storage location
ls -la ~/.hatago/memory/

# Enable debug logging
LOG_LEVEL=debug hatago serve --verbose
```

### Performance Optimization

```bash
# Disable unused servers
hatago serve --tags local,github  # Skip browser, openai if not needed

# Adjust timeouts for slow networks
# Edit hatago.config.json timeouts section
```

## 📚 Advanced Features

### Multi-Repository Management

```bash
# Set up multiple filesystem servers for different repos
{
  "mcpServers": {
    "frontend": {
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-filesystem", "./frontend"],
      "tags": ["frontend"]
    },
    "backend": {
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-filesystem", "./backend"],
      "tags": ["backend"]
    }
  }
}
```

### AI Chain Operations

Combine multiple AI services for complex workflows:

```bash
# Use memory to track context
# Use GitHub to fetch issues
# Use OpenAI to generate solutions
# Use filesystem to implement changes
# Use git to commit and push
```

## 🚀 Next Steps

- Explore [Full-Stack Template](../full-stack/README.md) for production-ready setup
- Review [Template Documentation](../../README.md) for all available options
- Join [Hatago Community](https://github.com/himorishige/hatago-mcp-hub/discussions)

## 📖 Resources

- [MCP Protocol Specification](https://github.com/modelcontextprotocol/specification)
- [Hatago Documentation](https://github.com/himorishige/hatago-mcp-hub)
- [Example Configurations](../../examples/)
