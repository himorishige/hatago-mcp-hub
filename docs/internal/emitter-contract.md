---
title: Hatago Hub Internal Emitter Contract
status: stable
updated: 2025-09-10
---

# Overview

Hatago Hub uses a typed internal event emitter to keep the implementation thin while improving safety and readability. This document defines the internal contract and usage guidelines for events and notifications.

Scope:

- Internal to `packages/hub` (and close collaborators): registrar, notifier, API modules
- No behavior or public API changes for consumers of `@himorishige/hatago-hub`

Key goals:

- Single source of truth for event names and payloads
- No new runtime deps; zero‑cost typing at the boundary
- Safer code without `any` or `as unknown as` casts

## Event Names and Types

- Constants: `HUB_EVENT_KEYS` (exported)
- Type map: `HubEvents` (exported)

Location:

```
packages/hub/src/events/hub-events.ts
```

Examples:

```ts
import { HUB_EVENT_KEYS, type HubEvents } from '@himorishige/hatago-hub';

// Public IHub remains string-based:
hub.on(HUB_EVENT_KEYS.toolCalled, (evt) => {
  // evt is unknown at public surface by design
});

// Internal (inside packages/hub), use TypedEmitter<HubEvents>
// See packages/hub/src/utils/events.ts
```

### Current Event Keys

- server: `server:connected`, `server:disconnected`, `server:error`, `server:notification`
- tools: `tool:registered`, `tool:called`, `tool:error`
- resources: `resource:registered`, `resource:read`
- prompts: `prompt:registered`, `prompt:got`

See the exact payloads in `HubEvents` definition.

## Typed Emitter

Implementation: `TypedEmitter<TEvents>` and `createTypedEmitter<TEvents>(logger?)`

Location:

```
packages/hub/src/utils/events.ts
```

Contract:

- `on(event, handler)`/`off(event, handler)`/`emit(event, payload)`
- Type parameters enforce per-event payload shapes at compile time
- Runtime behavior is unchanged

## Internal Usage Pattern

- `HatagoHub` owns a `TypedEmitter<HubEvents>` instance
- Public API stays stable: `IHub.on(event: string, handler: (evt: unknown) => void)`
- Adapters (`registrar`, `notifier`, `api/*`) call a small `emitUntyped` bridge to avoid leaking internal types

## Notifications and JSON‑RPC

- Always use core RPC constants: `RPC_METHOD` and `RPC_NOTIFICATION` from `@himorishige/hatago-core`
- When forwarding progress in HTTP mode, prefer `StreamableHTTPTransport.sendProgressNotification()`; in STDIO, prefer `onNotification` callback

## Migration Notes

- Replace magic strings with `HUB_EVENT_KEYS`
- Avoid `any` and double casts like `as unknown as`; add narrow helpers or adapters instead
- Keep changes atomic and behavior‑preserving (no public API changes)

## Testing Guidance

- Add minimal unit tests for emit/subscribe paths
- Add smoke tests for Streamable HTTP progress routing

## Do / Don’t

Do:

- Use `HUB_EVENT_KEYS` for event names
- Keep adapters thin and local
- Add narrow runtime checks only at external boundaries

Don’t:

- Export Node‑dependent utilities from the hub’s default entry
- Introduce new runtime dependencies for emitter functionality
- Change public event surface or payloads without an explicit RFC
