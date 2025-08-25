# Hatago Architecture Guide

This guide explains the internal architecture of Hatago MCP Hub, based on the FastMCP 2.0 design principles with a focus on proxy architecture and capability graph management.

## Overview

Hatago is built around a **Proxy Architecture** that provides unified management of multiple MCP servers through a **Capability Graph** concept. Instead of treating servers as isolated units, Hatago views them as nodes in a graph where capabilities can be composed, proxied, and managed transparently.

## Core Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                   Client Layer                              │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────────────┐  │
│  │   Claude    │  │  HTTP API   │  │   Other MCP         │  │
│  │   Client    │  │   Client    │  │   Clients           │  │
│  └─────────────┘  └─────────────┘  └─────────────────────┘  │
└─────────────┬───────────┬───────────────────┬───────────────┘
              │           │                   │
┌─────────────▼───────────▼───────────────────▼───────────────┐
│                    Transport Layer                          │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────────────┐  │
│  │    STDIO    │  │  HTTP/SSE   │  │     WebSocket       │  │
│  │  Transport  │  │  Transport  │  │     Transport       │  │
│  └─────────────┘  └─────────────┘  └─────────────────────┘  │
└─────────────┬───────────┬───────────────────┬───────────────┘
              │           │                   │
┌─────────────▼───────────▼───────────────────▼───────────────┐
│                      Core Hub                               │
│  ┌─────────────────────────────────────────────────────────┐ │
│  │              Session Manager                            │ │
│  │  ┌─────────────────────────────────────────────────────┐│ │
│  │  │            Capability Graph                         ││ │
│  │  └─────────────────────────────────────────────────────┘│ │
│  └─────────────────────────────────────────────────────────┘ │
└─────────────┬───────────┬───────────────────┬───────────────┘
              │           │                   │
┌─────────────▼───────────▼───────────────────▼───────────────┐
│                    Proxy Layer                              │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────────────┐  │
│  │   Proxy     │  │   Proxy     │  │     Proxy           │  │
│  │   Tool      │  │ Resource    │  │    Prompt           │  │
│  │  Manager    │  │  Manager    │  │   Manager           │  │
│  └─────────────┘  └─────────────┘  └─────────────────────┘  │
└─────────────┬───────────┬───────────────────┬───────────────┘
              │           │                   │
┌─────────────▼───────────▼───────────────────▼───────────────┐
│                   Server Nodes                              │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────────────┐  │
│  │    NPX      │  │   Remote    │  │    Decorator        │  │
│  │   Server    │  │   Server    │  │     Server          │  │
│  │    Node     │  │    Node     │  │      Node           │  │
│  └─────────────┘  └─────────────┘  └─────────────────────┘  │
└─────────────┬───────────┬───────────────────┬───────────────┘
              │           │                   │
┌─────────────▼───────────▼───────────────────▼───────────────┐
│                  Cross-Cutting Concerns                     │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────────────┐  │
│  │Observability│  │  Security   │  │    Developer        │  │
│  │ • Tracing   │  │ • Auth      │  │     Tools           │  │
│  │ • Metrics   │  │ • Rate Limit│  │ • Type Gen          │  │
│  │ • Health    │  │ • Circuit   │  │ • Decorators        │  │
│  │ • Logging   │  │   Breaker   │  │ • Testing           │  │
│  └─────────────┘  └─────────────┘  └─────────────────────┘  │
└─────────────────────────────────────────────────────────────┘
```

## Key Architectural Concepts

### 1. Capability Graph

The **Capability Graph** is the central organizing principle of Hatago. Instead of managing servers as isolated entities, it treats them as nodes in a graph where:

- **Nodes** represent MCP servers with their capabilities (tools, resources, prompts)
- **Edges** represent relationships and dependencies between servers
- **Composition** allows combining capabilities from multiple servers
- **Collision Detection** automatically handles tool name conflicts with prefixes

#### Benefits:
- **Unified View**: Single interface to access capabilities from multiple servers
- **Intelligent Routing**: Requests are routed to the appropriate server based on capability
- **Dependency Management**: Servers can depend on other servers' capabilities
- **Hot Swapping**: Servers can be added/removed without affecting others

### 2. Proxy Pattern

The **Proxy Layer** provides transparent access to server capabilities through manager classes:

```typescript
interface ProxyToolManager {
  // Provides unified access to all tools across servers
  listTools(sessionId?: string): Promise<Tool[]>
  callTool(name: string, args: any, sessionId?: string): Promise<CallToolResult>
}

