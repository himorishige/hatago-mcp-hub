# Release Operations Guide (Hatago MCP Hub)

This guide documents a minimal, reliable release workflow using GitHub Releases and npm.
It assumes Release Drafter and a "tag -> auto GitHub Release" workflow are enabled.

## Goals

- Always show the latest version on README and GitHub
- Create a GitHub Release automatically by pushing a `v*` tag
- Safely publish the npm target (currently: `@himorishige/hatago-mcp-hub`)

## Prerequisites

- Protected branch: `main`
- Labels: `feat`, `fix`, `chore`, `docs`, `refactor`, `perf`, `test`, plus `semver:major` when needed
- GitHub Actions enabled:
  - `.github/workflows/release-drafter.yml`
  - `.github/workflows/release.yml`
- Badges in README
  - npm: `@himorishige/hatago-mcp-hub`
  - GitHub Release: `himorishige/hatago-mcp-hub`

## Versioning (SemVer)

- `MAJOR.MINOR.PATCH`
- Breaking change: MAJOR; feature: MINOR; fix: PATCH
- Release notes are drafted from PR labels by Release Drafter (edit as needed)

## Label Conventions (Release Drafter)

- Features: `feat`, `feature`, `semver:minor`
- Fixes: `fix`, `bugfix`, `bug`, `semver:patch`
- Maintenance: `chore`, `refactor`, `deps`
- Docs: `docs`
- Performance: `perf`
- Tests: `test`
- For breaking changes, add `semver:major`

## Standard Flow

1. Work on a branch (Conventional Commits recommended)
2. Open a PR and apply labels
3. Merge to `main` after CI passes
   - Release Drafter updates the draft release notes
4. Decide version, create and push tag
   ```bash
   git pull origin main
   git tag v0.4.0
   git push origin v0.4.0
   ```
5. GitHub Release is created automatically (`release.yml`)
6. Publish to npm (only publishing targets)
   - Current target: `packages/mcp-hub`
   - Verify build/tests/typecheck first
   ```bash
   pnpm -r build && pnpm -r test && pnpm -r typecheck
   cd packages/mcp-hub
   npm publish --access public
   ```

## Pre-Release Flow (optional)

- Use tags like `v0.5.0-rc.1`
- In the Release edit page, check "This is a pre-release"
- For npm pre-release, use `npm publish --tag next`

## Roles & Permissions

- Tags/Releases: repository write permission
- npm publish: maintainer permission (2FA recommended)

## Quick Commands

```bash
pnpm -r build && pnpm -r test && pnpm -r typecheck

git tag vX.Y.Z && git push origin vX.Y.Z

cd packages/mcp-hub && npm publish --access public
```

## Troubleshooting

- No Release created: ensure the tag matches `v*` and check the `release` workflow logs
- Draft not updated: verify labels and that a push to `main` occurred
- npm publish fails: verify `npm whoami`, 2FA, `publishConfig.access=public`, and that `dist` exists

## Notes

- GitHub Releases act as the primary changelog for now. Adopt Changesets later if multi-package publishing becomes common.
