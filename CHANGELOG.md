# Changelog

All notable changes to Hatago MCP Hub will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.0.9] - 2025-09-06

### Added

- CLI: `--env-file <path...>` to load environment variables before config parsing, and `--env-override` to overwrite existing values. Supports `KEY=VALUE` / `export KEY=VALUE`, `#` comments, quotes stripping, `\n/\r/\t` escapes, `~/` path expansion. [DM][SF][ISA]

### Changed

- Startup UX: Eager servers now connect in parallel; per‑server `tools/list_changed` is suppressed during startup and a single notification is sent after all connections complete. [PA][SF]
- HTTP mode: The first `tools/list` waits briefly (up to 3s) while startup completes to accommodate clients that only fetch once. [REH]

### Fixed

- Remote auth headers: Pass `headers` to remote transports (SSE/HTTP/StreamableHTTP) via a fetch wrapper so `Authorization` reliably reaches the endpoint. Fixes 401 "Missing Authorization header" on some providers. [SFT][REH]
- Error output: Environment‑variable validation and config‑load failures now print concise messages (no stack) in the CLI, while internal logging preserves the `(message, Error)` signature expected by tests. [REH][RP]

### Docs

- README/README.ja and package README updated with `--env-file` usage examples and notes. [SD]

### Chore

- Bump all packages to `0.0.9` and align hardcoded versions (hub_version, serverInfo.version, Client.version). [PEC]

## [0.0.8] - 2025-09-06

### Added

- Lightweight `.env` loader in CLI (auto-loads CWD `.env` without external deps). [DM][SF]

### Changed

- Mask `Authorization` header values in connection logs. [SFT]

### Fixed

- Align timeout keys to schema (`requestMs`, `connectMs`, `keepAliveMs`) and stabilize SSE keepalive timing. [REH][ISA]
- ESLint errors in Hub transport constructors fixed by adding safe constructor typing and removing unnecessary assertions. [ISA]

### Chore

- Bump all package versions to `0.0.8`.

## [0.0.7] - 2025-09-06

### Fixed

- STDIO: Queue tools/resources/prompts requests until hub initialization completes so the first `tools/list` returns a complete set for clients that ignore `tools/list_changed` (e.g., Claude Code).

### Chore

- Bump all package versions to `0.0.7` and align hardcoded versions in source (serverInfo/hub_version/CLI printout).

## [0.0.6] - 2025-09-06

### Fixed

- Send `notifications/tools/list_changed` once after startup to ensure clients fetch and display the tool list. (Hotfix)

### Chore

- Bump all package versions to `0.0.6` and align hardcoded versions in source (serverInfo/hub_version).

## [0.0.5] - 2025-09-03

### Fixed

