# Hatago Cloud-Only Template

Minimal cloud-based setup with zero local dependencies. Perfect for serverless environments and cloud-native workflows.

## 🚀 Instant Start

```bash
# No setup required - just run!
hatago serve --stdio

# Verify cloud services
echo '{"jsonrpc":"2.0","id":1,"method":"tools/list","params":{}}' | hatago serve --stdio
```

## ☁️ Included Cloud Services

| Service        | Description         | Authentication   | Tags                 |
| -------------- | ------------------- | ---------------- | -------------------- |
| **deepwiki**   | GitHub docs search  | None             | cloud, documentation |
| **weather**    | Weather information | None             | cloud, weather       |
| **github-api** | GitHub REST API     | Token (optional) | cloud, github        |

## 🎯 Use Cases

### Documentation Search

```bash
# Search any GitHub repository documentation
echo "Search React documentation for hooks best practices"
```

### API Integration

```bash
# Weather data
echo "What's the weather in Tokyo?"

# GitHub data (if token provided)
echo "List my recent GitHub notifications"
```

## 🔧 Zero Configuration

This template works immediately without any setup:

- ✅ No local installations required
- ✅ No environment variables needed (optional GitHub token)
- ✅ No file system permissions
- ✅ Works in restricted environments
- ✅ Serverless compatible

## 🔐 Optional GitHub Integration

To enable GitHub API features:

```bash
# Set GitHub token
export GITHUB_TOKEN=ghp_xxxxxxxxxxxxxxxxxxxxx

# Or add to .env file
echo "GITHUB_TOKEN=ghp_xxxxxxxxxxxxxxxxxxxxx" > .env
```

## 📦 Adding More Cloud Services

Edit `hatago.config.json` to add any HTTP/SSE MCP server:

```json
{
  "mcpServers": {
    "openai-proxy": {
      "url": "https://your-openai-proxy.com/mcp",
      "type": "http",
      "headers": {
        "Authorization": "Bearer ${OPENAI_API_KEY}"
      },
      "description": "OpenAI API proxy",
      "tags": ["cloud", "ai", "openai"]
    },
    "custom-api": {
      "url": "https://api.example.com/mcp",
      "type": "sse",
      "description": "Custom API service",
      "tags": ["cloud", "custom"]
    }
  }
}
```

## 🚢 Deployment Options

### Docker Container

```dockerfile
FROM node:20-slim
RUN npm install -g @himorishige/hatago-mcp-hub
COPY hatago.config.json /app/
WORKDIR /app
CMD ["hatago", "serve", "--stdio"]
```

### Serverless Function

```javascript
// AWS Lambda handler example
const { startServer } = require('@himorishige/hatago-mcp-hub');

exports.handler = async (event) => {
  const result = await startServer({
    mode: 'http',
    config: './hatago.config.json'
  });
  return result;
};
```

### Cloud Run / Fly.io

```yaml
# fly.toml
app = "hatago-cloud"

[env]
PORT = "8080"

[experimental]
allowed_public_ports = []
auto_rollback = true

[[services]]
http_checks = []
internal_port = 8080
protocol = "tcp"
```

## 🏷️ Service Discovery

Use tags to organize cloud services:

```bash
# Documentation services only
hatago serve --tags documentation

# API services only
hatago serve --tags api

# All cloud services
hatago serve --tags cloud
```

## 🔍 Troubleshooting

### Connection Issues

```bash
# Check service availability
curl -I https://mcp.deepwiki.com/sse

# Test with verbose logging
hatago serve --verbose
```

### Authentication Errors

```bash
# Verify GitHub token (if using)
curl -H "Authorization: Bearer ${GITHUB_TOKEN}" https://api.github.com/user
```

## 📊 Performance

Cloud-only advantages:

- **Latency**: ~50-200ms for cloud services
- **Memory**: Minimal local footprint (<50MB)
- **CPU**: Low usage (proxy only)
- **Storage**: Zero local storage required
- **Scalability**: Unlimited with cloud backends

## 🔄 Migration Path

When ready for more features:

```bash
# Add local development capabilities
hatago init --template local-dev

# Full AI-powered setup
hatago init --template ai-assistant

# Production-ready stack
hatago init --template full-stack
```

## 📚 Resources

- [Cloud MCP Services Directory](https://github.com/modelcontextprotocol/servers)
- [Hatago Documentation](https://github.com/himorishige/hatago-mcp-hub)
- [Deployment Guides](https://github.com/himorishige/hatago-mcp-hub/docs/deployment)
