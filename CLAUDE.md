# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Hatago MCP Hub is a lightweight MCP (Model Context Protocol) hub server that manages multiple MCP servers. Built on Hono with a simplified architecture focusing on essential functionality while maintaining extensibility.

## Tech Stack

- **Runtime**: Node.js 20+ / Cloudflare Workers (Bun/Deno in development)
- **Language**: TypeScript with ESM modules
- **Web Framework**: Hono
- **MCP SDK**: @modelcontextprotocol/sdk (requires Zod schemas for tools)
- **Build Tool**: tsdown
- **Test Framework**: Vitest
- **Linter/Formatter**: ESLint + Prettier
- **Package Manager**: pnpm

## Project Structure

```
/
├── packages/
│   ├── mcp-hub/        # Main npm package (@himorishige/hatago-mcp-hub)
│   │   ├── src/
│   │   │   └── node/
│   │   │       └── cli.ts    # CLI entry point with subcommands
│   │   └── package.json
│   │
│   ├── server/         # Server implementation (@himorishige/hatago-server)
│   │   ├── src/
│   │   │   ├── index.ts      # API exports (startServer, generateDefaultConfig)
│   │   │   ├── server.ts     # Main server implementation
│   │   │   ├── config.ts     # Configuration management
│   │   │   └── utils.ts      # Utilities
│   │   └── package.json
│   │
│   ├── hub/            # Hub core (@himorishige/hatago-hub)
│   │   ├── src/
│   │   │   ├── hub.ts              # Main hub (~500 lines)
│   │   │   ├── types.ts            # Core types
│   │   │   └── ...
│   │   └── package.json
│   │
│   ├── core/           # Shared types (@himorishige/hatago-core)
│   ├── runtime/        # Runtime components (@himorishige/hatago-runtime)
│   ├── transport/      # Transport layer (@himorishige/hatago-transport)
│   └── cli/            # CLI tools (development only)
│
├── schemas/            # JSON Schema definitions
│   ├── config.schema.json    # Configuration schema
│   └── example.config.json   # Example configuration
│
├── examples/           # Usage examples
│   ├── node-example/   # Node.js example with TypeScript
│   └── workers-example/# Cloudflare Workers example
│
└── docs/               # Documentation
    ├── architecture.md # System architecture
    └── configuration.md# Configuration guide
```

## Essential Development Commands

```bash
# From root directory:

# Install dependencies
pnpm install

# Build all packages
pnpm -r build

# Run tests
pnpm test

# Code Quality - Run these after making changes
pnpm format       # Format code
pnpm lint         # Lint with auto-fix
pnpm check        # Format + Lint + Type check

# Development
cd packages/server
pnpm dev          # Start dev server with watch mode

# Using the CLI (after building)
npx @himorishige/hatago-mcp-hub init   # Initialize config
npx @himorishige/hatago-mcp-hub serve  # Start server
npx @himorishige/hatago-mcp-hub serve --tags dev,test  # With tag filtering
```

## CLI Commands

The main package provides `hatago` command with subcommands:

```bash
# Configuration
hatago init              # Create configuration file (interactive)
hatago init --mode stdio # Create config for Claude Code
hatago init --mode http  # Create config for debugging

# Server Management
hatago serve             # Start server in STDIO mode
hatago serve --stdio     # Explicit STDIO mode
hatago serve --http      # HTTP mode for debugging
hatago serve --watch     # Enable hot reload
hatago serve --verbose   # Debug logging
hatago serve --tags dev,test  # Filter servers by tags
```

## Configuration

### Basic Structure

```json
{
  "$schema": "https://raw.githubusercontent.com/himorishige/hatago-mcp-hub/main/schemas/config.schema.json",
  "version": 1,
  "logLevel": "info",
  "mcpServers": {
    "server-id": {
      // Local/NPX server
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-filesystem", "."],
      "env": { "KEY": "${ENV_VAR}" },
      "cwd": "./path",

      // Remote server
      "url": "https://api.example.com/mcp",
      "type": "http" | "sse",
      "headers": { "Authorization": "Bearer ${TOKEN}" },

      // Common
      "disabled": false,
      "tags": ["dev", "production"]  // Optional: for tag-based filtering
    }
  }
}
```

### Environment Variable Expansion

Claude Code compatible syntax:

- `${VAR}` - Required variable
- `${VAR:-default}` - With default value

