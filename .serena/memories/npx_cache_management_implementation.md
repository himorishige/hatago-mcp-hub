# NPX Cache Management Implementation

## Overview

Implemented comprehensive NPX cache management to address the issue where `--prefer-offline` doesn't guarantee cache usage and there was no mechanism to verify actual cache status.

## Components Created

### 1. NpxCacheManager (`server/src/servers/npx-cache-manager.ts`)

- Singleton class for managing NPX package cache status
- Tracks warmup results and cache status
- Methods:
  - `recordWarmupResult()`: Records success/failure of warmup attempts
  - `isCached()`: Checks if a package is cached using npm commands
  - `getCachePath()`: Gets the cache directory path for a package
  - `verifyCacheIntegrity()`: Verifies npm cache integrity
  - `refreshCache()`: Forces a cache refresh for a package
  - `clearStatus()`: Clears cache status for a package

### 2. Cache-Aware Timeout Logic

Modified `NpxMcpServer.performStart()` to:

- Check if package is cached before starting
- Use shorter timeouts (15s) for cached packages
- Use longer timeouts (60s) for uncached packages
- Emit info messages about cache status

### 3. Cache Miss Error Handling

- Detects cache miss errors (npm ERR!, network, ENOTFOUND, ETIMEDOUT)
- Clears cache status on cache miss for retry
- Provides specific error messages for cache-related failures

### 4. Configuration Options

Added to `server/src/config/types.ts`:

- Per-server cache config in `NpxServerConfig`:
  - `cache.preferOffline`: Use cache when available (default: true)
  - `cache.checkIntervalMs`: Cache check interval (default: 5 minutes)
  - `cache.forceRefresh`: Force refresh on start (default: false)
- Global cache config in `HatagoConfig`:
  - `npxCache.enabled`: Enable cache management (default: true)
  - `npxCache.warmupOnStart`: Warmup packages on start (default: true)
  - `npxCache.cacheCheckIntervalMs`: Global check interval (default: 5 minutes)
  - `npxCache.verifyCacheIntegrity`: Verify cache integrity (default: false)

### 5. Warmup Integration

Updated `McpHub.warmupNpxPackages()` to:

- Record cache results using NpxCacheManager
- Track success/failure for each package
- Provide better reporting of warmup status

## Benefits

1. **Improved reliability**: Accurate cache detection prevents unnecessary downloads
2. **Better performance**: Shorter timeouts for cached packages
3. **Enhanced error handling**: Specific handling for cache miss scenarios
4. **Configurable behavior**: Fine-grained control over cache management
5. **Observable status**: Can query which packages are cached

## Testing

Created comprehensive test suite in `npx-cache-manager.test.ts` covering:

- Warmup result recording
- Package name parsing
- Cache status clearing
- Singleton pattern

## Usage Example

```typescript
const cacheManager = getNpxCacheManager();
const isCached = await cacheManager.isCached(
  "@modelcontextprotocol/server-filesystem",
);
if (!isCached) {
  console.log("Package not cached, using extended timeout");
}
```