interface ProxyResourceManager {
  // Provides unified access to all resources across servers
  listResources(sessionId?: string): Promise<Resource[]>
  readResource(uri: string, sessionId?: string): Promise<ReadResourceResult>
}
```

#### Key Features:
- **Transparent Proxying**: Clients see a single unified interface
- **Session Isolation**: Each client session has isolated state
- **Error Handling**: Circuit breakers prevent cascade failures
- **Load Distribution**: Requests are distributed across available servers

### 3. Transport Abstraction

All communication is abstracted through the `Transport` interface:

```typescript
interface Transport {
  connect(): Promise<void>
  disconnect(): Promise<void>
  send<T>(method: string, params?: any): Promise<T>
  isConnected(): boolean
}
```

Implementations:
- **STDIOTransport**: For local process communication
- **HTTPTransport**: For HTTP-based MCP servers
- **SSETransport**: For Server-Sent Events
- **WebSocketTransport**: For WebSocket connections
- **DecoratorTransport**: For in-process decorator-based servers

## Layer Details

### Core Layer (`src/core/`)

**Purpose**: Fundamental components for MCP Hub functionality

- **HatagoHub**: Main orchestration class
- **ServerRegistry**: Manages server instances and lifecycle
- **SessionManager**: Handles client session isolation
- **ConfigManager**: Hot-reloadable configuration management

Key patterns:
- Event-driven architecture for loose coupling
- Dependency injection for testability
- Immutable configuration objects

### Proxy Layer (`src/proxy/`)

**Purpose**: Transparent proxying and capability composition

- **ProxyToolManager**: Aggregates and routes tool calls
- **ProxyResourceManager**: Aggregates and routes resource access
- **ProxyPromptManager**: Aggregates and routes prompt generation
- **CapabilityGraph**: Manages server relationships and dependencies

Key patterns:
- Proxy pattern for transparent access
- Strategy pattern for routing decisions
- Observer pattern for capability changes

### Observability Layer (`src/observability/`)

**Purpose**: Monitoring, tracing, and operational visibility

- **DistributedTracing**: AsyncLocalStorage-based trace context
- **MetricsCollector**: Prometheus-compatible metrics
- **HealthMonitor**: Kubernetes-compatible health checks
- **StructuredLogger**: JSON logging with sanitization

Key patterns:
- Aspect-Oriented Programming for cross-cutting concerns
- Context propagation through AsyncLocalStorage
- Middleware pattern for HTTP instrumentation

### Security Layer (`src/security/`)

**Purpose**: Authentication, authorization, and protection

- **AuthenticationManager**: JWT-based authentication
- **AuthorizationManager**: Role-based access control
- **RateLimiter**: Sliding window rate limiting
- **CircuitBreaker**: Failure isolation and recovery

Key patterns:
- Middleware pattern for HTTP security
- Strategy pattern for different auth methods
- State machine pattern for circuit breaker

## Data Flow

### Tool Call Flow

```
1. Client Request
   ↓
2. Transport Layer (STDIO/HTTP/SSE/WS)
   ↓
3. Session Manager (isolate by session-id)
   ↓
4. Security Layer (auth, rate limit)
   ↓
5. Observability Layer (trace, metrics)
   ↓
6. Proxy Tool Manager (route to server)
   ↓
7. Server Node (execute tool)
   ↓
8. Circuit Breaker (handle failures)
   ↓
