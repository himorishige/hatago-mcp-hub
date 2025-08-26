# Developer Guide

This guide covers the advanced developer experience features in Hatago MCP Hub, including type generation, decorator APIs, test utilities, and OpenAPI integration.

## Quick Start

```bash
# Start development server with hot reload
hatago dev ./my-server.js

# Add local command server
hatago mcp add myserver -- node ./my-server.js

# Add Python server
hatago mcp add python-server -- python ./server.py

# Inspect an MCP server
hatago inspect @modelcontextprotocol/server-filesystem

# Generate TypeScript types
hatago generate types ./types/mcp-servers.d.ts

# Convert OpenAPI to MCP tools
hatago generate mcp --from-openapi ./api.yaml
```

## Local MCP Server Development

Hatago supports running local MCP servers using any command (node, python, deno, etc.) with STDIO transport.

### Creating a Local MCP Server

Local MCP servers must use Zod schemas for tool input definitions when using @modelcontextprotocol/sdk:

```javascript
import { createServer } from "@modelcontextprotocol/sdk";
import { z } from "zod";

const server = createServer();

// IMPORTANT: Use Zod schema objects, not JSON Schema
server.registerTool(
  "my_tool",
  {
    title: "My Tool",
    description: "Does something useful",
    inputSchema: {
      // Zod schema definition
      name: z.string().describe("Name parameter"),
      count: z.number().optional().describe("Optional count"),
    },
  },
  async (args) => {
    // Tool implementation
    return {
      content: [
        {
          type: "text",
          text: `Hello ${args.name}!`,
        },
      ],
    };
  },
);

// Start STDIO transport
server.startStdioTransport();
```

### Python MCP Server Example

```python
from mcp import Server, Tool
from pydantic import BaseModel

server = Server()

class MyToolInput(BaseModel):
    name: str
    count: int = 1

@server.tool()
async def my_tool(input: MyToolInput) -> str:
    return f"Hello {input.name}! Count: {input.count}"

if __name__ == "__main__":
    server.run_stdio()
```

### Running Local Servers

```bash
# Add local Node.js server
hatago mcp add node-server -- node ./server.js --debug

# Add local Python server
hatago mcp add python-server -- python ./server.py

# Add local Deno server
hatago mcp add deno-server -- deno run --allow-net ./server.ts

# With working directory
hatago mcp add server -- node ./server.js
# Server will run with cwd set to the config file location
```

### Configuration

```json
{
  "servers": {
    "local-server": {
      "id": "local-server",
      "type": "local",
      "command": "node",
      "args": ["./my-server.js"],
      "cwd": "/path/to/server",
      "env": {
        "DEBUG": "true"
      },
      "start": "lazy"
    }
  }
}
```

### Debugging Local Servers

1. **Enable debug logging**:

```bash
LOG_LEVEL=debug hatago serve
```

2. **Check server output**:

```bash
# Server stderr is logged when errors occur
# Add DEBUG env var to your server for verbose output
```

3. **Test with MCP Inspector**:

```bash
npx @modelcontextprotocol/inspector ./my-server.js
```

## Type Generation

Hatago can automatically generate TypeScript types from MCP servers, providing full IntelliSense support and type safety.

### Basic Usage

```bash
# Generate types for all configured servers
hatago generate types ./types/generated.d.ts

# Generate types for specific server
hatago generate types --server filesystem ./types/filesystem.d.ts

# Watch mode (regenerate on changes)
hatago generate types --watch ./types/generated.d.ts
```

### Generated Types Example

Input (MCP server with tools):

```json
{
  "tools": [
    {
      "name": "greet-user",
      "description": "Greets a user with a personalized message",
      "inputSchema": {
        "type": "object",
        "properties": {
          "name": { "type": "string" },
          "greeting": { "type": "string", "optional": true }
        },
        "required": ["name"]
      }
    }
  ]
}
```

Generated TypeScript:

```typescript
export interface GreetUserInput {
  name: string;
  greeting?: string;
}

export type GreetUserResult = CallToolResult;

export interface GreetUserTool {
  name: "greet-user";
  input: GreetUserInput;
  result: GreetUserResult;
}

export interface MCPClient {
  greetUser(input: GreetUserInput): Promise<GreetUserResult>;
}
```

### Programmatic API

```typescript
import { TypeGenerator, MCPIntrospector } from "@himorishige/hatago/codegen";

const introspector = new MCPIntrospector();
const generator = new TypeGenerator();

// Introspect server
const definitions = await introspector.introspect({
  type: "npx",
  package: "@modelcontextprotocol/server-filesystem",
});

// Generate types
const typeCode = await generator.generateTypes(definitions);

console.log(typeCode);
```

### Configuration

