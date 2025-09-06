# Migration Guide: Returning to Hatago's "Thin" Philosophy

## Overview

Hatago MCP Hub is returning to its original design philosophy of being a **thin, transparent hub**. This means removing "thick" features like state management, caching, and complex transformations that have accumulated over time.

## Philosophy

Hatago's core principles:

- **"Don't add, remove"** - Prioritize reduction over feature addition
- **"Don't transform, relay"** - Avoid data processing, maintain transparency
- **"Don't judge, pass through"** - Avoid complex logic, simple relay only
- **"Don't thicken, stay thin"** - Maintain minimal implementation

## Migration Timeline

- **v0.x (Current)**: Deprecation warnings added
- **v1.0**: Management features moved to optional imports
- **v2.0**: Complete removal of deprecated features

## Changes

### 1. Implicit EnhancedHatagoHub Selection (DEPRECATED)

**Before:**

```typescript
// Automatically uses EnhancedHatagoHub when configFile is provided
const hub = createHub({ configFile: './hatago.config.json' });
```

**After:**

```typescript
// Explicit opt-in required
const hub = createHub({
  configFile: './hatago.config.json',
  useEnhanced: true // Explicitly opt-in to enhanced features
});
```

**Recommended (Thin approach):**

```typescript
// Use basic HatagoHub without state management
const hub = createHub({
  configFile: './hatago.config.json'
  // No useEnhanced - stays thin by default
});
```

### 2. Management Components (DEPRECATED)

These components violate Hatago's thin philosophy and will be removed:

- `ActivationManager` - Complex state management
- `IdleManager` - Idle detection and management
- `MetadataStore` - Caching layer
- `ServerStateMachine` - State machine implementation
- `AuditLogger` - Audit logging with cache
- `FileAccessGuard` - File access control
- `HatagoManagementServer` - Management server

**Before:**

```typescript
import { ActivationManager } from '@himorishige/hatago-hub';
```

**After (if still needed):**

```typescript
// Use legacy path (will be removed in v2.0)
import { ActivationManager } from '@himorishige/hatago-hub/legacy/activation-manager';
```

**Recommended:**

```typescript
// Remove dependency on state management
// Let MCP servers manage their own state
// Hub should only relay, not manage
```

## Migration Steps

### Step 1: Identify Usage

Search your codebase for deprecated imports:

```bash
# Find management component usage
grep -r "ActivationManager\|IdleManager\|MetadataStore\|ServerStateMachine\|AuditLogger\|FileAccessGuard" src/

# Find implicit Enhanced usage
grep -r "createHub.*configFile" src/
```

### Step 2: Evaluate Necessity

For each management component usage, ask:

1. Is this feature truly necessary?
2. Can the MCP server handle this internally?
3. Does this violate the "thin hub" principle?

Most features can be removed or moved to the MCP server layer.

### Step 3: Remove or Migrate

#### Option A: Remove (Recommended)

Simply remove the management features. The hub works fine without them:

```typescript
// Before: Complex setup with state management
const hub = new EnhancedHatagoHub({
  configFile: './config.json',
  enableIdleManagement: true,
  auditLog: true
});

// After: Simple, thin hub
const hub = createHub({
  configFile: './config.json'
});
```

#### Option B: Temporary Migration

If you absolutely need these features temporarily:

```typescript
// Use legacy imports (temporary)
import { ActivationManager } from '@himorishige/hatago-hub/legacy/activation-manager';

// Plan to remove or reimplement as separate middleware
```

### Step 4: Test Without Management Features

1. Remove management component imports
2. Run your application
3. Verify everything still works (it should!)

The hub is designed to work transparently without these features.

## Alternative Approaches

Instead of built-in management features, consider:

### 1. External Monitoring

Use external tools for monitoring and management:

- Prometheus for metrics
- ELK stack for logging
- External health checks

### 2. MCP Server Responsibility

Let each MCP server manage its own:

- State
- Idle detection
- Metadata caching
- Audit logging

### 3. Middleware Pattern (Future)

In future versions, optional middleware may be available:

```typescript
// Hypothetical future API
const hub = createHub()
  .use(loggingMiddleware()) // Optional
  .use(metricsMiddleware()); // Optional
```

## Code Size Targets

We're working to reduce code size to match the original philosophy:

| File                  | Current     | Target        | Philosophy            |
| --------------------- | ----------- | ------------- | --------------------- |
| hub.ts                | 2310 lines  | 500-700 lines | Core relay logic only |
| handleJsonRpcRequest  | 432 lines   | 120 lines     | Table-driven dispatch |
| Total management code | ~2000 lines | 0 lines       | Removed entirely      |

## Benefits of Migration

1. **Simplicity**: Easier to understand and maintain
2. **Performance**: Less overhead, faster processing
3. **Reliability**: Fewer moving parts, fewer bugs
4. **Philosophy**: Aligns with Hatago's core design
5. **Transparency**: Clear data flow, no hidden transformations

## Getting Help

- GitHub Issues: https://github.com/himorishige/hatago-mcp-hub/issues
- Documentation: https://github.com/himorishige/hatago-mcp-hub/blob/main/docs/

## FAQ

**Q: What if I need state management?**
A: Implement it in your MCP server or use external state management. The hub should only relay.

**Q: Will this break my application?**
A: No, if you follow the migration steps. The core functionality remains unchanged.

**Q: Why remove these features?**
A: They violate Hatago's design philosophy and add unnecessary complexity. A thin hub is more maintainable and reliable.

**Q: When will deprecated features be removed?**
A: Major version 2.0. You have time to migrate.

## Conclusion

Returning to Hatago's thin philosophy will make the hub:

- Simpler
- Faster
- More reliable
- Easier to maintain

The hub should be a transparent relay, not a complex state machine. Embrace the simplicity!
