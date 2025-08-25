# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Hatago MCP Hub is a lightweight MCP (Model Context Protocol) Hub server built on top of Hono and hono/mcp. It provides unified management for multiple MCP servers with tool name collision avoidance and session management.

## Tech Stack

- **Runtime**: Node.js 20+
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
├── server/              # MCP Hub Server
│   ├── src/
│   │   ├── index.ts    # Server entry point
│   │   ├── cli/        # CLI commands implementation
│   │   │   ├── index.ts # CLI entry point (hatago command)
│   │   │   └── commands/ # Individual CLI commands
│   │   ├── core/       # Core functionality (Hub, Registry, etc.)
│   │   ├── proxy/      # Proxy layer for server management
│   │   ├── observability/ # Tracing, metrics, health monitoring
│   │   ├── security/   # Authentication, authorization, rate limiting
│   │   ├── codegen/    # TypeScript type generation
│   │   ├── integrations/ # OpenAPI integration
│   │   ├── decorators/ # Experimental decorator API
│   │   ├── testing/    # Test utilities
│   │   ├── legacy/     # Legacy adapter for NPX/Remote servers
│   │   ├── servers/    # NPX/Remote MCP servers (legacy)
│   │   ├── config/     # Configuration management
│   │   ├── storage/    # Data storage
│   │   ├── transport/  # Communication layer
│   │   ├── runtime/    # Runtime abstraction
│   │   └── utils/      # Utilities
│   ├── dist/           # Build output
│   ├── docs/           # Detailed documentation
│   ├── package.json
│   ├── tsconfig.json
│   ├── biome.jsonc
│   └── vitest.config.ts
└── docs/               # High-level documentation
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

## Development Phases

### Completed (v0.0.2) - 2024-12-26

- **Local Server Support**: Added support for running MCP servers using any local command (node, python, deno, etc.)
  - New `local` server type with full STDIO transport
  - Custom working directory support for relative paths
  - Unified execution path with NPX servers
  - Fixed session management for HTTP mode
  - Fixed Zod schema handling for tool definitions

### Completed (v0.1.0) - 2024-12-24

- **Phase 0**: ✅ Protocol foundation, proxy core, composition layer
  - Tool collision avoidance, session management, config hot-swap
  - WebSocket transport, unified client, capability graph architecture
  
- **Phase 1**: ✅ Observability, security, and reliability
  - Distributed tracing with AsyncLocalStorage context propagation
  - Prometheus-compatible metrics collection
  - Authentication/authorization with JWT
  - Rate limiting with sliding window algorithm
  - Circuit breaker with error severity classification
  - Health monitoring with K8s-compatible endpoints
  
- **Phase 2**: ✅ Developer experience and integration
  - TypeScript type generation from MCP introspection
  - Development tools (dev server, inspector, code generation)
  - OpenAPI ⇔ MCP bidirectional integration
  - Experimental decorator API for declarative server definition
  - Comprehensive test utilities (MockMCPServer, MCPTestClient)

### Future Roadmap (v0.2.0+)

- **Phase 3**: Performance optimization and enterprise features
  - Pipeline system for tool chaining
  - Distributed caching with TTL and invalidation
  - Worker pools for parallel execution
  - Multi-tenant support and audit logging

### Key Features Implemented

- **Proxy Architecture**: Unified server management with capability graph
- **Multi-transport**: STDIO, HTTP, SSE, WebSocket support
- **Security**: JWT auth, rate limiting, circuit breakers, log sanitization
- **Observability**: Distributed tracing, metrics, health checks, structured logging
- **Developer Tools**: Type generation, hot reload, OpenAPI integration, decorators
- **Testing**: Mock servers, test utilities, comprehensive test coverage
- **Legacy Support**: NPX/Remote server adapter for backward compatibility

## Working with this Codebase

### Development Workflow
1. Always run code quality checks after changes: `pnpm format && pnpm lint && pnpm check`
2. Verify build succeeds: `pnpm build`
3. Run tests to ensure no regressions: `pnpm test`
4. Use development server for rapid iteration: `hatago dev`
5. Generate types when adding new MCP servers: `hatago generate types`

### Architecture Guidelines
1. **Proxy Pattern**: Use ProxyToolManager/ProxyResourceManager for server integration
2. **Layer Separation**: Keep core, proxy, observability, and security layers distinct
3. **Transport Abstraction**: Use Transport interface for all communication
4. **Error Classification**: Use HatagoError with proper error codes and severity
5. **Capability Graph**: Maintain server relationships and dependency tracking

### Code Standards
1. Follow Hono patterns for HTTP routing and middleware
2. Maintain MCP specification compliance for tool names (snake_case) and protocols
3. Use AsyncLocalStorage for distributed tracing context
4. Implement proper circuit breaking and rate limiting
5. Sanitize logs to prevent sensitive data leakage

### Testing Strategy
1. Use MockMCPServer for unit tests
2. Test all transport types (stdio, http, sse, websocket)
3. Verify observability features (tracing, metrics, health checks)
4. Test security features (auth, rate limiting, circuit breakers)
5. Validate type generation and decorator functionality

### Performance Considerations
1. Keep the proxy layer lightweight - avoid heavy processing
2. Use circuit breakers to prevent cascade failures
3. Implement proper resource cleanup and connection pooling
4. Monitor memory usage and prevent leaks in long-running sessions
5. Optimize tracing overhead for high-throughput scenarios
