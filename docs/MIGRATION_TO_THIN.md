# Migration Guide: Moving to HubCore (Thin Implementation)

## Overview

Starting from v0.1.0, Hatago MCP Hub defaults to **HubCore**, a minimal implementation that follows the Hatago philosophy of being a thin, transparent relay. This guide helps you migrate from the legacy implementation.

## What's Changed

### Default Behavior

**Before (v0.0.x):**

```javascript
const hub = createHub(); // Creates HatagoHub with full features
```

**After (v0.1.0+):**

```javascript
const hub = createHub(); // Creates HubCore (thin implementation)
```

### Performance Improvements

- **Startup**: 10-100x faster (5-10ms vs 100-500ms)
- **Memory**: 4-8x reduction (5-10MB vs 20-40MB)
- **Code Size**: 83% reduction (400 lines vs 2,310 lines)
- **Request Latency**: 2x faster (10ms vs 20ms)

## Migration Scenarios

### Scenario 1: You Don't Need Legacy Features

If you're using Hatago as a simple MCP hub without advanced features, **no changes needed**! The default HubCore will work transparently.

### Scenario 2: You Need Specific Legacy Features

If you rely on these features, enable legacy mode:

- Session management
- State tracking
- Caching
- Hot reload
- WebSocket transport
- Internal management tools

```javascript
import { createHub } from '@himorishige/hatago-mcp-hub';

const hub = createHub({
  useLegacyHub: true // Enable legacy mode
  // ... your existing config
});
```

### Scenario 3: You're Using Deprecated Exports

If you're importing deprecated components directly:

**Before:**

```javascript
import { ActivationManager, HatagoManagementServer } from '@himorishige/hatago-mcp-hub';
```

**After:**

```javascript
// Option 1: Use legacy imports (will show deprecation warning)
import { ActivationManager, HatagoManagementServer } from '@himorishige/hatago-mcp-hub/legacy';

// Option 2: Remove if not needed (recommended)
// These features go against the thin philosophy
```

## Feature Comparison

| Feature                | HubCore (Default) | Legacy Hub   |
| ---------------------- | ----------------- | ------------ |
| Basic MCP Protocol     | ✅                | ✅           |
| Tool Prefixing         | ✅                | ✅           |
| Multiple Servers       | ✅                | ✅           |
| STDIO Transport        | ✅                | ✅           |
| HTTP/SSE Transport     | ✅                | ✅           |
| WebSocket Transport    | ❌                | ✅           |
| State Management       | ❌                | ✅           |
| Session Management     | ❌                | ✅           |
| Caching                | ❌                | ✅           |
| Hot Reload             | ❌                | ✅           |
| Progress Notifications | ✅ (relay)        | ✅ (managed) |
| Internal Tools         | ❌                | ✅           |
| Tag Filtering          | ❌                | ✅           |

## Configuration Changes

### Environment Variables

Both implementations support environment variable expansion:

```json
{
  "mcpServers": {
    "server1": {
      "command": "npx",
      "args": ["@modelcontextprotocol/server-filesystem", "."],
      "env": {
        "API_KEY": "${API_KEY}" // Works in both
      }
    }
  }
}
```

### Server Types

Both support all server types:

```json
{
  "mcpServers": {
    // Local process
    "local": {
      "command": "node",
      "args": ["./server.js"]
    },
    // Remote HTTP/SSE
    "remote": {
      "url": "https://api.example.com/mcp",
      "type": "sse"
    }
  }
}
```

## Troubleshooting

### Issue: Missing Hot Reload

**Symptom**: Configuration changes don't apply automatically

**Solution**: Either:

1. Restart the hub after config changes (recommended for simplicity)
2. Enable legacy mode with `useLegacyHub: true`

### Issue: No Internal Management Tools

**Symptom**: `_internal_hatago_*` tools not available

**Solution**:

1. These tools add complexity against the thin philosophy
2. If needed, enable legacy mode with `useLegacyHub: true`

### Issue: Session Management Required

**Symptom**: Need to maintain state across requests

**Solution**: Enable legacy mode - HubCore is stateless by design

```javascript
const hub = createHub({
  useLegacyHub: true,
  sessionTTL: 3600000 // 1 hour
});
```

## Best Practices

### For New Projects

1. **Start with HubCore** (default) - it's simpler and faster
2. Only enable legacy mode if you need specific features
3. Consider if you really need stateful features

### For Existing Projects

1. **Try HubCore first** - most projects work without changes
2. Monitor for missing features
3. Enable legacy mode only if needed

### For Production

1. **HubCore is production-ready** for basic hub functionality
2. Use legacy mode for enterprise features (sessions, caching)
3. Consider running multiple instances for scaling

## FAQ

### Q: Will legacy mode be removed?

A: Legacy mode will be maintained for backward compatibility but won't receive new features. The focus is on keeping HubCore thin and efficient.

### Q: Can I mix HubCore and legacy features?

A: No, it's either/or. HubCore is designed to be minimal without the complexity of feature flags.

### Q: Is HubCore less reliable?

A: No, it's actually more reliable due to less complexity. Fewer lines of code = fewer bugs.

### Q: Should I migrate immediately?

A: HubCore is the default, so new installs automatically use it. Existing projects can migrate at their own pace using `useLegacyHub: true` if needed.

## Support

- **Issues**: https://github.com/himorishige/hatago-mcp-hub/issues
- **Discussions**: https://github.com/himorishige/hatago-mcp-hub/discussions
- **Documentation**: https://github.com/himorishige/hatago-mcp-hub/docs
