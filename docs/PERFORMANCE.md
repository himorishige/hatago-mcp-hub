# Performance Guide

## Overview

This document details the performance characteristics and optimizations of Hatago MCP Hub, including benchmarks, improvements, and trade-offs.

## v0.0.14 Performance Improvements

### Startup Time

**8.44x faster startup** compared to v0.0.13:

| Version               | Startup Time | Improvement      |
| --------------------- | ------------ | ---------------- |
| v0.0.13 (EnhancedHub) | 85.66ms      | Baseline         |
| v0.0.14 (Basic Hub)   | 10.14ms      | **8.44x faster** |

### Package Size

**17% reduction** in package size:

| Version | Package Size | Unpacked Size   | Files | Reduction       |
| ------- | ------------ | --------------- | ----- | --------------- |
| v0.0.13 | ~230KB       | 1,035,849 bytes | 44    | Baseline        |
| v0.0.14 | 183.5KB      | 854,600 bytes   | 35    | **17% smaller** |

- Total size reduction: 181,249 bytes
- File count reduction: 9 files

### Architecture Simplification

Components removed in v0.0.14:

- EnhancedHub implementation
- State machines (INITIAL → ACTIVATING → ACTIVE → DEACTIVATING → INACTIVE)
- Activation manager (queues, history, cooldown)
- Idle manager (reference counting, timers)
- Config watcher (fs.watch, reload logic)
- Internal management tools

## Benchmarking

### Running Benchmarks

```bash
# Run performance benchmarks
pnpm test:bench

# Run with specific runtime
HATAGO_LEAN_RUNTIME=true pnpm test:bench

# Profile specific operations
pnpm vitest bench src/benchmark/profiling.bench.ts
```

### Benchmark Results

#### Hub Creation and Startup

```typescript
describe('Hub Performance', () => {
  bench('createHub', () => {
    const hub = createHub({ logLevel: 'error' });
  });
  // Result: ~0.5ms

  bench('hub.start()', async () => {
    const hub = createHub({ logLevel: 'error' });
    await hub.start();
  });
  // Result: ~10.14ms
});
```

#### Tool Registry Operations

```typescript
describe('Tool Registry', () => {
  bench('register 100 tools', () => {
    const registry = new ToolRegistry();
    for (let i = 0; i < 100; i++) {
      registry.register(`tool_${i}`, mockTool);
    }
  });
  // Result: ~2ms

  bench('listTools with 100 tools', () => {
    registry.listTools();
  });
  // Result: ~0.1ms
});
```

## Optimization Strategies

### 1. Lazy Initialization

Servers are only connected when needed:

```typescript
// Before: Connect all servers on startup
async start() {
  for (const [id, spec] of this.servers) {
    await this.connectServer(id, spec);
  }
}

// After: Connect on-demand
async callTool(name: string) {
  const server = this.getServerForTool(name);
  if (!server.connected) {
    await this.connectServer(server.id);
  }
  return server.callTool(name);
}
```

### 2. Minimal Dependencies

Reduced external dependencies:

- Removed: chokidar (file watching)
- Removed: Complex state management libraries
- Core dependencies: @modelcontextprotocol/sdk, hono, commander

### 3. Efficient Message Routing

Direct routing without transformation:

```typescript
// Direct passthrough without processing
async callTool(name: string, args: unknown) {
  const server = this.resolveServer(name);
  return server.call(name, args); // No transformation
}
```

### 4. Memory Management

- No persistent state storage
- Minimal caching (ephemeral only)
- Automatic cleanup of disconnected servers

## Trade-offs

### Features Removed for Performance

1. **Configuration Hot Reload**
   - Removed: Built-in file watching
   - Alternative: Use nodemon/PM2
   - Benefit: -50KB package size, simpler code

2. **Automatic Retry Logic**
   - Removed: Complex retry queues
   - Alternative: Client-triggered reconnection
   - Benefit: Predictable behavior, less memory

3. **State Machines**
   - Removed: 5-state lifecycle management
   - Alternative: Simple connected/disconnected
   - Benefit: Faster connections, less overhead

## Performance Best Practices

### For Users

1. **Use Tag Filtering**: Start only needed servers

   ```bash
   hatago serve --tags production
   ```

2. **Lazy Server Configuration**: Set servers to connect on-demand

   ```json
   {
     "mcpServers": {
       "heavy-server": {
         "command": "...",
         "lazy": true
       }
     }
   }
   ```

3. **External Process Management**: Use PM2 for production
   ```bash
   pm2 start "hatago serve" --name hatago
   pm2 monit # Monitor performance
   ```

### For Developers

1. **Minimize Transformations**: Pass data through unchanged
2. **Avoid State Accumulation**: Keep hub stateless
3. **Use Streaming APIs**: For large responses
4. **Profile Before Optimizing**: Use benchmarks to guide decisions

## Monitoring

### Metrics Collection (Optional)

Enable lightweight metrics:

```bash
HATAGO_METRICS=1 hatago serve --http
# Access metrics at http://localhost:3535/metrics
```

Metrics include:

- Request count and latency
- Active connections
- Tool call performance
- Memory usage

### Logging Performance

```bash
# JSON logs for analysis
HATAGO_LOG=json hatago serve

# Debug level for detailed timing
HATAGO_LOG_LEVEL=debug hatago serve
```

## Future Optimizations

Potential areas for improvement:

1. **Connection Pooling**: Reuse transport connections
2. **Response Caching**: Cache immutable responses
3. **Parallel Initialization**: Connect servers concurrently
4. **WebAssembly**: Compile performance-critical paths
5. **Worker Threads**: Offload heavy computations

## Comparison with Other Hubs

| Feature          | Hatago (v0.0.14) | Generic MCP Hub | Enterprise Hub |
| ---------------- | ---------------- | --------------- | -------------- |
| Startup Time     | 10ms             | 50-100ms        | 200-500ms      |
| Package Size     | 854KB            | 2-5MB           | 10-20MB        |
| Memory Usage     | ~50MB            | ~100MB          | ~500MB         |
| Dependencies     | 3 core           | 20-50           | 100+           |
| Config Reload    | External         | Built-in        | Built-in + UI  |
| State Management | Minimal          | Moderate        | Complex        |

## Conclusion

Hatago MCP Hub v0.0.14 prioritizes:

- **Speed**: 8.44x faster startup
- **Simplicity**: Removed complex features
- **Size**: 17% smaller package
- **Maintainability**: Cleaner, focused code

The trade-offs (removed hot reload, state machines) are balanced by:

- Better performance
- External tool alternatives
- Simpler mental model
- Easier debugging

For most use cases, the performance improvements far outweigh the removed features, which can be replaced with battle-tested external tools.
