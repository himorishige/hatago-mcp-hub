# Migration Guide

## v0.0.13 → v0.0.14

### Breaking Changes

#### Removed --watch flag

The built-in configuration watching has been removed for simplicity and performance.

**Before:**

```bash
hatago serve --watch
```

**After (using nodemon):**

```bash
npx nodemon --exec "hatago serve" --watch hatago.config.json
```

**After (using PM2):**

```bash
pm2 start "hatago serve" --watch hatago.config.json
```

#### Removed watchConfig option

The `watchConfig` option in programmatic API has been removed.

**Before:**

```typescript
await startServer({
  mode: 'stdio',
  config: './hatago.config.json',
  watchConfig: true
});
```

**After:**

```typescript
await startServer({
  mode: 'stdio',
  config: './hatago.config.json'
});
```

### Performance Improvements

- **8.44x faster startup**: 85.66ms → 10.14ms
- **17% smaller package size**: 1.04MB → 854KB (181KB reduction)
- **Removed layers**: EnhancedHub and management components

### Rationale

The --watch functionality was removed as part of the simplification effort to create a more lightweight and performant hub. External tools like nodemon and PM2 provide more robust file watching capabilities with additional features like:

- Multiple file/directory watching
- Customizable restart delays
- Process management features
- Better error recovery

### Recommended Migration Path

1. **For development environments:**

   ```bash
   npm install -g nodemon
   nodemon --exec "hatago serve --http" --watch hatago.config.json
   ```

2. **For production environments:**

   ```bash
   npm install -g pm2
   pm2 start "hatago serve --http" --name hatago --watch hatago.config.json
   pm2 save
   pm2 startup
   ```

3. **For Docker environments:**
   - Use container orchestration tools' built-in restart policies
   - Mount config files as volumes for easy updates

### Alternative Solutions

If you need configuration hot-reload without external tools:

1. **Use SIGHUP signal** (future feature):
   - Send SIGHUP to reload config (planned for v0.1.0)

2. **Use MCP tools/resources**:
   - Implement a reload tool in your MCP server
   - Trigger reload via MCP protocol

3. **Use file watchers in your application**:

   ```typescript
   import { watch } from 'fs';
   import { createHub } from '@himorishige/hatago-mcp-hub';

   const hub = createHub(config);

   watch('./hatago.config.json', async () => {
     await hub.stop();
     await hub.start();
   });
   ```

## v0.0.12 → v0.0.13

### Major Refactoring

- **Hub Simplification**: Extracted complex logic into focused modules
- **Management Extraction**: State machines and managers moved to separate package
- **Configuration Inheritance**: Added `extends` field for config composition

### What Changed

1. **Simplified Hub Core**
   - Hub is now a thin orchestrator
   - Logic extracted to: `rpc/handlers.ts`, `http/handler.ts`
   - Cleaner integration boundaries

2. **Removed Features**
   - Sampling bridge (MCP sampling proxying)
   - 3-second startup wait for tools/list
   - Simple SSE GET fallback

## Need Help?

- [GitHub Issues](https://github.com/himorishige/hatago-mcp-hub/issues)
- [Discussions](https://github.com/himorishige/hatago-mcp-hub/discussions)
