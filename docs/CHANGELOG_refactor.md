# Hatago Hub Refactor Changelog (2025-09-07 → 2025-09-11)

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

## 2025-09-11 — Lifecycle Simplification

- IdleManager: switched to a single per‑server timer (scheduled only when reference count becomes 0). Removed periodic scanning and detailed activity stats. Stop occurs when both `idleTimeoutMs` and `minLingerMs` are satisfied.
- ActivationManager: removed activation queue, history, and cooldown handling. Lightweight in‑flight guard remains to deduplicate concurrent activations. On failure, transition `ERROR → INACTIVE` immediately (no auto retry).
- ServerStateMachine: reduced valid transitions to a minimal set. `IDLING` and `COOLDOWN` were removed from core types; `MANUAL` remains only for policy labeling.
- Tests: adjusted state machine tests to the new transition model.