## MCP Implementation Notes

### Key Features

- **Hot Reload**: Config watching with 1-second debounce
- **Progress Notifications**: Transparent forwarding from child servers
- **Tool Collision Avoidance**: Automatic prefixing with server ID
- **Session Management**: Independent sessions per client
- **Internal Resource**: `hatago://servers` (JSON snapshot of connected servers)
- **Tag-based Filtering**: Filter servers by tags for different profiles/environments

### Protocol Compliance

#### STDIO Transport

```typescript
// ✅ Correct: Newline-delimited JSON (MCP standard)
writer.write(JSON.stringify(message) + '\n');

// ❌ Wrong: LSP-style Content-Length header
writer.write(`Content-Length: ${length}\r\n\r\n${message}`);
```

#### Notifications

```typescript
// ✅ Correct: No id field in notifications
const notification = {
  jsonrpc: '2.0',
  method: 'notifications/progress',
  params: { ... }
};

// ❌ Wrong: Including id in notifications
const notification = {
  jsonrpc: '2.0',
  id: 123,  // Notifications don't have id
  method: 'notifications/progress',
  params: { ... }
};
```

#### Tool Definitions

```typescript
// ✅ Correct: Using Zod schemas
server.registerTool(
  'tool_name',
  {
    inputSchema: z.object({
      param: z.string().describe('Description')
    })
  },
  handler
);

// ❌ Wrong: Plain objects
server.registerTool(
  'tool_name',
  {
    inputSchema: { param: z.string() } // Not a Zod object
  },
  handler
);
```

### MCP SDK Usage

#### High-Level API (Recommended)

```typescript
// Connect client
await client.connect(transport);

// Use tools
const tools = await client.listTools();
const result = await client.callTool({
  name: 'tool_name',
  arguments: args
});

// Use resources
const resources = await client.listResources();
const content = await client.readResource({ uri: 'resource_uri' });
```

#### Low-Level API (Requires Zod Schema)

```typescript
import { ListToolsResultSchema } from '@modelcontextprotocol/sdk/types.js';

// Must provide Zod schema as second argument
const result = await client.request({ method: 'tools/list', params: {} }, ListToolsResultSchema);
```

## Code Style Guidelines

