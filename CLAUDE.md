# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Hatago MCP Hub is a multi-runtime MCP (Model Context Protocol) Hub server built on top of Hono. It provides unified management for multiple MCP servers with tool name collision avoidance and session management. The architecture uses a platform abstraction layer to support multiple JavaScript runtimes.

## Tech Stack

- **Runtime**: Node.js 20+ / Cloudflare Workers / Deno / Bun
- **Language**: TypeScript with ESM modules
- **Web Framework**: Hono
- **MCP SDK**: @modelcontextprotocol/sdk (requires Zod schemas for tools)
- **Build Tool**: tsdown
- **Test Framework**: Vitest
- **Linter/Formatter**: Biome
- **Package Manager**: pnpm

## Project Structure

```
/
├── packages/
│   ├── cli/            # CLI Tool (@hatago/cli)
│   │   ├── src/
│   │   │   ├── index.ts        # CLI entry point
│   │   │   └── commands/       # CLI commands
│   │   │       ├── serve.ts    # Start server command
│   │   │       ├── mcp.ts      # MCP management
│   │   │       └── config.ts   # Config management
│   │   └── package.json
│   │
│   ├── server/         # MCP Hub Server (@hatago/server)
│   │   ├── src/
│   │   │   ├── index.ts        # API exports (startServer, etc.)
│   │   │   ├── cli.ts          # Server CLI entry point
│   │   │   ├── cli/            # CLI implementation
│   │   │   ├── core/           # Core functionality
│   │   │   │   ├── mcp-hub.ts            # Main hub (~500 lines)
│   │   │   │   ├── mcp-hub-resources.ts  # Resource management
│   │   │   │   ├── mcp-hub-tools.ts      # Tool management
│   │   │   │   ├── mcp-hub-prompts.ts    # Prompt management
│   │   │   │   ├── session-manager.ts    # Session management
│   │   │   │   ├── tool-registry.ts      # Tool registry
│   │   │   │   ├── resource-registry.ts  # Resource registry
│   │   │   │   ├── prompt-registry.ts    # Prompt registry
│   │   │   │   ├── config-manager.ts     # Simple config management
│   │   │   │   └── types.ts              # Core types
│   │   │   ├── servers/        # MCP server implementations
│   │   │   │   ├── server-registry.ts    # Server management
│   │   │   │   ├── npx-mcp-server.ts     # NPX server support
│   │   │   │   ├── remote-mcp-server.ts  # Remote server
│   │   │   │   ├── remote-mcp-connection.ts # Connection management
│   │   │   │   └── custom-stdio-transport.ts # STDIO transport
│   │   │   ├── storage/        # Data storage
│   │   │   │   ├── unified-file-storage.ts  # File storage
│   │   │   │   └── memory-registry-storage.ts # Memory storage
│   │   │   ├── transport/      # Communication layer
│   │   │   └── utils/          # Utilities
│   │   │       ├── node-utils.ts    # Node.js utilities
│   │   │       ├── logger.ts        # Logging
│   │   │       ├── errors.ts        # Error handling
│   │   │       ├── error-codes.ts   # Error code definitions
│   │   │       ├── mutex.ts         # Mutex implementation
│   │   │       └── zod-like.ts      # Schema conversion
│   │   └── package.json
│   │
│   ├── core/           # Core types (@hatago/core)
│   │   ├── src/
│   │   └── package.json
│   │
│   ├── runtime/        # Runtime abstraction (@hatago/runtime)
│   │   ├── src/
│   │   │   ├── platform/       # Platform abstraction layer
│   │   │   │   ├── index.ts    # Platform interfaces
│   │   │   │   ├── node.ts     # Node.js implementation
│   │   │   │   └── workers.ts  # Cloudflare Workers implementation
│   │   │   └── utils/          # Runtime utilities
│   │   └── package.json
│   │
│   └── transport/      # Transport implementations (@hatago/transport)
│       ├── src/
│       └── package.json
│
├── schemas/            # JSON Schema definitions
│   ├── config.schema.json    # Configuration schema
│   └── example.config.json   # Example configuration
│
└── docs/               # Documentation
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

# Development (in packages/server directory)
cd packages/server
pnpm dev          # Start dev server with watch mode

# CLI usage (after building)
npx @hatago/cli serve           # Start MCP server in STDIO mode
npx @hatago/cli serve --http    # Start MCP server in HTTP mode
```

