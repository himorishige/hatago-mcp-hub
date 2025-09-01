# Changelog

All notable changes to Hatago MCP Hub will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

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
