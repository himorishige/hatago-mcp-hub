# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.0.2] - 2024-12-26

### Added

- **Local Command Server Support**: Added support for running MCP servers using any local command (node, python, deno, etc.)
  - New `local` server type in configuration
  - Support for custom working directory (`cwd`) for relative path resolution
  - Full environment variable support for local servers
  - Unified execution path with NPX servers for code reuse

### Fixed

- **Session Management**: Fixed session ID handling to respect client-provided session IDs in HTTP mode
- **Tool Input Schemas**: Corrected Zod schema handling for tool definitions (Zod objects instead of JSON Schema)
- **Error Messages**: Fixed timeout error message formatting in CustomStdioTransport
- **Configuration Processing**: Fixed `cwd` field mapping through configuration converter

### Changed

- **Documentation**: Updated README and developer guide with local server examples and Zod schema requirements
- **Examples**: Updated test-mcp-server.js to use proper Zod schema format

## [0.1.0] - 2024-12-24

This is a major architectural overhaul of Hatago, transforming it from a simple MCP server aggregator to a comprehensive proxy-based MCP Hub inspired by FastMCP 2.0 design principles.

### 🏗️ **BREAKING CHANGES**

#### Architecture Complete Rebuild

- **Proxy Architecture**: Complete transition from direct server management to proxy-based architecture
- **Capability Graph**: Servers are now treated as nodes in a capability graph rather than isolated entities
- **Transport Abstraction**: All communication now flows through a unified Transport interface
- **New Configuration Format**: Enhanced configuration schema with new sections for observability, security, and development features

#### API Changes

- **New Export Paths**: Added new export paths for specialized modules (`/observability`, `/security`, `/proxy`, `/codegen`, `/integrations`, `/decorators`, `/testing`)
- **Enhanced CLI**: Significantly expanded CLI commands with new categories (development tools, system monitoring, type generation)
- **Modified Response Formats**: Some internal APIs now return enhanced response objects with additional metadata

### ✨ **Major New Features**

#### Phase 0: Protocol Foundation & Proxy Core

- **ProxyToolManager**: Unified tool aggregation and intelligent routing across all servers
- **ProxyResourceManager**: Centralized resource access with transparent server selection
- **ProxyPromptManager**: Coordinated prompt generation across multiple servers
- **Capability Graph**: Dynamic server relationship management and dependency tracking
- **WebSocket Transport**: New real-time bidirectional communication support
- **Hot Configuration Reload**: Zero-downtime configuration updates with generation management
- **Session Isolation**: Enhanced session management with complete state isolation

#### Phase 1: Observability, Security & Reliability

- **Distributed Tracing**: AsyncLocalStorage-based context propagation with trace correlation
- **Metrics Collection**: Prometheus-compatible metrics with histograms and custom metrics
- **Health Monitoring**: Kubernetes-compatible health checks (liveness/readiness/startup probes)
- **JWT Authentication**: Comprehensive authentication system with multiple algorithms support
- **Role-based Authorization**: Fine-grained RBAC with permission-based access control
- **Rate Limiting**: Sliding window rate limiting with customizable rules and per-user limits
- **Circuit Breaker**: Advanced failure isolation with error severity classification
- **Log Sanitization**: Automatic masking of sensitive data in structured JSON logs

#### Phase 2: Developer Experience & Integration

- **TypeScript Type Generation**: Automatic type generation from MCP server introspection
- **Development Server**: File watching development server with hot reload capabilities
- **Server Inspector**: Comprehensive MCP server capability analysis tool
- **OpenAPI Integration**: Bidirectional conversion between OpenAPI specs and MCP tools
- **Decorator API (Experimental)**: Declarative MCP server definition using TypeScript decorators
- **Testing Utilities**: Comprehensive test infrastructure with MockMCPServer and MCPTestClient
- **Code Generation CLI**: Advanced code generation tools for types and MCP tools

### 🚀 **New CLI Commands**

#### Development Tools

- `hatago dev <server>` - Start development server with hot reload
- `hatago inspect <target>` - Inspect MCP server capabilities and structure
- `hatago generate types <output>` - Generate TypeScript types from MCP servers
- `hatago generate mcp --from-openapi <spec>` - Generate MCP tools from OpenAPI specifications

#### System Monitoring

- `hatago health` - Display comprehensive health check status
- `hatago metrics` - Show system metrics and performance data
- `hatago logs --follow` - Follow structured logs with filtering
- `hatago trace <trace-id>` - Display detailed trace information

#### Enhanced Server Management

- Improved `hatago serve` with additional options and better error handling
- Enhanced `hatago status` with detailed system information
- New `hatago reload` for configuration hot-reloading

### 🔧 **Infrastructure Improvements**

#### New Dependencies

- `reflect-metadata` - Required for decorator API functionality
- `json-schema-to-typescript` - For automated TypeScript type generation
- Enhanced TypeScript configuration with decorator support

#### Enhanced Configuration

- **New Configuration Sections**:
  - `observability` - Tracing, metrics, health monitoring, logging
  - `security` - Authentication, authorization, rate limiting, circuit breakers
  - `proxy` - Circuit breaker settings, cache configuration
  - `development` - Hot reload, type generation, debugging options
