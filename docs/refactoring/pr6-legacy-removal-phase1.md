# PR6: Legacy Removal Roadmap — Phase 1

Phase 1 introduces a soft‑deprecation layer for legacy modules under `packages/hub/src/mcp-server/*` and `packages/hub/src/security/*` with safe, opt‑out controls.

## Scope (Phase 1)

- Add once-per-process deprecation warnings when legacy modules are imported.
- Provide ENV flags to block or silence legacy usage without behavior changes by default.
- Prepare migration notes for consumers. No runtime API removals yet.

## ENV Flags

- `HATAGO_NO_LEGACY=1` (alias: `HATAGO_LEGACY_BLOCK=1`) — Throw on legacy module import.
- `HATAGO_NO_DEPRECATION_BANNER=1` — Hide the CLI one-line notice at `hatago serve`.
- `HATAGO_LEGACY_SILENCE=1` — Silence per-module deprecation warnings (optional, mainly for dev).
- Default — Warn once per legacy module import and show a one-line CLI notice.

## Affected Modules

- `packages/hub/src/mcp-server/activation-manager.ts`
- `packages/hub/src/mcp-server/idle-manager.ts`
- `packages/hub/src/mcp-server/metadata-store.ts`
- `packages/hub/src/mcp-server/state-machine.ts`
- `packages/hub/src/security/audit-logger.ts`
- `packages/hub/src/security/file-guard.ts`

## Migration Guidance (Brief)

- Prefer thin hub usage via `HatagoHub` / `EnhancedHatagoHub` without relying on the legacy management submodules.
- If you need management features, consume the SPI exported in `api/management-spi.ts` or the CLI surfaces, not the legacy internals.

### Planned follow-ups

- Phase 2 (v0.2.0, Oct 9, 2025): legacy disabled by default; opt-in via `HATAGO_ENABLE_LEGACY=1`.
- Phase 3 (v0.3.0, Nov 6, 2025): physical removal; thin error stubs + codemod.

## Timeline

- Phase 1 (soft deprecation): target v0.1.0 (Sep 18, 2025). Warn by default.
- Phase 2+: introduce stubs/codemods and remove ambient legacy types.
- Final removal: in a later minor, after migration window.
