# Hatago MCP Hub Architecture

## Overview

Hatago MCP Hub is a lightweight, modular hub server that manages multiple MCP (Model Context Protocol) servers. The architecture has been significantly simplified from earlier versions to focus on essential functionality while maintaining extensibility.

## System Architecture

```
┌─────────────────────────────────────────────────────────┐
│                    AI Clients                            │
│    (Claude Code, Codex CLI, Cursor, Windsurf, etc.)     │
└────────────────────┬────────────────────────────────────┘
                     │ MCP Protocol
┌────────────────────▼────────────────────────────────────┐
│                  Hatago MCP Hub                         │
│                                                          │
│  ┌──────────────────────────────────────────────────┐  │
│  │                Core Layer                        │  │
│  │                                                   │  │
│  │  ┌──────────────┐  ┌──────────────────────┐    │  │
│  │  │     Hub      │  │  Session Manager      │    │  │
│  │  └──────────────┘  └──────────────────────┘    │  │
│  │  ┌──────────────┐  ┌──────────────────────┐    │  │
│  │  │Tool Registry │  │Resource Registry      │    │  │
│  │  └──────────────┘  └──────────────────────┘    │  │
│  │  ┌──────────────┐  ┌──────────────────────┐    │  │
│  │  │Prompt Registry│ │Server Registry        │    │  │
│  │  └──────────────┘  └──────────────────────┘    │  │
│  └──────────────────────────────────────────────────┘  │
│                                                          │
│  ┌──────────────────────────────────────────────────┐  │
│  │            Transport Layer                       │  │
│  │                                                   │  │
│  │  ┌──────┐ ┌──────┐ ┌─────┐ ┌──────────┐       │  │
│  │  │STDIO │ │HTTP  │ │SSE  │ │WebSocket │       │  │
│  │  └──────┘ └──────┘ └─────┘ └──────────┘       │  │
│  └──────────────────────────────────────────────────┘  │
└────────────────────┬────────────────────────────────────┘
                     │
┌────────────────────▼────────────────────────────────────┐
│                   MCP Servers                           │
│                                                          │
│ ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐   │
│ │Local     │ │NPX       │ │Remote    │ │Remote    │   │
│ │(stdio)   │ │(stdio)   │ │(HTTP)    │ │(SSE)     │   │
│ └──────────┘ └──────────┘ └──────────┘ └──────────┘   │
└──────────────────────────────────────────────────────────┘
```

## Package Structure

The project follows a monorepo structure with focused, single-responsibility packages:

```
hatago-mcp-hub/
├── packages/
│   ├── mcp-hub/        # Main npm package (user-facing)
│   ├── server/         # Server implementation
│   ├── hub/            # Hub core functionality
│   ├── core/           # Shared types and interfaces
│   ├── runtime/        # Runtime components
│   ├── transport/      # Transport implementations
│   └── cli/            # CLI tools (development)
├── schemas/            # JSON Schema definitions
├── examples/           # Usage examples
└── docs/              # Documentation
```

### Package Dependencies

```
@himorishige/hatago-core (pure type definitions)
     ↑
@himorishige/hatago-runtime (session, registry management)
     ↑
@himorishige/hatago-transport (communication layer)
     ↑
@himorishige/hatago-hub (hub core implementation)
     ↑
@himorishige/hatago-server (server with CLI)
     ↑
@himorishige/hatago-mcp-hub (main package)
```

## Core Components

### Hub (`packages/hub/src/hub.ts`)

The central coordinator for all MCP operations. Simplified to ~500 lines from 1000+ lines.

**Key Responsibilities:**

- Server lifecycle management
- Request routing to appropriate servers
- Tool/Resource/Prompt aggregation
- Session management coordination
- Notification forwarding

**Key Features:**

- Tool name collision avoidance via prefixing
- Dynamic tool list updates
- Progress notification forwarding
- Hot reload support

### Refactor Overview (2025-09-07)

To keep the hub thin, several responsibilities were extracted into focused modules and a minimal interface was introduced:

