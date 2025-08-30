# Architecture Overview

## System Architecture

Hatago MCP Hub is a lightweight hub server that manages multiple MCP (Model Context Protocol) servers with a modular architecture designed for simplicity and extensibility.

```
┌─────────────────────────────────────────────────────────┐
│                    AI Clients                            │
│        (Claude Code, Cursor, VS Code, etc.)             │
└────────────────────┬────────────────────────────────────┘
                     │ MCP Protocol
┌────────────────────▼────────────────────────────────────┐
│                  Hatago MCP Hub                         │
│                                                          │
│  ┌──────────────────────────────────────────────────┐  │
│  │            Management Layer (v0.3.0)              │  │
│  │                                                   │  │
│  │  ┌──────────────┐  ┌──────────────────────┐    │  │
│  │  │State Machine │  │Activation Manager    │    │  │
│  │  └──────────────┘  └──────────────────────┘    │  │
│  │  ┌──────────────┐  ┌──────────────────────┐    │  │
│  │  │Idle Manager  │  │Metadata Store        │    │  │
│  │  └──────────────┘  └──────────────────────┘    │  │
│  │  ┌──────────────┐  ┌──────────────────────┐    │  │
│  │  │File Guard    │  │Audit Logger          │    │  │
│  │  └──────────────┘  └──────────────────────┘    │  │
│  └──────────────────────────────────────────────────┘  │
│                                                          │
│  ┌──────────────────────────────────────────────────┐  │
│  │                Core Layer                        │  │
│  │                                                   │  │
│  │  ┌──────────────┐  ┌──────────────────────┐    │  │
│  │  │Tool Registry │  │Resource Registry      │    │  │
│  │  └──────────────┘  └──────────────────────┘    │  │
│  │  ┌──────────────┐  ┌──────────────────────┐    │  │
│  │  │Prompt Registry│ │Session Manager        │    │  │
│  │  └──────────────┘  └──────────────────────┘    │  │
│  │  ┌──────────────┐  ┌──────────────────────┐    │  │
│  │  │Tool Invoker  │  │Router                │    │  │
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

## Component Architecture

### Core Components

#### HatagoHub (`hub.ts`)

The central hub that coordinates all MCP server connections and manages tool/resource/prompt routing.

**Responsibilities:**

- Server lifecycle management
- Request routing to appropriate servers
- Session management coordination
- Tool name collision resolution

#### EnhancedHatagoHub (`enhanced-hub.ts`)

Extended hub with management capabilities (v0.3.0+).

**Additional Features:**

- Automatic server activation/deactivation
- Configuration hot-reload
- Management MCP server integration
- Activity tracking and statistics

### Management Layer (v0.3.0)

#### State Machine (`state-machine.ts`)

Manages server lifecycle states with defined transitions.

**States:**

- `MANUAL` - Manual activation required
- `INACTIVE` - Server not running
- `ACTIVATING` - Starting up
- `ACTIVE` - Running and ready
- `IDLING` - Active but idle
- `STOPPING` - Shutting down
- `ERROR` - Error state
- `COOLDOWN` - Waiting before retry

**State Transitions:**

```
INACTIVE → ACTIVATING → ACTIVE → IDLING → STOPPING → INACTIVE
                ↓                             ↓
              ERROR → COOLDOWN → INACTIVE ←──┘
