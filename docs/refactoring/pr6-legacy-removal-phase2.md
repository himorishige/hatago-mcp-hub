# PR6: Legacy Removal Roadmap — Phase 2 (Preview)

Phase 2 switches legacy modules under `@himorishige/hatago-hub` to be disabled by default. Consumers must explicitly opt‑in to keep them working during the migration window.

> Timeline: v0.2.0 (Oct 9, 2025)

## Behavior

- Default: Importing legacy modules throws with a clear migration hint.
- Opt‑in: Set `HATAGO_ENABLE_LEGACY=1` to temporarily allow legacy modules.
- CI strict mode: `HATAGO_NO_LEGACY=1` (alias of Phase 1) always blocks legacy, regardless of opt‑in.

## Preview Toggle (pre‑release)

- Set `HATAGO_PHASE2=1` to enable Phase 2 behavior before v0.2.0. This allows teams to test and fix imports early.

## Environment Variables

- `HATAGO_ENABLE_LEGACY=1` — Temporarily allow legacy modules.
- `HATAGO_PHASE2=1` — Enable Phase 2 behavior pre‑release (default from v0.2.0).
- `HATAGO_NO_LEGACY=1` — Force block legacy (CI/tests). Takes precedence.
- `HATAGO_NO_DEPRECATION_BANNER=1` — Hide the one‑line CLI notice.
- `HATAGO_LEGACY_SILENCE=1` — Silence per‑module warnings (when not blocked).

## Migration Hints

When a legacy module is used, logs include a suggested target, e.g.:

```
Legacy module in use: mcp-server:activation-manager (soft-deprecated). Migration -> @himorishige/hatago-hub-management/activation-manager.js
```

## Next Steps

- v0.3.0 (Nov 6, 2025): remove legacy implementations, ship thin error stubs + codemod.
- v0.4.0+: remove ambient legacy types, purge old references from docs and templates.