Configure type generation in your Hatago config:

```json
{
  "development": {
    "typeGeneration": {
      "enabled": true,
      "outputPath": "./types/generated.d.ts",
      "watchMode": true,
      "includeServers": ["filesystem", "github"],
      "exportFormat": "esm"
    }
  }
}
```

## Decorator API (Experimental)

⚠️ **Experimental Feature**: The Decorator API is experimental and may change in future versions.

### Overview

The Decorator API allows you to define MCP servers declaratively using TypeScript decorators:

```typescript
import "reflect-metadata";
import { mcp, tool, resource, prompt } from "@himorishige/hatago/decorators";

@mcp({
  name: "Calculator Server",
  version: "1.0.0",
  description: "A simple calculator",
})
class CalculatorServer {
  @tool({
    description: "Add two numbers",
    inputSchema: {
      type: "object",
      properties: {
        a: { type: "number" },
        b: { type: "number" },
      },
      required: ["a", "b"],
    },
  })
  async add(args: { a: number; b: number }): Promise<number> {
    return args.a + args.b;
  }

  @resource({
    uri: "calc://constants/pi",
    name: "Pi Constant",
    mimeType: "text/plain",
  })
  async getPi(): Promise<string> {
    return Math.PI.toString();
  }

  @prompt({
    description: "Generate a math problem",
    arguments: [
      { name: "difficulty", required: false },
      { name: "type", required: true },
    ],
  })
  async mathProblem(args: { difficulty?: string; type: string }) {
    return {
      description: `A ${args.difficulty || "easy"} ${args.type} problem`,
      messages: [
        {
          role: "user",
          content: {
            type: "text",
            text: `Generate a ${args.difficulty || "easy"} ${args.type} math problem`,
          },
        },
      ],
    };
  }
}
```

### Using Decorator Servers

#### With ServerFactory

```typescript
import { ServerFactory } from "@himorishige/hatago/decorators";

const server = ServerFactory.create(CalculatorServer);

// Use the server
const result = await server.callTool({
  method: "tools/call",
  params: { name: "add", arguments: { a: 5, b: 3 } },
});
```

#### With Hatago Hub

```typescript
import { DecoratorServerNode } from "@himorishige/hatago/decorators";

// Register with hub
const node = new DecoratorServerNode("calculator", {
  server: CalculatorServer,
});

hub.addServer(node);
```

#### With Constructor Arguments

```typescript
@mcp({ name: "Database Server", version: "1.0.0" })
class DatabaseServer {
  constructor(private connectionString: string) {}

  @tool({ description: "Query database" })
  async query(args: { sql: string }) {
    // Use this.connectionString
    return { results: [] };
  }
}

// Create with arguments
const server = ServerFactory.create(DatabaseServer, "postgres://localhost/db");
```

### TypeScript Configuration

Enable decorators in `tsconfig.json`:

```json
{
  "compilerOptions": {
    "experimentalDecorators": true,
    "emitDecoratorMetadata": true
  }
}
```

Install required dependency:

```bash
npm install reflect-metadata
```

## Test Utilities

Hatago provides comprehensive test utilities for testing MCP servers without network complexity.

### MockMCPServer

Create mock MCP servers for testing:

```typescript
import { MockMCPServer, MCPTestClient } from "@himorishige/hatago/testing";

const server = new MockMCPServer({
  name: "Test Server",
  version: "1.0.0",
});

// Add tools
server.addTool(
  { name: "greet", description: "Greet someone" },
  async (args) => `Hello, ${args.name}!`,
);

// Add resources
server.addResource(
  { uri: "test://greeting.txt", name: "Greeting" },
  async () => "Welcome!",
);

// Test the server
const client = new MCPTestClient(server);
await client.connect();

const result = await client.testToolCalls([
  {
    name: "greet",
    arguments: { name: "World" },
    expectedResult: (result) => result.content[0].text === "Hello, World!",
  },
]);
```

### Testing Real Servers

```typescript
import {
  createTestEnvironment,
  runMCPTestSuite,
} from "@himorishige/hatago/testing";

// Test real server
const { server, client } = await createTestEnvironment({
  name: "Real Server Test",
});

// Add your real server setup here
// server.addTool(...), server.addResource(...)

await runMCPTestSuite({
  server,
  toolTests: [
    {
      name: "my-tool",
      arguments: { param: "value" },
      expectedResult: (result) => result.content[0].text.includes("expected"),
    },
  ],
  resourceTests: [
    {
      uri: "test://resource",
      expectedContent: (result) => result.contents[0].text === "expected",
    },
  ],
});
```

### Integration Testing

