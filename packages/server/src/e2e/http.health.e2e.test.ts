/**
 * HTTP /health smoke test (no real socket bind)
 * - Mocks @hono/node-server.serve to capture the fetch handler
 * - Calls the handler directly for GET /health
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Logger } from '../logger.js';

// Capture point for the fetch handler passed to serve()
let capturedFetch: ((req: Request) => Promise<Response>) | undefined;

// Mock @hono/node-server to avoid opening a real port
vi.mock('@hono/node-server', async () => {
  return {
    serve: (opts: {
      fetch: (req: Request) => Promise<Response>;
      port: number;
      hostname: string;
    }) => {
      capturedFetch = opts.fetch;
      // Fake Node server (minimal)
      const fakeServer = {
        on: (_ev: string, _fn: (..._a: unknown[]) => void) => {},
        close: (cb: () => void) => cb()
      };
      // Return with `.server` for normalization
      return {
        server: fakeServer,
        address() {
          return {
            port: opts.port,
            address: opts.hostname
          } as unknown as import('node:net').AddressInfo;
        }
      } as unknown as { server: { on: Function; close: Function } };
    }
  };
});

// Import after mocking
const { startHttp } = await import('../http.js');
const { Logger: ServerLogger } = await import('../logger.js');

describe('server/http /health (smoke)', () => {
  let logger: Logger;

  beforeEach(() => {
    capturedFetch = undefined;
    logger = new ServerLogger('silent');
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('returns healthy JSON at /health', async () => {
    await startHttp({
      config: { path: 'ignored.json', data: { mcpServers: {} } as any },
      host: '127.0.0.1',
      port: 0,
      logger,
      watchConfig: false
    });

    expect(capturedFetch).toBeTypeOf('function');

    const res = await capturedFetch!(new Request('http://localhost/health'));
    expect(res.ok).toBe(true);
    const json = (await res.json()) as any;
    expect(json.status).toBe('healthy');
    expect(json.mode).toBe('http');
  });
});
