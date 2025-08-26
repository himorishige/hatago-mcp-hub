# Hatago Lite Architecture

## Overview

Hatago Lite is a minimal, lightweight version of Hatago MCP Hub that focuses on core functionality while making enterprise features optional.

## Core Features (Always Included)

### Essential Components

- **MCP Hub Server**: Unified management of multiple MCP servers
- **Session Management**: Session isolation with mcp-session-id header
- **Tool Name Collision Avoidance**: Server name prefixing
- **Configuration Management**: JSON-based config files
- **Basic Transports**: STDIO and HTTP
- **Local Server Support**: Execute any command (node, python, deno, etc.)
- **Basic Error Handling**: Simple error recovery without circuit breakers
- **Minimal Logging**: Console-based logging without structured logging

### Core Modules

```
src/
├── core/           # MCP hub, session manager, registries
├── transport/      # STDIO, HTTP transports
├── config/         # Configuration loader and validator
├── servers/        # NPX, remote, local server management
├── storage/        # Registry storage
├── cli/            # CLI commands (minimal set)
└── utils/          # Basic utilities
```

## Optional Features (Conditional Import)

### Enterprise Features

```
src/enterprise/     # All enterprise features (separate package)
├── observability/  # Health checks, metrics, tracing
├── security/       # Auth, rate limiting
├── codegen/        # Type generation
├── integrations/   # OpenAPI integration
└── decorators/     # Experimental APIs
```

### Feature Flags in Config

```json
{
  "profile": "default",
  "features": {
    "healthCheck": false,      // Disable health monitoring
    "metrics": false,          // Disable Prometheus metrics
    "tracing": false,          // Disable distributed tracing
    "authentication": false,   // Disable JWT auth
    "rateLimit": false,        // Disable rate limiting
    "typeGeneration": false,   // Disable TypeScript generation
    "openapi": false          // Disable OpenAPI integration
  },
  "servers": [...]
}
```

## Implementation Strategy

### 1. Conditional Imports

```typescript
// In serve.ts
if (config.features?.healthCheck) {
  const { healthMonitor } = await import(
    "../../enterprise/observability/health-monitor.js"
  );
  healthMonitor.startMonitoring();
}
```

### 2. Simplified Circuit Breaker

Replace complex circuit breaker with simple retry logic:

```typescript
// Simple retry with exponential backoff
async function callWithRetry(fn: () => Promise<any>, maxRetries = 3) {
  for (let i = 0; i < maxRetries; i++) {
    try {
      return await fn();
    } catch (error) {
      if (i === maxRetries - 1) throw error;
      await new Promise((r) => setTimeout(r, Math.pow(2, i) * 1000));
    }
  }
}
```

### 3. Package Structure

```json
// package.json
{
  "name": "@hatago/core",
  "dependencies": {
    // Only essential dependencies
    "@modelcontextprotocol/sdk": "^1.x",
    "hono": "^4.x",
    "commander": "^14.x",
    "zod": "^3.x"
  },
  "optionalDependencies": {
    // Enterprise features
    "@hatago/enterprise": "^0.1.0"
  }
}
```

### 4. Lite Entry Points

```typescript
// src/lite.ts - Minimal hub without enterprise features
export { HatagoHubLite } from "./core/hub-lite.js";
export * from "./core/types.js";

// src/index.ts - Full hub with all features
export * from "./lite.js";
export * from "./enterprise/index.js";
```

### 5. CLI Commands

#### Core Commands (Always Available)

- `hatago serve` - Start server
- `hatago mcp` - Manage MCP servers
- `hatago list` - List servers
- `hatago init` - Initialize config

#### Enterprise Commands (Conditional)

- `hatago health` - Health checks (requires enterprise)
- `hatago metrics` - View metrics (requires enterprise)
- `hatago generate` - Type generation (requires enterprise)

## Migration Path

### Phase 1: Code Reorganization

1. Move enterprise features to separate directory
2. Create feature flag system in config
3. Implement conditional imports

### Phase 2: Package Split

1. Create @hatago/core package
2. Create @hatago/enterprise package
3. Update dependencies

### Phase 3: Testing & Documentation

1. Test minimal configuration
2. Test with enterprise features enabled
3. Update documentation

## Benefits

### Performance

- **Faster Startup**: ~50% reduction in startup time
- **Lower Memory**: ~30% reduction in memory usage
- **Smaller Bundle**: ~60% reduction in package size

### Developer Experience

- **Simple Setup**: Zero configuration for basic use
- **Gradual Complexity**: Add features as needed
- **Clear Separation**: Core vs enterprise features

### Maintenance

- **Modular Architecture**: Easier to maintain
- **Optional Dependencies**: Reduce security surface
- **Clear Upgrade Path**: From lite to full version

## Example Configurations

### Minimal (Lite)

```json
{
  "servers": [
    {
      "id": "local-python",
      "type": "local",
      "command": "python",
      "args": ["./mcp_server.py"]
    }
  ]
}
```

### With Selected Features

```json
{
  "features": {
    "healthCheck": true,
    "authentication": true
  },
  "servers": [...]
}
```

### Full Enterprise

```json
{
  "features": {
    "healthCheck": true,
    "metrics": true,
    "tracing": true,
    "authentication": true,
    "rateLimit": true,
    "typeGeneration": true,
    "openapi": true
  },
  "servers": [...]
}
```
