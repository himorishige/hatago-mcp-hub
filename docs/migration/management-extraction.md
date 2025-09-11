# Management Extraction Migration Guide

Hatago Hub management components have been externalized into `@himorishige/hatago-hub-management`.

- New imports (recommended):
  - `@himorishige/hatago-hub-management/state-machine.js`
  - `@himorishige/hatago-hub-management/activation-manager.js`
  - `@himorishige/hatago-hub-management/idle-manager.js`
  - `@himorishige/hatago-hub-management/metadata-store.js`
  - `@himorishige/hatago-hub-management/audit-logger.js`

In-repo counterparts under `@himorishige/hatago-hub` remain for backwards compatibility but are deprecated.

## Rationale

This reduces the Hub runtime to a thinner relay and isolates stateful management features.

## Steps

1. Add dependency: `pnpm add @himorishige/hatago-hub-management`.
2. Switch imports to the package subpaths listed above.
3. Build order (monorepo): hub-management → hub → mcp-hub.

## Notes

- Subpath imports ensure Node ESM resolves to concrete files without package root entry.
- If bundling, mark the package as external; resolve at runtime via node_modules.
