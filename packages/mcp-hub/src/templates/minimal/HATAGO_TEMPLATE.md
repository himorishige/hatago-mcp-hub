# Hatago Minimal Template

Minimal Hatago setup - ready to use in 10 seconds.

## 🚀 Quick Start

```bash
# 1. Check configuration file
cat hatago.config.json

# 2. Start Hatago server
hatago serve --stdio

# 3. Test functionality (in another terminal)
echo '{"jsonrpc":"2.0","id":1,"method":"tools/list","params":{}}' | hatago serve --stdio
```

## 📦 Included Servers

- **deepwiki**: Search and query documentation from GitHub repositories (cloud MCP server)

## 🔧 Customization

Edit `hatago.config.json` to add the MCP servers you need:

```json
{
  "mcpServers": {
    "your-server": {
      "command": "your-mcp-server",
      "args": ["--option"]
    }
  }
}
```

## 📚 Next Steps

Try more feature-rich templates:

```bash
hatago init --template local-dev   # Local development setup
hatago init --template ai-assistant # AI-powered features
hatago init --template full-stack  # Full-stack development
```

## 🎯 Perfect For

- **First-time users** - Get started immediately
- **Quick testing** - Minimal overhead
- **Documentation research** - Access GitHub docs instantly
- **Learning MCP** - Simple configuration to understand

## 🛠️ Extending This Template

Add common development servers:

```json
{
  "mcpServers": {
    "filesystem": {
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-filesystem", "."]
    },
    "git": {
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-git"]
    }
  }
}
```

## 📖 Resources

- [Hatago Documentation](https://github.com/himorishige/hatago-mcp-hub)
- [MCP Server Directory](https://github.com/modelcontextprotocol/servers)
- [Advanced Templates](../README.md)
