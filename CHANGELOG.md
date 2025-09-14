# Changelog

All notable changes to Hatago MCP Hub will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.0.15] - 2025-09-14

### Changed

- **Registry & Router Simplification**: Major refactoring aligned with Hatago's "thin implementation" philosophy
  - ToolRegistry: 65% code reduction (361→128 lines)
  - Router: 69% code reduction (333→102 lines)
  - ResourceRegistry: 17% code reduction (178→147 lines)
- **Naming Strategy**: Simplified to single `serverId_toolName` format
  - Removed 6 complex naming strategies (none, prefix, suffix, namespace, custom, hybrid)
  - Collision handling now uses first-come-first-served approach
- **Architecture**: Removed unused files and complex abstractions
  - Deleted router-functional.ts, router-types.ts, types.ts, naming-strategy.ts
  - Total ~1000 lines of code removed

### Technical Improvements

- Simplified tool name generation to basic prefixing
- Removed statistics and metrics tracking from Router
- Changed ResourceRegistry from factory pattern to class-based
- All 402 tests passing after refactoring

## [0.0.14] - 2025-09-14

### Performance Improvements

- **8.44x faster startup**: 85.66ms → 10.14ms
- **17% package size reduction**: 1.04MB → 854KB (181KB saved)
- **Simplified architecture**: Removed EnhancedHub and management layers

### Breaking Changes

- **Removed built-in config watching**: `--watch` flag no longer available
  - Use external tools like nodemon or PM2 for auto-reload
  - See MIGRATION.md for detailed migration guide

### Changed

- Hub: Simplified to basic implementation without state machines [SF]
- Architecture: Removed activation manager, idle manager, metadata store [DM]
- Performance: Direct server management without abstraction layers [PA]
- Transport Layer: RelayTransport is now the default implementation [SF][DM]
- Architecture: Removed all feature flags (HATAGO_THIN_TRANSPORT, HATAGO_THIN_RUNTIME) [SF]
- Type Safety: Improved type definitions and removed unsafe `as any` casts [CA][ISA]

### Added

- MIGRATION.md: Comprehensive migration guide from v0.0.13 [SD]
- PERFORMANCE.md: Detailed performance benchmarks and improvements [SD]
- Documentation: Updated all docs to reflect removed features [SD]

### Fixed

- MDX build errors in documentation site
- Removed problematic HotReloadAlternatives export

### Technical Improvements

- Renamed `thin-adapter.ts` to `relay-transport.ts` for clarity
- Renamed `StreamableHttpAdapter` class to `RelayTransport`
- Fixed method overloads in RelayTransport for proper JSONRPC message handling
- Resolved all lint errors without using eslint-disable comments [CA]

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