```typescript
describe("MCP Server Integration", () => {
  let hub: HatagoHub;
  let testClient: MCPTestClient;

  beforeEach(async () => {
    hub = new HatagoHub();

    // Add your decorator server
    const node = new DecoratorServerNode("test-server", {
      server: MyDecoratorServer,
    });

    hub.addServer(node);
    await hub.start();

    testClient = new MCPTestClient(hub);
    await testClient.connect();
  });

  afterEach(async () => {
    await testClient.disconnect();
    await hub.shutdown();
  });

  it("should handle tool calls", async () => {
    const result = await testClient.callTool("my-tool", { param: "value" });
    expect(result.content[0].text).toBe("expected result");
  });
});
```

## OpenAPI Integration

Convert between OpenAPI specifications and MCP tools for REST/MCP interoperability.

### OpenAPI to MCP Tools

```bash
# Generate MCP tools from OpenAPI spec
hatago generate mcp --from-openapi ./api.yaml --output ./mcp-tools.json

# With filtering
hatago generate mcp --from-openapi ./api.yaml --include-operations "user.*" --tag-filter users
```

### Programmatic Conversion

```typescript
import { OpenAPIGenerator } from "@himorishige/hatago/integrations";

const generator = new OpenAPIGenerator();

// Convert OpenAPI to MCP tools
const tools = await generator.generateToolsFromOpenAPI(openApiSpec, {
  serverUrl: "https://api.example.com",
  namePrefix: "api",
  includeOperations: [".*User.*"],
  tagFilter: ["users"],
});

console.log(tools); // Array of MCP Tool objects
```

### MCP Tools to REST API

```typescript
import { OpenAPIGenerator } from "@himorishige/hatago/integrations";

const generator = new OpenAPIGenerator();

// Convert MCP tools to REST API
const app = generator.createRESTAPIFromTools(
  tools,
  async (toolName, args) => {
    // Tool handler implementation
    return await callMCPTool(toolName, args);
  },
  {
    basePath: "/api",
    enableDocs: true,
    corsEnabled: true,
    authentication: {
      required: true,
      schemes: ["bearer"],
    },
  },
);

// Start the server
import { serve } from "@hono/node-server";
serve(app, (info) => {
  console.log(`REST API server started on http://localhost:${info.port}`);
});
```

### Generated REST Endpoints

From MCP tools, the generator creates:

```
POST /api/tools/{toolName}
GET  /api/resources/{resourcePath}
POST /api/prompts/{promptName}
GET  /api/openapi.json
GET  /api/docs (Swagger UI)
```

Example request:

```bash
curl -X POST http://localhost:3000/api/tools/greet-user \
  -H "Content-Type: application/json" \
  -d '{"name": "World", "greeting": "Hello"}'
```

## Development Server

The development server provides file watching, hot reload, and debugging features.

### Basic Usage

```bash
# Start dev server
hatago dev ./my-server.js

# With type generation
hatago dev --generate-types ./my-server.js

# Custom port
hatago dev --port 4000 ./my-server.js

# Debug mode
hatago dev --debug ./my-server.js
```

### Configuration

```json
{
  "development": {
    "hotReload": true,
    "watchFiles": ["**/*.js", "**/*.ts"],
    "ignoreFiles": ["node_modules/**", "dist/**"],
    "typeGeneration": {
      "enabled": true,
      "outputPath": "./types/generated.d.ts"
    },
    "debugging": {
      "enabled": true,
      "inspectPort": 9229
    }
  }
}
```

### Programmatic API

```typescript
import { DevServer } from "@himorishige/hatago/cli/commands";

const devServer = new DevServer({
  serverTarget: "./my-server.js",
  port: 3000,
  hotReload: true,
  generateTypes: true,
});

await devServer.start();

// Server automatically restarts on file changes
```

## Best Practices

### Type Generation

1. Run type generation in CI/CD to catch interface changes
2. Use `--watch` mode during development
3. Include generated types in version control for team consistency
4. Configure exclusion patterns to avoid unnecessary regeneration

### Decorator API

1. Use TypeScript interfaces for method parameters
2. Provide comprehensive input schemas for validation
3. Handle errors gracefully with descriptive messages
4. Test decorated servers using the test utilities

### Testing

1. Use MockMCPServer for unit tests
2. Test real servers with integration tests
3. Use the test utilities for complex scenarios
4. Mock external dependencies in tool implementations

### OpenAPI Integration

1. Keep OpenAPI specs up to date
2. Use semantic versioning for API changes
3. Test both directions of conversion
4. Document authentication requirements clearly

### Development Workflow

1. Use the development server for rapid iteration
2. Enable type generation to catch errors early
3. Set up file watching for automatic rebuilds
4. Use debugging tools for troubleshooting

This developer guide should help you leverage Hatago's advanced features to build, test, and integrate MCP servers effectively.
