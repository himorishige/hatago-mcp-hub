# @himorishige/hatago-core

Core types and protocol definitions for Hatago MCP Hub.

## Overview

This package provides pure type definitions with no side effects. All implementations should depend on these core types.

## Installation

```bash
npm install @himorishige/hatago-core
```

## Dependency Direction

The dependency flow must be strictly maintained:

```
core → runtime → transport → cli
```

## Contents

- **Types**: Core type definitions for connections, sessions, and registries
- **Errors**: Error codes and severity levels
- **Events**: Event contracts for server lifecycle, discovery, and sessions
- **Protocol**: MCP protocol definitions and constants
- **RPC**: Shared RPC method literals (compile-time coverage)

## RPC Methods (new)

`RpcMethod` is a shared literal union of all RPC method names supported by Hatago. It enables
compile‑time safety for dispatch tables and client/server integrations.

### Importing

```ts
// Preferred: from the main entry
import type { RpcMethod } from '@himorishige/hatago-core';

// Or, subpath types (useful in tooling/monorepos)
import type { RpcMethod } from '@himorishige/hatago-core/types/rpc';
```

### Current methods

```
initialize
tools/list
tools/call
resources/list
resources/read
resources/templates/list
prompts/list
prompts/get
ping
sampling/createMessage
```

When adding a new RPC method, update `RpcMethod` in `packages/core/src/types/rpc.ts`.
Downstream dispatch maps are validated by unit tests to ensure no gaps.

## Usage

```typescript
import { ErrorCode, ConnectionType, EventName } from '@himorishige/hatago-core';

// Use types in your implementation
const connectionType: ConnectionType = 'local';
```

## License

MIT License
