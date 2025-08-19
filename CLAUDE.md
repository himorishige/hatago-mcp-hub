# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Hatago MCP Hub is a lightweight MCP (Model Context Protocol) Hub server built on top of Hono and hono/mcp. It provides unified management for multiple MCP servers with tool name collision avoidance and session management.

## Tech Stack

- **Runtime**: Node.js 20+
- **Language**: TypeScript with ESM modules
- **Web Framework**: Hono
- **Build Tool**: tsdown
- **Test Framework**: Vitest
- **Linter/Formatter**: Biome
- **Package Manager**: pnpm

## Project Structure

```
/
├── app/                 # Main application
│   ├── src/
│   │   └── index.ts    # Entry point (Hono server on port 3000)
│   ├── package.json    
│   ├── tsconfig.json   
│   ├── biome.jsonc     
│   └── vitest.config.ts
└── docs/               # Documentation
    └── spec-v0.0.1.md  # Specification
```

## Essential Development Commands

All commands should be run in the `app/` directory:

```bash
# Development
pnpm dev          # Start dev server with watch mode
pnpm build        # Build to dist/
pnpm start        # Start production server

# Code Quality - Run these after making changes
pnpm format       # Format code
pnpm lint         # Lint with auto-fix
pnpm check        # Format + Lint + Type check

# Testing
pnpm test         # Run tests
pnpm coverage     # Run tests with coverage
```

## Code Style Guidelines

- **Quotes**: Single quotes (')
- **Indentation**: 2 spaces
- **File naming**: kebab-case
- **MCP tool names**: snake_case (per MCP spec)
- **TypeScript**: Strict mode enabled
- **Imports**: Automatically organized by Biome

## MCP Implementation Notes

- Server runs on port 3000
- Session management uses `mcp-session-id` header
- Tool naming follows MCP specification (snake_case)
- Error responses follow JSON-RPC 2.0 format

## Development Phases

Currently implementing:
- **Phase 0**: Tool collision avoidance, session management, config hot-swap
- **Phase 1**: Remote MCP proxy (HTTP/SSE), CLI management
- **Phase 2**: npx-based MCP proxy support

## Working with this Codebase

1. Always run code quality checks after changes: `pnpm format && pnpm lint`
2. Verify build succeeds: `pnpm build`
3. Follow Hono patterns for routing and middleware
4. Maintain MCP specification compliance for tool names and session handling
5. Keep the codebase simple and lightweight - this is a thin wrapper, not a framework