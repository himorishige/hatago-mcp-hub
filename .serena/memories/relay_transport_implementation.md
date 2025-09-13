# RelayTransport Implementation (2025-09-13)

## Overview

Promoted RelayTransport (formerly thin-adapter) as the default transport implementation for Hatago MCP Hub.

## Key Changes

### 1. Renaming and Promotion

- Renamed `thin-adapter.ts` to `relay-transport.ts`
- Renamed `StreamableHttpAdapter` class to `RelayTransport`
- Made RelayTransport the default transport implementation
- Removed all feature flags (HATAGO_THIN_TRANSPORT, HATAGO_THIN_RUNTIME)

### 2. Architecture

- RelayTransport wraps StreamableHTTPTransport from @modelcontextprotocol/sdk
- Provides thin facade following Hatago philosophy: "thin, transparent, relay without judgment"
- Location: `packages/transport/src/relay-transport.ts`

### 3. Type Safety Improvements

- Fixed method overloads for send() to handle both ThinHttpRequest and JSONRPCMessage
- Resolved all lint errors without using eslint-disable comments
- Improved type definitions with proper type assertions

### 4. Known Issues (Future Improvements)

From code review:

- Still contains tracing and debug logging (violates "thin" principle)
- GET request handling uses mock response instead of pure relay
- Could be reduced from ~345 lines to ~50 lines for true "thin" implementation
- These will be addressed in future Phase 3 refactoring

### 5. Testing Status

- Successfully connects with MCP Inspector
- All type checks pass
- All lint checks pass
- HTTP and STDIO modes work correctly

## Technical Details

### Method Overloads

```typescript
send(request: ThinHttpRequest): Promise<ThinHttpResponse>;
send(message: JSONRPCRequest | JSONRPCNotification): Promise<void>;
```

### Integration Points

- Used by HatagoHub in `packages/hub/src/hub.ts`
- Created via `createRelayHttpTransport()` factory function
- Supports start(), close(), and handleHttpRequest() methods

## Documentation Updates

- CHANGELOG.md: Added Unreleased section for v0.0.5
- docs/ARCHITECTURE.md: Updated Transport Layer section
- CLAUDE.md: Added version history entry
- README.ja.md: Added update history section

## Future Work

- Phase 3: Reduce to true "thin" implementation (~50 lines)
- Remove unnecessary tracing/debug code
- Implement pure passthrough for all request types
- Consider decorator pattern for optional features
