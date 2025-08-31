# Hatago MCP Hub

Always Japanese.

## Project Overview

This repository contains the source code for **Hatago MCP Hub**, a lightweight, multi-runtime hub server for the Model Context Protocol (MCP). It allows developers to connect multiple MCP servers (local, remote, or even dynamically loaded via NPX) and expose them as a single, unified endpoint for AI development tools like Claude Code, Cursor, and VS Code.

The project is a TypeScript monorepo managed with `pnpm`. It is designed to be modular and extensible, with a core hub and separate packages for the CLI, server, runtime components, and transport protocols. The server is built using the [Hono](https://hono.dev/) web framework, and it uses [Zod](https://zod.dev/) for robust configuration and data validation. The main package is published as `@himorishige/hatago-mcp-hub`.

Key features include:

- **Multi-transport support:** STDIO, HTTP, SSE, and WebSockets.
- **Dynamic server management:** Add, remove, and manage MCP servers on the fly.
- **Hot-reloading:** Automatically reloads the configuration when the `hatago.config.json` file changes.
- **Progress notifications:** Real-time progress updates for long-running operations.
- **Multi-runtime support:** Designed to run on Node.js and Cloudflare Workers.
- **Internal management tools:** Provides tools like `_internal_hatago_status` to check server status.

## Building and Running

### Prerequisites

- Node.js (version 20 or higher)
- pnpm

### Installation

1.  Clone the repository:

    ```bash
    git clone https://github.com/himorishige/hatago-hub.git
    cd hatago-hub
    ```

2.  Install dependencies:
    ```bash
    pnpm install
    ```

### Building the Project

To build all the packages in the monorepo, run the following command from the root directory:

```bash
pnpm -r build
```

### Running the Hub Server

The easiest way to run the Hatago Hub server is to use the main package via npx.

```bash
# Serve with default configuration
npx @himorishige/hatago-mcp-hub serve

# Specify a configuration file
npx @himorishige/hatago-mcp-hub serve --config hatago.config.json
```

For development, you can run the server in watch mode to automatically restart it when files change:

```bash
# From the root directory
npx . serve --http --watch

# Or from the package directory
cd packages/mcp-hub
pnpm dev
```

### Running Tests

To run the test suite for all packages, use the following command from the root directory:

```bash
pnpm test
```

## Development Conventions

### Code Style and Linting

This project uses [ESLint](https://eslint.org/) for linting and [Prettier](https://prettier.io/) for formatting. The following commands are available in the root `package.json`:

- `pnpm format`: Formats all files in the project.
- `pnpm lint`: Lints all files in the project.
- `pnpm check`: Runs both formatting checks, linting, and type-checking.

### Testing

The project uses [Vitest](https://vitest.dev/) for unit and integration tests. Test files are located alongside the source files they are testing, with a `.test.ts` extension.

### Monorepo Structure

The project is organized as a pnpm monorepo with the following structure:

- `packages/`: Contains the individual packages of the project.
  - `@himorishige/hatago-mcp-hub`: The main package published to npm.
  - `@himorishige/hatago-server`: The server implementation, built with Hono.
  - `@himorishige/hatago-hub`: The core hub implementation.
  - `@himorishige/hatago-runtime`: Runtime components like session and registry management.
  - `@himorishige/hatago-transport`: Transport protocol implementations (STDIO, HTTP, etc.).
  - `@himorishige/hatago-core`: Core types, schemas, and interfaces.
  - `@himorishige/hatago-cli`: CLI commands (currently in development).
- `schemas/`: Contains JSON Schema definitions for configuration files.
- `examples/`: Contains example projects that use Hatago.
- `docs/`: Contains documentation, including the project's architecture.
