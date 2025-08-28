# Minimal MCP Server Example

A minimal example showing how to create an MCP server with a single tool.

## Quick Start

```bash
# Install dependencies
pnpm install

# Run the server
pnpm start
```

## Testing with Hatago

Add this server to your Hatago configuration:

```json
{
  "servers": [
    {
      "id": "minimal-example",
      "type": "local",
      "command": "node",
      "args": ["./examples/minimal-mcp/src/index.js"]
    }
  ]
}
```

Then start Hatago:
```bash
npx hatago serve
```

## Features

- Single `echo` tool that returns the input message
- Minimal dependencies (only MCP SDK)
- Less than 70 lines of code
- Ready to use as a template