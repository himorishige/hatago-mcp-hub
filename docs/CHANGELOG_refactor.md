# Hatago Hub Refactor Changelog (2025-09-07)

This document summarizes the internal refactoring towards a thinner, simpler hub implementation.

- Removed features: sampling bridge, startup tools/list wait, simple SSE GET fallback, base-hub notification manager coupling.
- Extracted modules:
  - RPC handlers: `src/rpc/handlers.ts` (initialize, tools, resources, prompts, ping)
  - HTTP handler: `src/http/handler.ts`
  - Config reload & watch: `src/config/reload.ts`, `src/config/watch.ts`
- Introduced minimal interface `IHub` (exported from `@himorishige/hatago-hub`) for server/test-utils integration.
- Kept public runtime behavior and API stable; internal structure is now easier to read and test.

Notes:

- Notifications in the base hub are intentionally no-op; Enhanced hub owns them.
- SSE endpoints are centralized under `hub-streamable` helpers.