## CLI Commands (hatago)

```bash
# Server Management
hatago serve              # Start MCP Hub server
hatago status            # Check server status
hatago reload            # Reload configuration

# Development Tools
hatago dev <server>      # Start development server with hot reload
hatago inspect <target>  # Inspect MCP server capabilities
hatago generate types <output> # Generate TypeScript types
hatago generate mcp --from-openapi <spec> # Generate MCP from OpenAPI

# System Monitoring
hatago health            # Health check status
hatago metrics           # Display metrics
hatago logs --follow     # Follow logs
hatago trace <trace-id>  # Show trace details

# NPX MCP Server Management
hatago npx add <package>     # Add NPX MCP server
hatago npx list              # List NPX servers
hatago npx remove <id>       # Remove NPX server
hatago npx start/stop <id>   # Start/stop server
hatago npx status <id>       # Server details

# MCP Configuration (Claude Code Compatible)
hatago mcp list                              # List MCP servers
hatago mcp add <name> -- <cmd> [args...]     # Add local/NPX server (Claude Code format)
hatago mcp add --transport sse <name> <url>  # Add remote SSE server
hatago mcp add --transport http <name> <url> # Add remote HTTP server
hatago mcp remove <name>                      # Remove MCP server

# Examples:
hatago mcp add myserver -- node ./server.js  # Local Node.js server
hatago mcp add pyserver -- python ./srv.py   # Local Python server
hatago mcp add fs -- npx -y @modelcontextprotocol/server-filesystem /tmp

# Session Management
hatago session list          # List active sessions
hatago session delete <id>   # Delete session
hatago session clear         # Clear all sessions
```

## Code Style Guidelines

