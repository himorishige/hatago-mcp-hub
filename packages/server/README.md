# @hatago/server

NPX-ready MCP Hub server for Claude Code and other AI assistants.

## Quick Start

```bash
# Run with npx (STDIO mode by default)
npx @hatago/server

# Run in HTTP mode for development
npx @hatago/server --http

# With custom configuration
npx @hatago/server --config ./hatago.config.json
```

## Claude Code Integration

Add to your `.mcp.json`:

```json
{
  "mcpServers": {
    "hatago": {
      "command": "npx",
      "args": ["@hatago/server", "--stdio"]
    }
  }
}
```

## Modes

### STDIO Mode (Default)
- Designed for Claude Code and MCP-compatible clients
- Uses LSP-style framing over STDIO
- Protocol on stdout, logs on stderr

### HTTP Mode
- For development and debugging
- Provides `/mcp`, `/sse`, and `/health` endpoints
- Enable with `--http` flag

## Options

```
--stdio              Run in STDIO mode (default)
--http               Run in HTTP mode
--config <path>      Path to configuration file
--host <string>      HTTP server host (default: 127.0.0.1)
--port <number>      HTTP server port (default: 3929)
--log-level <level>  Log level (silent|error|warn|info|debug|trace)
--help               Show help
--version            Show version
```

## Configuration

Create a `hatago.config.json`:

```json
{
  "mcpServers": {
    "filesystem": {
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-filesystem", "/tmp"]
    },
    "github": {
      "url": "https://api.github.com/mcp",
      "type": "sse"
    }
  }
}
```

Supports JSON with comments (JSONC):

```jsonc
{
  // Local filesystem server
  "mcpServers": {
    "filesystem": {
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-filesystem", "/tmp"]
    }
  }
}
```

## Environment Variables

- `HATAGO_CONFIG` - Configuration file path
- `HATAGO_HOST` - HTTP server host
- `HATAGO_PORT` - HTTP server port
- `HATAGO_LOG_LEVEL` - Log level

## Priority Order

1. CLI arguments
2. Environment variables
3. Configuration file
4. Defaults

## Development

```bash
# Install dependencies
pnpm install

# Build
pnpm build

# Development mode
pnpm dev

# Type check
pnpm typecheck
```

## License

MIT