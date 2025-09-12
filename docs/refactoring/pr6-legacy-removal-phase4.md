# PR6: Legacy Removal Roadmap — Phase 4 (Cleanup)

> Target: v0.4.0 (Dec 1, 2025)

Phase 4 completes the cleanup after removal of legacy internals.

## Changes

- Remove ambient legacy types and aliases from `@himorishige/hatago-hub` entry
- Delete temporary ambient mapping files (e.g., `types/management-ambient.d.ts`)
- Purge legacy references from docs, templates, and examples

## Impact

- Types formerly reachable via `@himorishige/hatago-hub` are no longer exported
- Use types directly from `@himorishige/hatago-hub-management/*`

## Migration

```ts
// Before (ambient/types-only via hub)
import type { ManagementServerStateMachine } from '@himorishige/hatago-hub';

// After (explicit)
import type { ServerStateMachine as ManagementServerStateMachine } from '@himorishige/hatago-hub-management/state-machine.js';
```

No runtime flags affect Phase 4; this is a pure cleanup.
