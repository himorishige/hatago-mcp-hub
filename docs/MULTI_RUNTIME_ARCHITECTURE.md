# Multi-Runtime Architecture

## Overview

Hatago MCP Hub has been architected to support multiple JavaScript runtime environments through a platform abstraction layer. This enables the same core MCP Hub functionality to run on Node.js, Cloudflare Workers, Deno, and Bun.

## Architecture Layers

```
┌─────────────────────────────────────────┐
│          Application Layer              │
│  (Hono HTTP Server / CLI / API)        │
├─────────────────────────────────────────┤
│            Core Layer                   │
│   (McpHub, Registries, Managers)       │
├─────────────────────────────────────────┤
│      Platform Abstraction Layer         │
│        (Platform Interface)             │
├─────────────────────────────────────────┤
│     Runtime Implementation Layer        │
│  (Node.js / Workers / Deno / Bun)      │
└─────────────────────────────────────────┘
```

## Platform Abstraction

The platform abstraction provides a unified interface for runtime-specific features:

### Core Interfaces

```typescript
interface Platform {
  capabilities: RuntimeCapabilities;
  storage: Storage;
  events: EventBus;
  transport: MCPTransport;
  logger: Logger;
  crypto: Crypto;
  process: ProcessRunner;
}
```

### Runtime Capabilities

Each runtime declares its capabilities:

| Runtime | File System | Child Process | TCP Socket | WebSocket | MCP Types |
|---------|------------|---------------|------------|-----------|-----------|
| Node.js | ✅ | ✅ | ✅ | ✅ | local, npx, remote |
| Workers | ❌ | ❌ | ❌ | ✅ | remote |
| Deno | ✅ | ✅ | ✅ | ✅ | local, npx, remote |
| Bun | ✅ | ✅ | ✅ | ✅ | local, npx, remote |

## Implementation Status

### ✅ Completed

1. **Platform Abstraction Layer**
   - Core interfaces defined
   - Runtime detection mechanism
   - Dependency injection pattern

2. **Node.js Implementation**
   - Full platform implementation
   - All MCP server types supported
   - File and memory storage

3. **Cloudflare Workers Implementation**
   - KV storage support
   - HTTP/WebSocket transports
   - Remote MCP servers only

4. **Core Layer Integration**
   - McpHub accepts Platform via DI
   - ConfigManager uses EventBus
   - ServerRegistry platform-aware

5. **Hono Middleware**
   - Platform injection middleware
   - Auto-detection support
   - Context variables

### 🚧 Future Work

1. **Deno Implementation**
   - Currently uses Node.js implementation
   - Native Deno APIs integration planned

2. **Bun Implementation**  
   - Currently uses Node.js implementation
   - Bun-specific optimizations planned

## Usage Examples

### Node.js Application

```typescript
import { createNodePlatform } from './platform/node/index.js';
import { McpHub } from './core/mcp-hub.js';

const platform = await createNodePlatform();
const hub = new McpHub({
  config,
  platform
});
```

### Cloudflare Workers Application

```typescript
import { createWorkersPlatform } from './platform/workers/index.js';
import { McpHub } from './core/mcp-hub.js';

export default {
  async fetch(request, env) {
    const platform = await createWorkersPlatform({
      kv: env.MY_KV_NAMESPACE
    });
    
    const hub = new McpHub({
      config,
      platform
    });
    
    // Handle request...
  }
}
```

### Auto-Detection

```typescript
import { createPlatform } from './platform/detector.js';

// Automatically detects runtime and creates appropriate platform
const platform = await createPlatform();
```

### Hono with Platform Middleware

```typescript
import { Hono } from 'hono';
import { createPlatformMiddleware } from './middleware/platform.js';

const app = new Hono();

// Inject platform into all routes
app.use('*', createPlatformMiddleware());

app.get('/health', (c) => {
  const platform = c.var.platform;
  return c.json({
    runtime: platform.capabilities.name
  });
});
```

## Platform-Specific Considerations

### Node.js
- Full feature support
- Native file system access
- Child process spawning for local MCP servers
- NPX package execution

### Cloudflare Workers
- No file system - use KV storage
- No child processes - remote MCP only
- WebSocket and HTTP transports
- Edge runtime optimizations

### Storage Options

| Platform | File Storage | Memory Storage | KV Storage |
|----------|-------------|----------------|------------|
| Node.js | ✅ | ✅ | ❌ |
| Workers | ❌ | ✅ | ✅ |
| Deno | ✅ | ✅ | ❌ |
| Bun | ✅ | ✅ | ❌ |

## Migration Guide

### From Direct Node.js APIs

Before:
```typescript
import { EventEmitter } from 'node:events';
import { spawn } from 'node:child_process';

class MyService extends EventEmitter {
  startProcess() {
    const child = spawn('node', ['server.js']);
  }
}
```

After:
```typescript
class MyService {
  constructor(private platform: Platform) {}
  
  startProcess() {
    const handle = this.platform.process.run('node', ['server.js']);
  }
}
```

### EventEmitter to EventBus

Before:
```typescript
emitter.on('event', handler);
emitter.emit('event', data);
```

After:
```typescript
const unsubscribe = eventBus.on('event', handler);
eventBus.emit('event', data);
unsubscribe(); // Clean up
```

## Testing

Test with different platforms:

```typescript
// Test with Node.js platform
const nodePlatform = await createNodePlatform();
testService(nodePlatform);

// Test with Workers platform
const workersPlatform = await createWorkersPlatform();
testService(workersPlatform);
```

## Performance Considerations

- **Node.js**: Optimized for server environments, full feature set
- **Workers**: Optimized for edge, limited to remote MCP servers
- **Storage**: Choose appropriate storage based on runtime
- **Transport**: Use HTTP/WS for Workers, STDIO for Node.js

## Security Considerations

- Platform abstraction provides consistent security boundaries
- Runtime capabilities prevent unsupported operations
- Storage isolation between platforms
- Transport security handled by platform implementation

## Future Enhancements

1. **Additional Runtimes**
   - React Native support
   - Browser environment support

2. **Platform Features**
   - Caching layer abstraction
   - Metrics collection interface
   - Distributed tracing support

3. **Optimizations**
   - Runtime-specific performance tuning
   - Conditional code loading
   - Tree-shaking for smaller bundles

## Contributing

When adding new platform implementations:

1. Implement all interfaces in `platform/types.ts`
2. Add runtime detection to `platform/detector.ts`
3. Create platform-specific directory under `platform/`
4. Implement storage, events, transport, logger, crypto, process
5. Add tests for platform implementation
6. Update capability matrix in documentation