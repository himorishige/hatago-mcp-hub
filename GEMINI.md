# Hatago MCP Hub

Always Japanese.

## Project Overview

This repository contains the source code for **Hatago MCP Hub**, a lightweight, multi-runtime hub server for the Model Context Protocol (MCP). It allows developers to connect multiple MCP servers (local, remote, or even dynamically loaded via NPX) and expose them as a single, unified endpoint for AI development tools like Claude Code, Cursor, and VS Code.

The project is a TypeScript monorepo managed with `pnpm`. It is designed to be modular and extensible, with a core hub and separate packages for the CLI, server, runtime components, and transport protocols. The server is built using the [Hono](https://hono.dev/) web framework, and it uses [Zod](https://zod.dev/) for robust configuration and data validation.

Key features include:

- **Multi-transport support:** STDIO, HTTP, SSE, and WebSockets.
- **Dynamic server management:** Add, remove, and manage MCP servers on the fly.
- **Hot-reloading:** Automatically reloads the configuration when the `hatago.config.json` file changes.
- **Progress notifications:** Real-time progress updates for long-running operations.
- **Multi-runtime support:** Designed to run on Node.js, Cloudflare Workers, Deno, and Bun.

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

The easiest way to run the Hatago Hub server is to use the CLI. You can start the server with the following command:

```bash
npx @hatago/cli serve
```

This will start the hub server with the default configuration. You can also specify a configuration file:

```bash
npx @hatago/cli serve --config hatago.config.json
```

For development, you can run the server in watch mode to automatically restart it when files change:

```bash
cd packages/server
pnpm dev
```

### Running Tests

To run the test suite for all packages, use the following command from the root directory:

```bash
pnpm test
```

## Development Conventions

### Code Style and Linting

This project uses [Biome](https://biomejs.dev/) for linting and formatting. The following commands are available in the root `package.json`:

- `pnpm format`: Formats all files in the project.
- `pnpm lint`: Lints all files in the project.
- `pnpm check`: Runs both linting and type-checking.

### Testing

The project uses [Vitest](https://vitest.dev/) for unit and integration tests. Test files are located alongside the source files they are testing, with a `.test.ts` extension.

### Monorepo Structure

The project is organized as a pnpm monorepo with the following structure:

- `packages/`: Contains the individual packages of the project.
  - `@hatago/cli`: The command-line interface.
  - `@hatago/core`: Core types and schemas.
  - `@hatago/hub`: The main hub implementation.
  - `@hatago/runtime`: Runtime components like the session manager and tool registry.
  - `@hatago/server`: The server implementation, built with Hono.
  - `@hatago/transport`: Transport protocol implementations (STDIO, HTTP, etc.).
- `examples/`: Contains example projects that use Hatago.
- `docs/`: Contains documentation, including the project's architecture.
