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
      return new StdioClientTransport({
        command: spec.command,
        args: spec.args ?? [],
        env: spec.env,
        cwd: spec.cwd
      }) as unknown as ITransport;
    }

    if (spec.url && (spec.type === 'sse' || spec.type === 'http')) {
      logger.debug(`Creating SSEClientTransport for ${id}`, { url: spec.url });
      // Use SSE client for both 'sse' and 'http' in hub
      type TransportCtor = new (url: URL, options?: { fetch?: typeof fetch }) => ITransport;
      const { SSEClientTransport } = await import('@himorishige/hatago-transport');
      const Ctor = SSEClientTransport as unknown as TransportCtor;
      return new Ctor(new URL(spec.url), {
        fetch: makeHeaderFetch(spec.headers)
      }) as unknown as ITransport;
    }

    if (spec.url && spec.type === 'streamable-http') {
      const { StreamableHTTPClientTransport } = await import(
        '@modelcontextprotocol/sdk/client/streamableHttp.js'
      );
      logger.debug(`Creating StreamableHTTPClientTransport for ${id}`, { url: spec.url });
      type StreamableCtor = new (url: URL, options?: { fetch?: typeof fetch }) => ITransport;
      const StreamCtor = StreamableHTTPClientTransport as unknown as StreamableCtor;
      return new StreamCtor(new URL(spec.url), {
        fetch: makeHeaderFetch(spec.headers)
      }) as unknown as ITransport;
    }

    throw new Error(`Invalid server specification for ${id}`);
  };
}