- **Environment Variable Expansion**: Support for `${VARIABLE}` syntax in configuration
- **Configuration Validation**: Comprehensive schema validation with helpful error messages

### 🛠️ **Developer Experience**

#### New Export Modules

```typescript
// New specialized imports
import { ProxyToolManager } from "@himorishige/hatago/proxy";
import {
  DistributedTracing,
  MetricsCollector,
} from "@himorishige/hatago/observability";
import {
  AuthenticationManager,
  RateLimiter,
} from "@himorishige/hatago/security";
import { TypeGenerator, MCPIntrospector } from "@himorishige/hatago/codegen";
import { OpenAPIGenerator } from "@himorishige/hatago/integrations";
import { mcp, tool, resource, prompt } from "@himorishige/hatago/decorators";
import { MockMCPServer, MCPTestClient } from "@himorishige/hatago/testing";
```

#### Enhanced TypeScript Support

- Full TypeScript 5.7+ compatibility
- Experimental decorators support with proper metadata emission
- Comprehensive type definitions for all new APIs
- IntelliSense support for generated MCP types

### 📊 **Observability Features**

#### Distributed Tracing

- Request tracing across all MCP servers and proxy layers
- Automatic trace correlation with trace-id/span-id headers
- Support for Jaeger, Zipkin, and console exporters
- Performance analysis and bottleneck identification

#### Metrics Collection

- HTTP request metrics (duration, count, status codes)
- MCP tool call metrics (per-server, per-tool performance)
- System metrics (memory usage, event loop lag, GC performance)
- Circuit breaker and rate limiter metrics
- Custom metrics support with labels and histograms

#### Health Monitoring

- Kubernetes-compatible health check endpoints
- Component-level health status tracking
- Automatic health state transitions
- Custom health check registration

### 🔒 **Security Features**

#### Authentication & Authorization

- JWT-based authentication with HS256/RS256 support
- Role-based access control with granular permissions
- OAuth 2.0 integration support for enterprise deployments
- Token validation and refresh mechanisms

#### Protection & Monitoring

- Sliding window rate limiting with per-user and global limits
- Circuit breaker protection with error severity classification
- Comprehensive audit logging for security events
- Automatic log sanitization to prevent data leakage
- Network access controls and IP filtering

### 🧪 **Testing Infrastructure**

#### Mock Server Framework

- `MockMCPServer` for unit testing without network complexity
- `MCPTestClient` with built-in assertion helpers
- Comprehensive test utilities for tools, resources, and prompts
- Integration testing support for real server scenarios

#### Test Automation

- Automated test suite execution with `runMCPTestSuite`
- Custom assertion functions for flexible validation
- Error condition testing with expected error scenarios
- Performance testing capabilities

### 🔄 **Migration & Compatibility**

#### Backward Compatibility

- **Legacy Adapter**: Existing NPX and Remote server configurations continue to work unchanged
- **Configuration Migration**: Automatic migration of old configuration formats
- **CLI Compatibility**: All existing CLI commands remain functional
- **API Compatibility**: Core MCP protocol APIs unchanged

#### Migration Path

1. Existing v0.0.x configurations work without modification
2. New features are opt-in through configuration
3. Legacy servers are wrapped in compatibility adapters
4. Gradual migration to new proxy architecture is supported

### 📈 **Performance Improvements**

- **Reduced Latency**: Proxy architecture reduces overhead compared to direct server management
- **Better Resource Utilization**: Connection pooling and session management optimizations
- **Smarter Routing**: Capability-based routing reduces unnecessary server calls
- **Memory Efficiency**: Improved garbage collection and memory management
- **Async Optimization**: Better handling of concurrent requests and long-running operations

### 🐛 **Bug Fixes**

- Fixed WebSocket connection stability issues
- Resolved memory leaks in long-running sessions
- Improved error handling in server connection failures
- Fixed race conditions in concurrent request handling
- Enhanced cleanup of resources during shutdown

### 📚 **Documentation**

#### New Documentation

- **Architecture Guide**: Comprehensive system design documentation
- **Developer Guide**: Advanced features guide (type generation, decorators, testing)
- **Observability Guide**: Complete monitoring and tracing setup guide
- **Security Guide**: Authentication, authorization, and security best practices
- **Development Roadmap**: Future feature plans and timeline

#### Enhanced Documentation

- Updated README with new features and expanded examples
- Enhanced CLI help with detailed command descriptions
- Comprehensive API documentation for all new modules
- Migration guide for upgrading from v0.0.x

### 🎯 **Future Compatibility**

This release establishes the foundation for future phases:

- **Phase 3**: Performance optimization and enterprise features (pipelines, caching, multi-tenancy)
- **Phase 4**: Ecosystem and extensibility (plugins, advanced integrations)
- **Phase 5**: Advanced AI/ML capabilities and intelligent operations

---

## [0.0.2] - 2024-11-28

### Added

- Basic MCP server aggregation
- NPX server support
- Remote server support (HTTP/SSE)
- Claude Code compatibility
- Simple CLI interface

### Fixed

- Initial stability issues
- Basic error handling

---

**Note**: Version 0.1.0 represents a complete architectural transformation of Hatago. While maintaining backward compatibility, it introduces a significantly enhanced feature set that positions Hatago as a comprehensive MCP Hub solution suitable for both development and production use.
