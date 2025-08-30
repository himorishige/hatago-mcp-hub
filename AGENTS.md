# Repository Guidelines

Always Japanese.

## Project Structure & Module Organization
- Monorepo managed by `pnpm`.
- `packages/`: publishable workspaces (`@hatago/*`) such as `core`, `runtime`, `transport`, `hub`, `server`, and `cli`.
- `examples/`: runnable samples (Node, Workers) demonstrating usage.
- `docs/`: architecture and configuration guides.
- `schemas/`: JSON schema and example config (`schemas/config.schema.json`).

## Build, Test, and Development Commands
- Install deps: `pnpm install`
- Build all packages: `pnpm -r build`
- Type check all: `pnpm -r typecheck` or root `pnpm check`
- Lint all (Biome): `pnpm lint` or `pnpm biome:lint`
- Format: `pnpm format` (Prettier for docs + Biome format)
- Run tests: `pnpm -r test` (Vitest). Example single pkg: `cd packages/hub && pnpm test`
- Watch dev (per package): `pnpm dev` (e.g., `packages/cli`, `packages/server`)

## Coding Style & Naming Conventions
- Language: TypeScript (ESM), Node.js ≥ 20.
- Formatting: Biome + Prettier. Use single quotes and 2‑space indentation.
- TS config: strict mode; avoid non‑null assertions and `any` where possible.
- Filenames: kebab-case (e.g., `sse-manager.ts`, `file-guard.ts`).
- Keep modules small and typed; colocate types near usage when practical.

## Testing Guidelines
- Framework: Vitest.
- Location: colocate tests with sources as `*.test.ts` (e.g., `packages/hub/src/hub.test.ts`).
- Scope: prefer unit tests per package; add integration tests in package owning behavior.
- Run locally: `pnpm -r test`; add focused runs within the target package.

## Commit & Pull Request Guidelines
- Commit style follows Conventional Commits used in this repo: `feat:`, `fix:`, `docs:`, `chore:`, `refactor:`, `style:`.
- Keep commits atomic and descriptive (imperative mood). Reference issues (`#123`) where applicable.
- PRs: include a clear description, rationale, testing notes, and updated docs/examples when behavior changes.

## Security & Configuration Tips
- Do not commit secrets. Prefer env vars and reference expansion supported in configs (`${VAR}` / `${VAR:-default}`).
- Validate configs against `schemas/config.schema.json` during development.
- For architecture, read `docs/ARCHITECTURE.md`; for options, see `docs/configuration.md`.