9. Response Flow (reverse of above)
```

### Configuration Hot Reload

```
1. Configuration Change Detected
   ↓
2. Config Manager validates new config
   ↓
3. Create new Generation with new config
   ↓
4. Update Server Registry with new servers
   ↓
5. Update Capability Graph with new capabilities
   ↓
6. Emit 'servers-changed' event
   ↓
7. Proxy Managers rebuild routing tables
   ↓
8. Old generation marked for cleanup
```

## Design Principles

### 1. **Layered Architecture**
- Clear separation of concerns across layers
- Each layer has a single responsibility
- Dependencies flow downward only

### 2. **Composition over Inheritance**
- Prefer composition for building complex functionality
- Use dependency injection for flexibility
- Avoid deep inheritance hierarchies

### 3. **Event-Driven Communication**
- Use events for loose coupling between components
- Enable reactive programming patterns
- Support hot-pluggable components

### 4. **Immutable Data Structures**
- Configuration objects are immutable
- State changes create new objects
- Easier reasoning about concurrent operations

### 5. **Fail-Safe Defaults**
- System works with minimal configuration
- Graceful degradation when components fail
- Circuit breakers prevent cascade failures

### 6. **Observability First**
- All operations are traceable
- Metrics are collected by default
- Structured logging for analysis

## Extension Points

## Server Types

Hatago supports multiple server types, each with its own execution model:

### Local Servers
Local servers run arbitrary commands (node, python, deno, etc.) as child processes:
- **Execution**: Spawned as child processes with STDIO transport
- **Configuration**: Support for command, args, cwd, and environment variables
- **Implementation**: Shares execution logic with NPX servers via `NpxMcpServer` class
- **Use Case**: Running custom MCP servers written in any language

### NPX Servers
NPX servers run npm packages directly:
- **Execution**: Uses `npx` to run packages without global installation
- **Caching**: Leverages npm cache for faster startup
- **Configuration**: Package name, version, and arguments
- **Use Case**: Running published MCP server packages

### Remote Servers
Remote servers connect to HTTP/SSE/WebSocket endpoints:
- **Execution**: No local process, connects over network
- **Transport**: HTTP, SSE, or WebSocket protocols
- **Configuration**: URL, authentication, and health check settings
- **Use Case**: Connecting to cloud-hosted MCP services

### Decorator Servers (Experimental)
In-process servers defined using TypeScript decorators:
- **Execution**: Runs within the Hatago process
- **Performance**: No IPC overhead
- **Configuration**: Class-based with decorator metadata
- **Use Case**: Quick prototyping and embedded servers

### Adding New Server Types

1. Create a new `ServerNode` implementation
2. Implement the required `Transport` interface
3. Register with `ServerRegistry`
4. Add configuration schema

### Adding New Transports

1. Implement the `Transport` interface
2. Handle connection lifecycle properly
3. Add error handling and reconnection logic
4. Integrate with observability layer

### Adding New Security Features

1. Create middleware for HTTP layer
2. Implement strategy for different auth methods
3. Integrate with existing AuthenticationManager
4. Add configuration options

### Adding New Observability Features

1. Extend existing collectors/monitors
2. Use AsyncLocalStorage for context propagation
3. Follow structured logging patterns
4. Export metrics in standard formats

## Performance Considerations

### Memory Management
- Connection pooling for HTTP clients
- Proper cleanup of resources
- Avoiding memory leaks in long-running sessions

### Latency Optimization
- Minimize proxy overhead
- Use connection pooling
- Implement request caching where appropriate

### Scalability
- Stateless design for horizontal scaling
- Circuit breakers prevent resource exhaustion
- Rate limiting protects against abuse

### Monitoring
- Track key performance metrics
- Use distributed tracing for bottleneck identification
- Health checks for operational status

This architecture provides a solid foundation for building a scalable, reliable, and maintainable MCP Hub while maintaining simplicity and developer-friendliness.