- Minimal interface `IHub` (exported from `@himorishige/hatago-hub`): start/stop, event subscription, notification hook, and JSON‑RPC entry. External packages (server/test-utils) depend on this instead of the concrete class.
- Extracted modules (hub remains an orchestrator):
  - `src/rpc/handlers.ts` – JSON‑RPC methods (initialize, tools, resources, prompts, ping)
  - `src/http/handler.ts` – HTTP request handler (POST/DELETE)
  - `src/config/reload.ts` & `src/config/watch.ts` – Config reload + file watcher
- Removed internal complexity from the base hub:
  - Sampling bridge, startup tools/list wait, simple SSE GET fallback, base-hub notifications

Result: a simpler hub surface, easier testing, and clearer integration boundaries for servers and tools.

### Server Registry (`packages/runtime/src/server-registry.ts`)

Manages the lifecycle of different server types.

**Supported Server Types:**

- **Local Servers**: Direct command execution
- **NPX Servers**: Dynamic npm package execution
- **Remote HTTP Servers**: HTTP-based MCP endpoints
- **Remote SSE Servers**: Server-Sent Events endpoints

### Session Manager (`packages/runtime/src/session-manager.ts`)

Provides session isolation for multiple concurrent AI clients.

**Features:**

- Per-session server instances
- Session state persistence
- Automatic cleanup on disconnect

### Registry Components

#### Tool Registry (`packages/runtime/src/tool-registry.ts`)

- Manages tool definitions
- Handles namespace prefixing for collision avoidance
- Supports dynamic tool updates

#### Resource Registry (`packages/runtime/src/resource-registry.ts`)

- Resource discovery and management
- URI-based resource access

#### Prompt Registry (`packages/runtime/src/prompt-registry.ts`)

- Prompt template storage
- Dynamic prompt generation

## Transport Layer

### Supported Transports

1. **STDIO** (`packages/transport/src/stdio/`)
   - Default for Claude Code integration
   - Newline-delimited JSON (MCP standard)
   - Bidirectional communication

2. **HTTP** (`packages/transport/src/http/`)
   - StreamableHTTP for Claude Code
   - RESTful endpoints for debugging
   - Session management via headers

3. **SSE** (`packages/transport/src/sse/`)
   - Server-Sent Events for streaming
   - Real-time notifications
   - Progress updates

4. **WebSocket** (`packages/transport/src/websocket/`)
   - Full-duplex communication
   - Low-latency operations
   - Real-time bidirectional messaging

## Configuration System

### Configuration Schema

```typescript
{
  "$schema": "https://raw.githubusercontent.com/himorishige/hatago-mcp-hub/main/schemas/config.schema.json",
  "version": 1,
  "logLevel": "info",
  "mcpServers": {
    "[serverId]": {
      // Local/NPX server configuration
      "command": "string",
      "args": ["string"],
      "env": { "KEY": "value" },
      "cwd": "string",

      // Remote server configuration
      "url": "string",
      "type": "http" | "sse",
      "headers": { "KEY": "value" },

      // Common options
      "disabled": false
    }
  }
}
```

### Environment Variable Expansion

Claude Code compatible syntax:

- `${VAR}` - Required environment variable
- `${VAR:-default}` - With default fallback

### Tag-based Filtering

- Servers can be grouped with `tags` (string array) in the configuration.
- The CLI option `--tags a,b` starts servers that match any of the given tags (OR logic).
- Japanese tags are supported.

### Configuration Inheritance

- Use `"extends": "path/to/base.config.json"` to inherit and override configuration fields.
- Child values override parent values; arrays are replaced unless explicitly merged by the consumer.

## Key Features

### Hot Reload & Configuration Watching

- File system watching with 1-second debounce
- Graceful server reconnection
- Session preservation during reload
- `notifications/tools/list_changed` notification

### Progress Notification Forwarding

- Transparent forwarding from child servers
- `notifications/progress` pass-through
- Works with all server types

### Internal Resource

- `hatago://servers` — JSON snapshot of connected servers

## Observability

- Metrics (HTTP mode): Set `HATAGO_METRICS=1` to enable a lightweight in-memory metrics endpoint at `/metrics`.
- Logging: Set `HATAGO_LOG=json` to enable JSON logs (respects `HATAGO_LOG_LEVEL`).

## Data Flow

### Request Processing Flow

