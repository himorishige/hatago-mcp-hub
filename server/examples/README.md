# Hatago Examples

This directory contains example MCP servers demonstrating various features of Hatago.

## test-mcp-server.js

A simple MCP server demonstrating basic tool, resource, and prompt definitions using the @modelcontextprotocol/sdk.

### Features
- **Tools**: Example tool with Zod schema validation
- **Resources**: Static and dynamic resource examples
- **Prompts**: Example prompt templates

### Running the Server

#### Standalone (for testing)
```bash
node examples/test-mcp-server.js
```

#### With MCP Inspector
```bash
npx @modelcontextprotocol/inspector node examples/test-mcp-server.js
```

#### With Hatago
```bash
# Add as local server
hatago mcp add test-local -- node examples/test-mcp-server.js

# Or configure in .hatago.json
{
  "servers": {
    "test-local": {
      "id": "test-local",
      "type": "local",
      "command": "node",
      "args": ["examples/test-mcp-server.js"],
      "start": "lazy"
    }
  }
}
```

### Important: Zod Schema Requirement

When using @modelcontextprotocol/sdk, tool input schemas must be defined using Zod objects, not JSON Schema:

```javascript
import { z } from 'zod';

// Correct: Zod schema object
server.registerTool(
  'my_tool',
  {
    inputSchema: {
      name: z.string().describe('Name parameter'),
      count: z.number().optional()
    }
  },
  async (args) => { /* ... */ }
);

// Incorrect: JSON Schema (will fail)
server.registerTool(
  'my_tool',
  {
    inputSchema: {
      type: 'object',
      properties: {
        name: { type: 'string' }
      }
    }
  },
  async (args) => { /* ... */ }
);
```

## Creating Your Own MCP Server

### Basic Template

```javascript
import { createServer } from '@modelcontextprotocol/sdk';
import { z } from 'zod';

const server = createServer();

// Register a tool
server.registerTool(
  'hello_world',
  {
    title: 'Hello World',
    description: 'Greets the world',
    inputSchema: {
      name: z.string().describe('Name to greet')
    }
  },
  async (args) => {
    return {
      content: [{
        type: 'text',
        text: `Hello, ${args.name}!`
      }]
    };
  }
);

// Register a resource
server.registerResource(
  'example://data',
  {
    title: 'Example Data',
    mimeType: 'text/plain'
  },
  async () => {
    return {
      contents: [{
        uri: 'example://data',
        mimeType: 'text/plain',
        text: 'Example data content'
      }]
    };
  }
);

// Start STDIO transport
server.startStdioTransport();
```

### Python Example

```python
from mcp import Server, Tool
from pydantic import BaseModel

server = Server()

class HelloInput(BaseModel):
    name: str

@server.tool()
async def hello_world(input: HelloInput) -> str:
    return f"Hello, {input.name}!"

if __name__ == "__main__":
    server.run_stdio()
```

## Configuration Examples

### Multi-Server Setup

```json
{
  "servers": {
    "local-js": {
      "id": "local-js",
      "type": "local",
      "command": "node",
      "args": ["./my-js-server.js"],
      "start": "immediate"
    },
    "local-python": {
      "id": "local-python",
      "type": "local",
      "command": "python",
      "args": ["./my-python-server.py"],
      "start": "lazy"
    },
    "filesystem": {
      "id": "filesystem",
      "type": "npx",
      "package": "@modelcontextprotocol/server-filesystem",
      "args": ["/path/to/files"]
    }
  }
}
```

### Development Configuration

```json
{
  "logLevel": "debug",
  "servers": {
    "dev-server": {
      "id": "dev-server",
      "type": "local",
      "command": "node",
      "args": ["--inspect", "./server.js"],
      "env": {
        "NODE_ENV": "development",
        "DEBUG": "*"
      },
      "cwd": "./src",
      "start": "immediate"
    }
  }
}
```

## Debugging Tips

1. **Enable Debug Logging**:
   ```bash
   LOG_LEVEL=debug hatago serve
   ```

2. **Test Server Directly**:
   ```bash
   # Test STDIO communication
   echo '{"jsonrpc":"2.0","method":"initialize","id":1,"params":{}}' | node examples/test-mcp-server.js
   ```

3. **Use MCP Inspector**:
   ```bash
   npx @modelcontextprotocol/inspector node examples/test-mcp-server.js
   ```

4. **Check Server Logs**:
   - Server stderr is captured and logged on errors
   - Add console.error() statements for debugging
   - Use DEBUG environment variable for verbose output

## Common Issues

### Empty inputSchema Error
**Problem**: Tools fail with "inputSchema is empty or undefined"
**Solution**: Use Zod schema objects, not JSON Schema

### Process Exits Unexpectedly
**Problem**: Server process exits with code 1
**Solution**: Check that paths are correct and dependencies are installed

### Session Not Found
**Problem**: HTTP requests fail with "Session not found"
**Solution**: Ensure session ID is maintained across requests

## Further Reading

- [MCP Specification](https://modelcontextprotocol.io)
- [Hatago Documentation](../docs/)
- [@modelcontextprotocol/sdk](https://www.npmjs.com/package/@modelcontextprotocol/sdk)