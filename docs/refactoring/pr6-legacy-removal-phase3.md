# PR6: Legacy Removal Roadmap — Phase 3 (Breaking)

> Target: v0.3.0 (Nov 6, 2025)

Phase 3 removes legacy internals from `@himorishige/hatago-hub`:

- Physical removal of `mcp-server/*` and `security/*` implementations
- Thin stub modules remain under the same paths and throw with a clear migration hint at import time
- Root exports from `@himorishige/hatago-hub` are removed (value exports), type-only aliases may remain until Phase 4

## Migration

Replace imports to the new management package:

```diff
- import { ActivationManager } from '@himorishige/hatago-hub';
+ import { ActivationManager } from '@himorishige/hatago-hub-management/activation-manager.js';

- import { IdleManager } from '@himorishige/hatago-hub/mcp-server/idle-manager.js';
+ import { IdleManager } from '@himorishige/hatago-hub-management/idle-manager.js';
```

See also: `packages/hub-management/` for the new implementations.

## Codemod (no dependencies)

Run the built-in codemod to update your project:

```bash
# dry-run first
DRY_RUN=1 node scripts/codemod/legacy-imports.mjs <paths...>

# apply changes
node scripts/codemod/legacy-imports.mjs <paths...>
```

The codemod updates:

- Direct subpath imports: `@himorishige/hatago-hub/(mcp-server|security)/*` → `@himorishige/hatago-hub-management/*`
- Root named imports for specific symbols → per-file management imports

## Compatibility Flags

Phase 2 flags still exist but Phase 3 is breaking by design and cannot be bypassed at runtime.

- `HATAGO_NO_LEGACY=1` still blocks legacy usage in mixed repos (no-op after removal)
- `HATAGO_ENABLE_LEGACY` has no effect in Phase 3

## Notes

- Ambient legacy types will be removed in Phase 4
- CHANGELOG contains a Breaking entry with links to docs and codemod
