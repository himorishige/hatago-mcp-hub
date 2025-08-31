# Contributing to Hatago

Thanks for your interest in contributing! This repo is a pnpm‑managed TypeScript monorepo targeting Node.js ≥ 20.

Please read and follow this guide to keep contributions smooth and enjoyable for everyone.

## Code of Conduct

By participating, you agree to abide by our [Code of Conduct](./CODE_OF_CONDUCT.md).

## Getting Started

- Prerequisites: Node 20+, pnpm installed (`npm i -g pnpm`)
- Install deps: `pnpm install`
- Build all packages: `pnpm -r build`
- Type check: `pnpm -r typecheck` or `pnpm check`
- Lint: `pnpm lint` (Biome) / Format: `pnpm format`
- Tests: `pnpm -r test` (Vitest)
- Package dev: `cd packages/<name> && pnpm dev`

Project layout:

- `packages/`: publishable workspaces like `core`, `runtime`, `transport`, `hub`, `server`, `cli`
- `examples/`: runnable samples (Node, Workers)
- `docs/`: architecture and configuration docs
- `schemas/`: JSON schema and example configs

## Development Guidelines

- Language: TypeScript (ESM), strict mode, avoid `any` and non‑null assertions
- Style: Biome + Prettier; single quotes; 2‑space indentation
- Tests: co‑locate as `*.test.ts` near sources (Vitest)
- Architecture: Keep modules small, typed, and reusable; colocate types near usage
- Error handling: Prefer typed, explicit errors and helpful messages

## Commit Style

Use Conventional Commits:

```
feat(scope): add streaming transport

Explain what and why. Reference issues like #123 when relevant.
```

Types: `feat`, `fix`, `docs`, `style`, `refactor`, `perf`, `test`, `chore`.

## Pull Requests

- Keep PRs small and focused (one logical change)
- Include rationale, testing notes, and docs updates when behavior changes
- Ensure CI passes: build, typecheck, lint, and tests
- Link related issues and mention breaking changes clearly

## Security

Please report vulnerabilities privately. See [SECURITY.md](./SECURITY.md).

## Release & Publishing

Packages under `packages/*` are published to npm as public packages under the `@hatago/*` scope. General checklist:

- Ensure package has `license: MIT`, correct `name`, `version`, `repository`, and `files`/`exports`
- Run `pnpm -r build` and `pnpm -r test`
- Verify README and docs for the package are up to date
- Use CI to publish or run `npm publish --access public` from the package directory (pnpm users can run `pnpm publish --access public`)

## Communication

Questions or ideas? Open a discussion or issue. Be kind and specific.

Thanks for contributing!
