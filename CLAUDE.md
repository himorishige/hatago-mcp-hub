# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Hatago MCP Hub (Lite) is an ultra-lightweight MCP (Model Context Protocol) Hub server built on top of Hono. It provides unified management for multiple MCP servers with tool name collision avoidance and session management. This is a simplified version with minimal dependencies and direct Node.js implementations.

## Tech Stack

- **Runtime**: Node.js 20+
- **Language**: TypeScript with ESM modules
- **Web Framework**: Hono
- **MCP SDK**: @modelcontextprotocol/sdk (requires Zod schemas for tools)
- **Build Tool**: tsdown
- **Test Framework**: Vitest
- **Linter/Formatter**: Biome
- **Package Manager**: pnpm

## Project Structure (Lite Version)

```
/
├── server/              # MCP Hub Server
│   ├── src/
│   │   ├── index.ts    # Server entry point
│   │   ├── cli/        # CLI commands implementation
│   │   │   ├── index.ts # CLI entry point (hatago command)
│   │   │   └── commands/ # Individual CLI commands
│   │   ├── core/       # Core functionality (simplified)
│   │   │   ├── mcp-hub.ts            # Main hub (42KB)
│   │   │   ├── session-manager.ts    # Session management
│   │   │   ├── tool-registry.ts      # Tool registry
│   │   │   ├── resource-registry.ts  # Resource registry
│   │   │   ├── config-manager.ts     # Simple config management
│   │   │   └── types.ts              # Core types
│   │   ├── servers/    # MCP server implementations
│   │   │   ├── server-registry.ts    # Server management (31KB)
│   │   │   ├── npx-mcp-server.ts     # NPX server support
│   │   │   ├── remote-mcp-server.ts  # Remote server (32KB)
│   │   │   └── custom-stdio-transport.ts # STDIO transport
│   │   ├── config/     # Configuration management
│   │   ├── storage/    # Data storage (2 types only)
│   │   │   ├── unified-file-storage.ts  # File storage
│   │   │   └── memory-registry-storage.ts # Memory storage
│   │   ├── transport/  # Communication layer
│   │   └── utils/      # Utilities
│   │       ├── node-utils.ts  # Node.js utilities (NEW)
│   │       ├── logger.ts      # Logging
│   │       ├── errors.ts      # Error handling
│   │       ├── mutex.ts       # Mutex implementation
│   │       └── zod-like.ts    # Schema conversion (NEW)
│   ├── dist/           # Build output
│   ├── package.json
│   └── tsconfig.json
└── docs/               # Documentation

Total: 53 TypeScript files (excluding tests)
```

## Essential Development Commands

All commands should be run in the `server/` directory:

```bash
# Development
pnpm dev          # Start dev server with watch mode
pnpm build        # Build to dist/
pnpm start        # Start production server
pnpm cli          # Run CLI in development mode

# Code Quality - Run these after making changes
pnpm format       # Format code
pnpm lint         # Lint with auto-fix
pnpm check        # Format + Lint + Type check

# Testing
pnpm test         # Run tests
pnpm coverage     # Run tests with coverage
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

## Simplified to Lite Version (v0.3.0-lite) - 2024-12-26

### Major Simplification

The project has been significantly simplified from its original implementation to create a lightweight, maintainable version.

### Removed Features (27 files deleted)

#### Phase 1: Unnecessary Features

- `workspace-manager.ts` - Workspace management
- `shared-session-manager.ts` - Shared session functionality
- `diagnostics.ts` - Diagnostic tools
- `prompt-registry.ts` - Prompt management
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

### Current Architecture

- **Direct Implementation**: No runtime abstraction layer
- **Simple Storage**: 2 types (File/Memory) instead of 3
- **Basic Config**: Direct config loading without generation
- **Node.js Native**: Direct use of Node.js APIs
- **Minimal Dependencies**: Reduced external library usage

### Key Features Retained (Lite Version)

- **Core MCP Hub**: Tool/Resource/Prompt management
- **Multi-Server**: NPX, Remote, and Local server support
- **Multi-Transport**: STDIO, HTTP, SSE support
- **Session Management**: Independent sessions for multiple AI clients
- **Error Handling**: Robust error recovery
- **Basic Logging**: Simple debug logging
- **Tool Collision Avoidance**: Namespace prefixing for tools

## Working with this Codebase

### Development Workflow

1. Always run code quality checks after changes: `pnpm format && pnpm lint && pnpm check`
2. Verify build succeeds: `pnpm build`
3. Run tests to ensure no regressions: `pnpm test`
4. Use development server for rapid iteration: `hatago dev`
5. Generate types when adding new MCP servers: `hatago generate types`

### Architecture Guidelines (Lite Version)

1. **Simple Direct Implementation**: No complex abstractions
2. **Node.js Native**: Use built-in Node.js APIs directly
3. **Minimal Layers**: Core functionality only
4. **Error Handling**: Simple error handling with recovery
5. **Direct File Access**: No runtime abstraction for file operations

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