- Configuration inheritance (`extends`) now properly preserves parent properties (#26, #29)
- Hub prioritizes preloaded config to ensure extends processing is applied
- STDIO mode now requires config file and provides clear error message (#28)
- Prevented potential message loss in STDIO mode by setting up listeners before hub initialization (#27)

### Added

- Unit tests for config loading priorities
- Debug/warn logging for config source selection

### Improved

- Code comments and error handling in Hub.start() method
- Enhanced logging for better debugging of configuration loading

## [0.0.4] - 2025-09-03

### Added

- Configuration inheritance via `extends` (single or multiple parents, deep merge with child override)
- Support for preloaded configuration data during hub initialization
- Timeout configuration schema with global defaults and per-server overrides

### Changed

- Moved Node-specific utilities from `@himorishige/hatago-core` to `@himorishige/hatago-server`
- Updated development guidelines to emphasize ESLint usage and environment-specific utility policies

### Fixed

- Correct type casting in `mergeConfigs` to properly handle `unknown`
- Correct MCP server configuration examples (URL path and `npx` args)

### Security

- Enhanced path validation and protection against prototype pollution

### Docs

- Added team development use cases
- Clarified configuration loading priority and type definition for `preloadedConfig`
- Updated credits to include Hono framework
- Refreshed configuration examples and server endpoint usage

### Tests

- Added E2E tests covering handshake, streaming, and tool flows
- Additional unit tests and fixtures

### Chore

- Added `.serena` cache directory to `.gitignore`

### Notes

- Backward compatible. Existing configurations continue to work without changes.

## [0.0.3] - 2025-09-01

### Added

- Timeout controls across transports and hub flows:
  - Connection timeout for server connections (fail fast on connect)
  - Per-request timeout for tool invocations (server-specific or default)
  - Configurable HTTP/SSE keep-alive interval applied by Hub

### Docs

- Configuration Guide: document tag-based filtering (added in 0.0.2) and keep it consistent with CLI options

### Notes

- These changes are backward compatible. If no timeout values are specified, prior defaults apply.

## [0.0.2] - 2025-09-01

### Added

- 🏷️ **Tag-based server filtering**: Filter MCP servers using tags with OR logic
- **Multi-language tag support**: Full support for Japanese tags (e.g., "開発", "本番")
- **CLI --tags option**: New command-line option to specify tags for filtering
  ```bash
  hatago serve --tags dev,test
  hatago serve --tags 開発,テスト
  ```
- **Configuration tags field**: Optional tags array in server configuration
  ```json
  {
    "mcpServers": {
      "server-id": {
        "command": "...",
        "tags": ["dev", "開発"]
      }
    }
  }
  ```

### Changed

- Updated JSON Schema to include tags field definition
- Enhanced Zod schema validation for tags
- Improved hub filtering logic with tag support

### Technical Details

- Tags use OR logic: servers match if they have ANY of the specified tags
- Tags field is optional to maintain backward compatibility
- Tag filtering applies at startup time (not per-request in HTTP mode)
- Full test coverage for tag filtering functionality

## [0.0.1] - 2025-08-31

### Added

- Initial lightweight release with full MCP support
- Simplified architecture (38+ files removed from original design)
- Core functionality in ~500 lines hub implementation
- Multi-transport support (STDIO, HTTP, SSE)
- Hot reload capability with config watching
- Progress notification forwarding
- Internal management tools
- Environment variable expansion
- Claude Code compatible configuration format

### Features

- **Hub Core**: Central coordinator for multiple MCP servers
- **Server Types**: Support for local, NPX, and remote servers
- **Session Management**: Client isolation with independent sessions
- **Tool/Resource/Prompt Registry**: Complete MCP entity management
- **Configuration**: JSON Schema validation with TypeScript types
- **CLI**: Comprehensive command-line interface with subcommands

### Platform Support

- Node.js 20+ (full support)
- Cloudflare Workers (remote servers only)
- Bun/Deno (work in progress)

## [Unreleased]

### Added

- PR6 Phase 1: Soft deprecation for legacy internals in `@himorishige/hatago-hub` (`mcp-server/*`, `security/*`). Warns once per process on legacy imports. [REH][SF]
- CLI: One-line deprecation banner on `hatago serve` (silence with `HATAGO_NO_DEPRECATION_BANNER=1`). [SD]

- PR6 Phase 2 (preview): Default-disable legacy internals behind `HATAGO_PHASE2=1`; allow temporary opt-in via `HATAGO_ENABLE_LEGACY=1`. Detailed docs added. [PEC]

### Environment

- `HATAGO_NO_LEGACY=1` (alias: `HATAGO_LEGACY_BLOCK=1`) blocks legacy imports for CI/tests; `HATAGO_LEGACY_SILENCE=1` silences per-module warnings. [TDT][CMV]
- `HATAGO_PHASE2=1` enables Phase 2 behavior pre-release; `HATAGO_ENABLE_LEGACY=1` temporarily allows legacy during Phase 2. [CMV]

### Docs

- Added `docs/refactoring/pr6-legacy-removal-phase1.md` and updated configuration guide with legacy controls. [SD]
- Added `docs/refactoring/pr6-legacy-removal-phase2.md` describing default-disable and opt-in flags. [SD]
