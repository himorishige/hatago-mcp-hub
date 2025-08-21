# allowNet Configuration Guide

## Overview

The `allowNet` configuration in Hatago Hub controls which network destinations are allowed for remote MCP servers. This is a security feature to prevent unauthorized network access.

## Important Notes

⚠️ **The `allowNet` field expects hostnames, not full URLs.**

## Configuration Format

```json
{
  "security": {
    "allowNet": ["hostname1", "hostname2", "..."]
  }
}
```

## Examples

### Allow Specific Hosts

```json
{
  "security": {
    "allowNet": [
      "api.github.com",
      "mcp.deepwiki.com",
      "localhost",
      "192.168.1.100"
    ]
  }
}
```

### Allow All Hosts (Not Recommended for Production)

```json
{
  "security": {
    "allowNet": ["*"]
  }
}
```

### Common MCP Server Hosts

Here are common hostnames used by popular MCP servers:

```json
{
  "security": {
    "allowNet": [
      "api.github.com",           // GitHub MCP Server
      "api.openai.com",           // OpenAI API
      "api.anthropic.com",        // Anthropic API
      "mcp.deepwiki.com",         // DeepWiki MCP
      "api.slack.com",            // Slack MCP Server
      "www.googleapis.com",       // Google Drive MCP
      "graph.microsoft.com"       // Microsoft Graph MCP
    ]
  }
}
```

## How It Works

1. When a remote MCP server is configured with a URL like `https://api.github.com/mcp`
2. Hatago extracts the hostname: `api.github.com`
3. It checks if this hostname is in the `allowNet` list
4. If not found and not `*`, the connection is blocked

## Validation Examples

| URL in Config | Required allowNet Entry | Valid? |
|--------------|-------------------------|---------|
| `https://api.github.com/mcp` | `api.github.com` | ✅ |
| `https://api.github.com/mcp` | `github.com` | ❌ |
| `http://localhost:3000/mcp` | `localhost` | ✅ |
| `https://192.168.1.100:8080/mcp` | `192.168.1.100` | ✅ |
| Any URL | `*` | ✅ |

## Security Best Practices

1. **Be Specific**: Only allow the exact hosts you need
2. **Avoid Wildcards**: Never use `*` in production environments
3. **Use HTTPS**: Always prefer HTTPS URLs for remote servers
4. **Regular Review**: Periodically review and remove unused hosts
5. **Environment-Specific**: Use different allowNet lists for dev/staging/production

## Troubleshooting

### Error: "Invalid host"

This means you've configured a URL instead of a hostname:

❌ **Wrong:**
```json
{
  "security": {
    "allowNet": ["https://api.github.com"]
  }
}
```

✅ **Correct:**
```json
{
  "security": {
    "allowNet": ["api.github.com"]
  }
}
```

### Error: "Host not allowed"

The hostname is not in your allowNet list. Check:
1. The exact hostname in the error message
2. Add it to your allowNet configuration
3. Restart the Hatago server

## Integration with Remote Servers

When configuring remote servers, ensure the hostnames are allowed:

```json
{
  "security": {
    "allowNet": [
      "mcp.example.com",
      "api.service.com"
    ]
  },
  "servers": {
    "example": {
      "id": "example",
      "type": "remote",
      "url": "https://mcp.example.com/sse",
      "transport": "sse"
    },
    "api": {
      "id": "api",
      "type": "remote", 
      "url": "https://api.service.com/mcp",
      "transport": "http"
    }
  }
}
```

## Default Behavior

- If `allowNet` is not specified, no remote connections are allowed
- Empty array `[]` means no hosts are allowed
- Array with `["*"]` allows all hosts (use with caution)

## Environment Variables

You can also use environment variables for dynamic configuration:

```json
{
  "security": {
    "allowNet": ["${ALLOWED_HOST_1}", "${ALLOWED_HOST_2}"]
  }
}
```

Then set:
```bash
export ALLOWED_HOST_1=api.github.com
export ALLOWED_HOST_2=mcp.deepwiki.com
```