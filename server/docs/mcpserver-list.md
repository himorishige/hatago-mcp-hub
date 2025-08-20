# 検証用のMCPサーバー一覧

## STDIO

- [@modelcontextprotocol/server-everything](https://github.com/modelcontextprotocol/server-everything)

## SSE

- [DeepWiki SSE](https://mcp.deepwiki.com/sse)

## HTTP

- [DeepWiki HTTP](https://mcp.deepwiki.com/mcp)
- [GitHub MCP](https://api.githubcopilot.com/mcp) needs Personal Access Token

## そのほか

Claude Codeで利用しているMCPサーバー例

```json
{
  "mcpServers": {
    "MCP_DOCKER": {
      "command": "docker",
      "args": ["mcp", "gateway", "run"]
    },
    "cloudflare": {
      "command": "npx",
      "args": [
        "mcp-remote",
        "https://docs.mcp.cloudflare.com/sse",
        "https://bindings.mcp.cloudflare.com/sse",
        "https://builds.mcp.cloudflare.com/sse"
      ]
    },
    "deepwiki": {
      "command": "npx",
      "args": ["mcp-remote", "https://mcp.deepwiki.com/sse"]
    }
  }
}
```
