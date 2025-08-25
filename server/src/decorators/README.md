# Decorators API (Experimental)

The Decorators API provides TypeScript decorators for defining MCP servers in a declarative way.

⚠️ **This API is experimental and may change in future versions.**

## Requirements

- TypeScript with `experimentalDecorators: true` and `emitDecoratorMetadata: true`
- `reflect-metadata` package

## Basic Usage

```typescript
import 'reflect-metadata'
import { mcp, tool, resource, prompt } from '@himorishige/hatago/decorators'

@mcp({
  name: 'My Calculator',
  version: '1.0.0',
  description: 'A simple calculator MCP server'
})
class CalculatorServer {
  @tool({
    description: 'Add two numbers',
    inputSchema: {
      type: 'object',
      properties: {
        a: { type: 'number' },
        b: { type: 'number' }
      },
      required: ['a', 'b']
    }
  })
  async add(args: { a: number; b: number }): Promise<number> {
    return args.a + args.b
  }

  @tool({
    name: 'multiply',
    description: 'Multiply two numbers'
  })
  async mult(args: { x: number; y: number }): Promise<number> {
    return args.x * args.y
  }

  @resource({
    uri: 'calc://constants/pi',
    name: 'Pi Constant',
    description: 'The mathematical constant π',
    mimeType: 'text/plain'
  })
  async getPi(): Promise<string> {
    return Math.PI.toString()
  }

  @prompt({
    description: 'Generate a math problem',
    arguments: [
      { name: 'difficulty', description: 'Problem difficulty', required: false },
      { name: 'type', description: 'Problem type', required: true }
    ]
  })
  async mathProblem(args: { difficulty?: string; type: string }): Promise<any> {
    const difficulty = args.difficulty || 'easy'
    return {
      description: `A ${difficulty} ${args.type} problem`,
      messages: [
        {
          role: 'user',
          content: {
            type: 'text',
            text: `Generate a ${difficulty} ${args.type} math problem`
          }
        }
      ]
    }
  }
}
```

## Creating Server Instance

### Using ServerFactory

```typescript
import { ServerFactory } from '@himorishige/hatago/decorators'

const server = ServerFactory.create(CalculatorServer)

// Use the server
const result = await server.callTool({
  method: 'tools/call',
  params: { name: 'add', arguments: { a: 5, b: 3 } }
})
console.log(result.content[0].text) // "8"
```

### Integration with MCP Hub

```typescript
import { DecoratorServerNode } from '@himorishige/hatago/decorators'

// Add to MCP Hub
const node = new DecoratorServerNode('calculator', {
  server: CalculatorServer
})

// Register with hub
hub.addServer(node)
```

## Decorators Reference

### @mcp(options)

Class decorator to mark a class as an MCP server.

**Options:**
- `name: string` - Server name
- `version: string` - Server version  
- `description?: string` - Server description
- `capabilities?` - Server capabilities configuration

### @tool(options)

Method decorator to define an MCP tool.

**Options:**
- `name?: string` - Tool name (defaults to method name)
- `description: string` - Tool description
- `inputSchema?: JSONSchema` - Input validation schema

### @resource(options)

Method decorator to define an MCP resource handler.

**Options:**
- `uri: string` - Resource URI
- `name?: string` - Resource name (defaults to URI)
- `description?: string` - Resource description  
- `mimeType?: string` - MIME type (defaults to 'text/plain')

### @prompt(options)

Method decorator to define an MCP prompt handler.

**Options:**
- `name?: string` - Prompt name (defaults to method name)
- `description: string` - Prompt description
- `arguments?: Array` - Prompt argument definitions

## Advanced Features

### Custom Constructor Arguments

```typescript
@mcp({ name: 'Database Server', version: '1.0.0' })
class DatabaseServer {
  constructor(private connectionString: string) {}

  @tool({ description: 'Query database' })
  async query(args: { sql: string }): Promise<any> {
    // Use this.connectionString
    return { results: [] }
  }
}

// Create with constructor arguments
const server = ServerFactory.create(DatabaseServer, 'postgres://...')
```

### Error Handling

```typescript
@tool({ description: 'Risky operation' })
async riskyOperation(args: any): Promise<string> {
  if (args.dangerous) {
    throw new Error('Operation too dangerous!')
  }
  return 'Success'
}
```

### Method Return Types

Tools can return:
- Primitive values (string, number, boolean)
- Objects (serialized to JSON)
- Promises (awaited automatically)

Resource handlers should return:
- String content
- Objects (serialized to JSON)

Prompt handlers can return:
- String (wrapped in user message)
- Object with `{ description, messages }` structure

## Best Practices

1. **Type Safety**: Use TypeScript interfaces for method parameters
2. **Validation**: Define proper `inputSchema` for tools
3. **Error Handling**: Throw descriptive errors for invalid inputs
4. **Documentation**: Provide clear descriptions for all decorators
5. **Testing**: Use the test utilities to validate your decorated servers

## Limitations

- Experimental API - may change in future versions
- Requires TypeScript with experimental decorators enabled
- Limited reflection capabilities compared to runtime inspection
- No support for dynamic tool/resource/prompt registration

## Migration from Manual Server Definition

```typescript
// Before: Manual server
class ManualServer {
  listTools() {
    return [
      { name: 'add', description: 'Add numbers', inputSchema: {...} }
    ]
  }
  
  async callTool(name: string, args: any) {
    if (name === 'add') return this.add(args)
    throw new Error('Unknown tool')
  }
  
  add(args: { a: number; b: number }) {
    return args.a + args.b
  }
}

// After: Decorator-based
@mcp({ name: 'Calculator', version: '1.0.0' })
class DecoratedServer {
  @tool({ description: 'Add numbers' })
  add(args: { a: number; b: number }) {
    return args.a + args.b
  }
}
```