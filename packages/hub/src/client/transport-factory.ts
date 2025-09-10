import type { ITransport } from '@himorishige/hatago-transport';
import type { Logger } from '../logger.js';
import type { ServerSpec } from '../types.js';
import { getPlatform } from '@himorishige/hatago-runtime';
import { UnsupportedFeatureError } from '../errors.js';

// Build a header-injecting fetch wrapper for remote transports. [REH][SF]
function makeHeaderFetch(headers?: Record<string, string>) {
  if (!headers || Object.keys(headers).length === 0) return undefined;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return async (input: any, init?: RequestInit) => {
    const mergedHeaders = {
      ...(init?.headers instanceof Headers
        ? Object.fromEntries(init.headers.entries())
        : ((init?.headers as Record<string, string> | undefined) ?? {})),
      ...headers
    } as Record<string, string>;
    const nextInit: RequestInit = { ...init, headers: mergedHeaders };
    // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
    return fetch(input, nextInit);
  };
}

// Adapt SDK client transports to Hatago's minimal ITransport without casts. [REH][DM]
type SdkClientTransport = {
  send: (message: unknown) => Promise<void>;
  start: () => Promise<void>;
  close: () => Promise<void>;
  ready?: () => Promise<boolean>;
  onmessage?: (message: unknown) => void;
  onerror?: (error: Error) => void;
};

function wrapSdkTransport(sdk: SdkClientTransport): ITransport {
  return {
    send: (m) => sdk.send(m),
    onMessage: (handler) => {
      sdk.onmessage = handler;
    },
    onError: (handler) => {
      sdk.onerror = handler;
    },
    start: () => sdk.start(),
    close: () => sdk.close(),
    ready: () => (typeof sdk.ready === 'function' ? sdk.ready() : Promise.resolve(true))
  };
}

function isSdkTransport(obj: unknown): obj is SdkClientTransport {
  if (typeof obj !== 'object' || obj === null) return false;
  const o = obj as Record<string, unknown>;
  return (
    typeof o.send === 'function' && typeof o.start === 'function' && typeof o.close === 'function'
  );
}

/**
 * Returns a factory that constructs the appropriate transport for a server spec. [SF][CA]
 */
export function createTransportFactory(
  id: string,
  spec: ServerSpec,
  logger: Logger
): () => Promise<ITransport> {
  return async () => {
    if (spec.command) {
      const platform = getPlatform();
      if (!platform.capabilities.hasProcessSpawn) {
        throw new UnsupportedFeatureError(
          `Local MCP servers are not supported in this environment. Server "${id}" requires process spawning capability.`
        );
      }
      const transportModule = await import('@himorishige/hatago-transport/stdio');
      const { StdioClientTransport } = transportModule;
      logger.debug(`Creating StdioClientTransport for ${id}`, {
        command: spec.command,
        args: spec.args
      });
      const sdk = new StdioClientTransport({
        command: spec.command,
        args: spec.args ?? [],
        env: spec.env,
        cwd: spec.cwd
      });
      if (!isSdkTransport(sdk)) {
        throw new Error('Incompatible StdioClientTransport implementation');
      }
      return wrapSdkTransport(sdk);
    }

    if (spec.url && (spec.type === 'sse' || spec.type === 'http')) {
      logger.debug(`Creating SSEClientTransport for ${id}`, { url: spec.url });
      // Use SSE client for both 'sse' and 'http' in hub
      const { SSEClientTransport } = await import('@himorishige/hatago-transport');
      const sdk = new SSEClientTransport(new URL(spec.url), {
        fetch: makeHeaderFetch(spec.headers)
      });
      if (!isSdkTransport(sdk)) {
        throw new Error('Incompatible SSEClientTransport implementation');
      }
      return wrapSdkTransport(sdk);
    }

    if (spec.url && spec.type === 'streamable-http') {
      const { StreamableHTTPClientTransport } = await import(
        '@modelcontextprotocol/sdk/client/streamableHttp.js'
      );
      logger.debug(`Creating StreamableHTTPClientTransport for ${id}`, { url: spec.url });
      const sdk = new StreamableHTTPClientTransport(new URL(spec.url), {
        fetch: makeHeaderFetch(spec.headers)
      });
      if (!isSdkTransport(sdk)) {
        throw new Error('Incompatible StreamableHTTPClientTransport implementation');
      }
      return wrapSdkTransport(sdk);
    }

    throw new Error(`Invalid server specification for ${id}`);
  };
}