- **Quotes**: Single quotes (')
- **Indentation**: 2 spaces
- **File naming**: kebab-case
- **MCP tool names**: snake_case (per MCP spec)
- **TypeScript**: Strict mode enabled
- **Imports**: Automatically organized by Biome

## MCP Implementation Notes

- Server runs on port 3000 by default
- Session management uses `mcp-session-id` header
- Tool naming follows MCP specification (snake_case)
- Error responses follow JSON-RPC 2.0 format
- **Local servers**: Use Zod schema objects for tool inputs, not JSON Schema
- **Working directory**: Local servers use config file location as default cwd

### MCP SDK Client Usage (重要)

#### ✅ 正しい使い方 - 高レベルAPI

```typescript
// Client接続（自動的にinitializeも実行）
await client.connect(transport);

// ツール操作
const tools = await client.listTools();
const result = await client.callTool({
  name: "tool_name",
  arguments: args,
});

// リソース操作
const resources = await client.listResources();
const content = await client.readResource({ uri: "resource_uri" });

// プロンプト操作
const prompts = await client.listPrompts();
const prompt = await client.getPrompt({
  name: "prompt_name",
  arguments: args,
});
```

#### ❌ 避けるべき使い方 - 低レベルAPI（Zodスキーマなし）

```typescript
// これはエラーになる
const result = await (client as any).request({
  method: "tools/list",
  params: {},
}); // Error: resultSchema.parse is not a function
```

#### ⚠️ 低レベルAPIを使う場合（上級者向け）

```typescript
import { ListToolsResultSchema } from "@modelcontextprotocol/sdk/types.js";

// 第2引数にZodスキーマが必須
const result = await client.request(
  { method: "tools/list", params: {} },
  ListToolsResultSchema, // Zodスキーマを渡す
);
```

### MCP Server実装の注意点

#### Tool定義でのZodスキーマ

```javascript
// ✅ 正しい：z.object()を使用
server.registerTool(
  "tool_name",
  {
    inputSchema: z.object({
      param: z.string().describe("Parameter description"),
    }),
  },
  handler,
);

// ❌ 間違い：プレーンオブジェクト
server.registerTool(
  "tool_name",
  {
    inputSchema: {
      param: z.string(), // これはZodオブジェクトではない
    },
  },
  handler,
);
```

## Simplified to Lite Version (v0.0.1) - 2024-12-26

### Major Simplification

The project has been significantly simplified from its original implementation to create a lightweight, maintainable version.

### Removed Features (38+ files deleted)

#### Phase 1: Unnecessary Features

- `workspace-manager.ts` - Workspace management
- `shared-session-manager.ts` - Shared session functionality
- `diagnostics.ts` - Diagnostic tools
- `prompt-registry.ts` - Prompt management (re-added in Phase 6)
- `npx-cache.ts` - NPX caching
- `protocol-negotiator.ts` - Protocol negotiation
- `protocol/` directory - Complex protocol handling
- `crypto.ts` - Encryption utilities
- `health.ts` - Health check system

#### Phase 2: Storage Consolidation

- `cli-registry-storage.ts`
- `registry-storage-factory.ts`
- `file-registry-storage.ts`
  → Consolidated into `unified-file-storage.ts`

#### Phase 3: Runtime Abstraction Removal

- `runtime/runtime-factory.ts`
- `runtime/runtime-factory-functional.ts`
- `runtime/types.ts`
- `runtime/cloudflare-workers.ts`
- `runtime/node.ts`
- `runtime/index.ts`
  → Replaced with simple `node-utils.ts`

#### Phase 4: Client Components Removal

- `client/hatago-client.ts`
- `client/index.ts`
- `config/loader-with-result.ts`
- `core/protocol-negotiator-simple.ts`
- `core/protocol/` directory
- `transport/factory.ts`
- `utils/crypto.ts` and related tests

#### Phase 5-6: Core Module Refactoring

- Extracted resource management to `mcp-hub-resources.ts`
- Extracted tool management to `mcp-hub-tools.ts`
- Extracted prompts management to `mcp-hub-prompts.ts`
- Simplified `mcp-hub.ts` to ~500 lines (from ~1000+ lines)
- Added `remote-mcp-connection.ts` for connection management
- Re-added `prompt-registry.ts` with simplified implementation

### Current Architecture

- **Platform Abstraction**: Runtime-agnostic design via platform interfaces
- **Multi-Runtime Support**: Node.js, Cloudflare Workers, Deno, Bun
- **Simple Storage**: 2 types (File/Memory)
- **Basic Config**: Direct config loading without generation
- **Minimal Dependencies**: Reduced external library usage

### Key Features Retained

- **Core MCP Hub**: Tool/Resource/Prompt management
- **Multi-Server**: NPX, Remote, and Local server support
- **Multi-Transport**: STDIO, HTTP, SSE support
- **Session Management**: Independent sessions for multiple AI clients
- **Error Handling**: Robust error recovery
- **Basic Logging**: Simple debug logging
- **Tool Collision Avoidance**: Namespace prefixing for tools

## Package Architecture

### Package Roles

- **@hatago/cli**: Entry point for users, provides CLI commands
- **@hatago/server**: Core MCP hub server implementation with API
- **@hatago/core**: Shared types and interfaces
- **@hatago/runtime**: Platform abstraction layer
- **@hatago/transport**: Transport protocol implementations

### Integration with Claude Code

Claude Code uses `npx @hatago/cli serve` as the entry point to start the MCP server in STDIO mode. The CLI package delegates to the server package's API for actual implementation.

## Working with this Codebase

### Development Workflow

1. Always run code quality checks after changes: `pnpm format && pnpm lint && pnpm check`
2. Verify build succeeds: `pnpm -r build`
3. Run tests to ensure no regressions: `pnpm test`
4. Use development server for rapid iteration: `cd packages/server && pnpm dev`
5. Test CLI commands: `npx @hatago/cli [command]`

### Architecture Guidelines

1. **Platform Abstraction Layer**: All runtime-specific code through platform interfaces
2. **Runtime Detection**: Automatic detection and adaptation to runtime environment
3. **Minimal Layers**: Core functionality with clean separation of concerns
4. **Error Handling**: Simple error handling with recovery
5. **Dependency Injection**: Platform capabilities injected into core components

### Code Standards

1. Follow Hono patterns for HTTP routing
2. Maintain MCP specification compliance for tool names (snake_case)
3. Use simple error handling patterns
4. Direct Node.js API usage
5. Minimal external dependencies

### Testing Strategy

1. Basic unit tests for core functionality
2. Test main transport types (stdio, http, sse)
3. Test server management (NPX, Remote, Local)
4. Test session management
5. Test error recovery

### Performance Considerations

1. Keep implementation simple and direct
2. Avoid unnecessary abstractions
3. Implement proper resource cleanup
4. Minimize memory footprint
5. Fast startup and response times