```

#### Activation Manager (`activation-manager.ts`)

Handles on-demand server activation with deduplication.

**Features:**

- Request deduplication for concurrent calls
- Activation policy enforcement
- Retry logic with exponential backoff
- Activation history tracking

#### Idle Manager (`idle-manager.ts`)

Monitors server activity and manages automatic shutdown.

**Features:**

- Reference counting for active operations
- Configurable idle timeouts
- Minimum linger time enforcement
- Activity-based state transitions

#### Metadata Store (`metadata-store.ts`)

Caches server capabilities for offline access.

**Cached Data:**

- Tool definitions
- Resource listings
- Prompt templates
- Server statistics
- Connection history

#### Security Components

**File Access Guard (`file-guard.ts`):**

- Restricts file operations to config file only
- Path traversal prevention
- Write operation validation

**Audit Logger (`audit-logger.ts`):**

- Logs all configuration changes
- Tracks activation/deactivation events
- Records tool invocations
- Maintains audit trail

### Core Layer

#### Registry Components

- **Tool Registry**: Manages tool definitions with namespace prefixing
- **Resource Registry**: Handles resource discovery and access
- **Prompt Registry**: Stores and retrieves prompt templates

#### Session Management

- **Session Manager**: Maintains per-client session isolation
- **Session Storage**: Persists session data across requests

#### Request Processing

- **Router**: Routes MCP requests to appropriate handlers
- **Tool Invoker**: Executes tool calls with timeout management

### Transport Layer

#### Supported Transports

1. **STDIO**: Direct process communication
2. **HTTP**: RESTful API endpoints
3. **SSE**: Server-Sent Events for streaming
4. **WebSocket**: Bidirectional real-time communication

### Server Types

#### Local Servers

- Spawned as child processes
- Communicate via STDIO
- Support all activation policies

#### NPX Servers

- Dynamically installed from npm
- Cached for performance
- Full lifecycle management

#### Remote Servers

- HTTP-based MCP servers
- SSE for streaming responses
- Transparent proxy mode

## Data Flow

### Tool Invocation Flow

```
1. Client Request → Hatago Hub
2. Hub → Session Manager (session validation)
3. Hub → Tool Registry (tool lookup)
4. Hub → Activation Manager (ensure server active)
5. Hub → Tool Invoker (execute call)
6. Tool Invoker → Target Server
7. Server Response → Hub
8. Hub → Idle Manager (track activity)
9. Hub → Client Response
```

### On-Demand Activation Flow

```
1. Tool Call Request
2. Check Server State
3. If INACTIVE:
   a. Check Activation Policy
   b. If allowed, queue activation
   c. Start server process
   d. Wait for initialization
4. Execute tool call
5. Track activity for idle management
```

## Configuration Management

### Configuration Schema

```typescript
{
  version: 1,
  logLevel: "debug" | "info" | "warn" | "error",
  notifications: {
    enabled: boolean,
    rateLimitSec: number,
    severity: string[]
  },
  mcpServers: {
    [serverId]: {
      type: "local" | "remote",
      command?: string,
      args?: string[],
      url?: string,
      env?: Record<string, string>,

      // Management features
      activationPolicy?: "always" | "onDemand" | "manual",
      disabled?: boolean,
      idlePolicy?: {
        idleTimeoutMs: number,
        minLingerMs: number,
        activityReset: "onCallStart" | "onCallEnd"
      },
      timeouts?: {
        connectMs: number,
        requestMs: number,
        keepAliveMs: number
      }
    }
  }
}
```

### Environment Variable Expansion

Supports Claude Code compatible syntax:

- `${VAR}` - Required variable
- `${VAR:-default}` - With default value

## Security Model

### File System Protection

- Config file access restricted to startup file
- No arbitrary file operations allowed
- Path traversal prevention

### Audit Trail

- All configuration changes logged
- User/system initiated events tracked
- Timestamped with metadata

### Session Isolation

- Independent sessions per client
- No cross-session data leakage
- Session-specific server instances

## Performance Considerations

### Resource Management

- Automatic cleanup of idle servers
- Connection pooling for remote servers
- Process lifecycle management

### Optimization Strategies

- Tool definition caching
- Metadata persistence
- Request deduplication
- Lazy server initialization

## Extension Points

### Adding New Server Types

1. Implement server interface
2. Register with server factory
3. Add configuration schema
4. Update activation manager

### Custom Management Tools

1. Extend HatagoManagementServer
2. Define tool schemas
3. Implement handlers
4. Register with hub

### Transport Extensions

1. Implement transport interface
2. Add to transport factory
3. Update router configuration
4. Handle protocol negotiation

## Error Handling

### Error Recovery Strategies

- Automatic retry with backoff
- State machine error transitions
- Graceful degradation
- Circuit breaker pattern

### Error Propagation

- JSON-RPC 2.0 error format
- Detailed error messages
- Stack traces in debug mode
- User-friendly error codes

## Monitoring and Observability

### Metrics Collection

- Tool invocation counts
- Response times
- Error rates
- Active sessions

### Health Checks

- Server connectivity
- Resource availability
- System resource usage
- Configuration validity

### Logging

- Structured logging with context
- Log levels per component
- Audit trail separation
- Performance logging

## Development Guidelines

### Code Organization

- Modular component design
- Clear separation of concerns
- Dependency injection
- Platform abstraction

### Testing Strategy

- Unit tests for components
- Integration tests for flows
- E2E tests for transports
- Performance benchmarks

### Documentation

- Inline code documentation
- API documentation
- Configuration examples
- Migration guides