- **Quotes**: Single quotes (')
- **Indentation**: 2 spaces
- **File naming**: kebab-case
- **MCP tool names**: snake_case (per MCP spec)
- **TypeScript**: Strict mode enabled
- **Imports**: Keep consistent; rely on ESLint/Prettier rules

## Testing & Quality

```bash
# Run tests
pnpm test

# Type checking
pnpm typecheck

# Linting & formatting
pnpm check  # Runs format + lint + typecheck
```

## Version History

### v0.0.2 (Development)

- Tag-based server filtering for profile management
- Support for Japanese tags in configuration

### v0.0.2 (Current)

- Tag-based server filtering (OR logic)
- Support for Japanese tags
- CLI --tags option for server grouping
- Backward compatibility maintained

### v0.0.1

- Simplified architecture (38+ files removed)
- Core functionality focus (~500 lines hub)
- Full MCP compliance
- Multi-transport support (STDIO, HTTP, SSE)
- Hot reload capability
- Progress notification forwarding
- Internal management tools
- Environment variable expansion

## Hatago Design Philosophy

### Core Mantra - The Magic of "Thinness"

The essence of Hatago lies in its "thin implementation". This characteristic, clarified through comparative analysis, must be preserved as the highest priority.

**Hatago's Core Mantra:**

- **"Don't add, remove"** - Prioritize reduction over feature addition
- **"Don't transform, relay"** - Avoid data processing, maintain transparency
- **"Don't judge, pass through"** - Avoid complex logic, simple relay only
- **"Don't thicken, stay thin"** - Maintain minimal implementation

### Design Principles - Principles of Thin Implementation

#### 1. Maintaining Transparency

```typescript
// ✅ Good: Simple relay
async callTool(name, args) {
  const server = this.resolveServer(name);
  return server.call(name, args);
}

// ❌ Bad: Complex processing
async callTool(name, args) {
  const enhanced = await this.analyzeContext(args);
  const optimized = await this.optimizeQuery(enhanced);
  const result = await this.execute(optimized);
  return this.postProcess(result);
}
```

#### 2. Minimal Intervention

What Hatago does:

- Namespace resolution/prefixing
- Connection management
- Error forwarding
- Progress notification relay

What Hatago doesn't do:

- Data transformation or processing
- Result caching
- Complex error recovery
- AI-based optimization

#### 3. Convention over Configuration

```json
// Simple default behavior - works with minimal config
{
  "mcpServers": {
    "server1": { "command": "..." }
  }
}
```

### Feature Addition Criteria

Before adding any new feature, verify ALL criteria are met:

```typescript
function shouldAddFeature(feature: Feature): boolean {
  // 1. Is code addition under 100 lines?
  if (feature.linesOfCode > 100) return false;

  // 2. Does it require new dependencies?
  if (feature.requiresNewDependency) return false;

  // 3. Does it transform/process data?
  if (feature.transformsData) return false;

  // 4. Does it maintain state?
  if (feature.maintainsState) return false;

  // 5. Is it simple passthrough/relay?
  if (!feature.isPassthrough) return false;

  return true;
}
```

### Acceptable vs Unacceptable Features

#### ✅ Acceptable "Thin" Features

- **Passthrough functionality**: Direct relay without modification
- **Simple filtering**: Basic tag-based selection
- **Basic multiplexing**: Promise.all for parallel operations
- **Metrics collection**: Recording only, no analysis
- **Health checks**: Simple ping operations
- **Connection pooling**: Reuse only, no complex management

#### ❌ Absolutely Unacceptable "Thick" Features

- **AI Integration**: Memory or reasoning systems
- **Cache Systems**: Requires state management
- **Complex Routing**: Contains business logic
- **Data Transformation Pipeline**: Input/output processing
- **Business Logic**: Application-specific processing

## Architecture Highlights

### Simplified Design

- Removed complex state machines and activation managers
- Direct server management without abstraction layers
- Simple configuration with JSON schema validation
- Minimal external dependencies

### Platform Support

- **Node.js**: Full support (local, NPX, remote servers)
- **Cloudflare Workers**: Remote servers only
- **Bun/Deno**: Work in progress

### Key Components

- **Hub** (`packages/hub/src/hub.ts`): Central coordinator
- **Server Registry**: Manages different server types
- **Session Manager**: Client isolation
- **Tool/Resource/Prompt Registry**: MCP entity management

## Development Guidelines

### When Making Changes

1. **Follow existing patterns** - Check neighboring code for conventions
2. **Maintain simplicity** - Avoid unnecessary abstractions
3. **Test your changes** - Run `pnpm test` and `pnpm check`
4. **Update documentation** - Keep CLAUDE.md and docs/ current
5. **Use semantic commits** - feat:, fix:, docs:, etc.

### Adding Features

1. Consider if it aligns with "lightweight hub" philosophy
2. Implement in appropriate package
3. Add tests
4. Update configuration schema if needed
5. Document in relevant files

#### Example: Tag-based Filtering Implementation

The tag filtering feature was implemented with:

1. **Schema Update**: Added `tags` field to server config (string[], optional)
2. **CLI Option**: Added `--tags` option to serve command
3. **Hub Logic**: Filter servers in `hub.ts` start() and reloadConfig()
4. **Type Updates**: Extended HubOptions and ServerOptions interfaces
5. **Tests**: Created comprehensive tests for tag matching logic
6. **Documentation**: Updated README files with usage examples

### Common Tasks

- **Add new server type**: Implement in `packages/runtime/src/`
- **Add transport**: Implement in `packages/transport/src/`
- **Add CLI command**: Update `packages/mcp-hub/src/node/cli.ts`
- **Update config**: Modify `schemas/config.schema.json`

## Troubleshooting

### Common Issues

1. **Environment variable not found**: Export variable or use default syntax
2. **Server connection failed**: Check URL, credentials, network
3. **Tool name collision**: Hub automatically prefixes with server ID
4. **Hot reload not working**: Ensure `--watch` flag is used

### Debug Mode

```bash
# Enable debug logging
hatago serve --verbose

# Or in config
{
  "logLevel": "debug"
}
```

## Important Notes

- Always use `@himorishige/hatago-mcp-hub` as the npm package name
- Main entry is through `hatago` CLI with subcommands
- Configuration uses `mcpServers` (not `servers`)
- Schema URL: https://raw.githubusercontent.com/himorishige/hatago-mcp-hub/main/schemas/config.schema.json
- Support for Claude Code, Codex CLI, Cursor, Windsurf, etc.