```
1. Client Request → Transport Layer
2. Transport → Hub (request parsing)
3. Hub → Session Manager (session validation)
4. Hub → Tool/Resource/Prompt Registry (lookup)
5. Hub → Server Registry (server routing)
6. Server Registry → Target MCP Server
7. MCP Server Response → Hub
8. Hub → Transport Layer
9. Transport → Client Response
```

### Notification Flow

```
1. Child Server Notification → Hub
2. Hub → Session Manager (session lookup)
3. Hub → Transport Layer (forwarding)
4. Transport → Client (notification delivery)
```

## Platform Support

### Multi-Runtime Architecture

The platform abstraction layer enables multiple JavaScript runtimes:

- **Node.js** (Full Support)
  - All server types (Local, NPX, Remote)
  - File system operations
  - Process spawning
  - Full transport support

- **Cloudflare Workers** (Remote Only)
  - Remote HTTP/SSE servers only
  - KV storage for persistence
  - Edge deployment ready

- **Bun** (Work in Progress)
  - Currently uses Node.js compatibility layer
  - Native support planned

- **Deno** (Work in Progress)
  - Currently uses Node.js compatibility layer
  - Native support planned

### Platform Abstraction (`packages/runtime/src/platform/`)

```typescript
interface Platform {
  fs: FileSystem;
  process: ProcessManager;
  network: NetworkClient;
  storage: StorageProvider;
  crypto: CryptoProvider;
}
```

## Security Considerations

### Process Isolation

- Each server runs in isolated process
- No shared memory between servers
- Controlled IPC via MCP protocol

### Session Security

- Session-specific server instances
- No cross-session data leakage
- Automatic session cleanup

### Configuration Security

- Environment variable validation
- Path traversal prevention
- Secure defaults

## Performance Optimizations

### Resource Management

- Lazy server initialization
- Connection pooling for remote servers
- Automatic cleanup of unused resources

### Caching Policy

- No persistent caching by default to preserve a thin, transparent design.
- Minimal, ephemeral in-process data may be used where it does not alter semantics.

### Request Optimization

- Parallel server queries
- Response streaming support

### MCP Compliance Notes

- STDIO transport uses newline-delimited JSON (no `Content-Length` framing).
- Notifications must not include `id` (JSON-RPC 2.0).
- Tool definitions must provide Zod-based schemas via the MCP SDK.

## Error Handling

### Error Recovery

- Automatic retry with exponential backoff
- Graceful degradation
- Circuit breaker for failing servers

### Error Format

- JSON-RPC 2.0 compliant errors
- Detailed error messages
- Stack traces in debug mode

## Development Guidelines

### Code Style

- TypeScript with strict mode
- ESM modules only
- Functional programming patterns where appropriate
- Minimal external dependencies

### Testing Strategy

- Unit tests with Vitest
- Integration tests for transport layers
- E2E tests for full flow validation

### Build System

- tsdown for fast builds
- ESLint + Prettier for linting and formatting
- pnpm for package management

## Extension Points

### Adding New Server Types

1. Implement `MCPServer` interface
2. Register in `ServerRegistry`
3. Add configuration schema
4. Update documentation

### Custom Transports

1. Implement transport interface
2. Add to transport factory
3. Handle protocol negotiation
4. Update router configuration

### Custom Tools

1. Define tool schema with Zod
2. Implement tool handler
3. Register with hub
4. Add tests

## Version History

### v0.0.2 (Current)

- **Tag-based filtering**: Filter servers by tags (OR logic)
- **Multi-language support**: Japanese tags supported
- **CLI enhancement**: Added --tags option
- **Backward compatibility**: Tags field is optional

### v0.0.1

- Simplified architecture (38+ files removed)
- Core functionality focus
- Lightweight implementation (~500 lines hub)
- Full MCP compliance
- Multi-transport support
- Hot reload capability
- Progress notifications
- Internal management tools

## Future Roadmap

### Short Term

- Native Bun support
- Native Deno support
- Enhanced error recovery
- Performance monitoring

### Long Term

- WebAssembly support
- Browser runtime support
- Distributed hub clustering
- Advanced caching strategies

## References

- [MCP Specification](https://modelcontextprotocol.io/)
- [Hono Framework](https://hono.dev/)
- [Repository](https://github.com/himorishige/hatago-mcp-hub)
