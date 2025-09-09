import { describe, it, expect, vi } from 'vitest';
import { StreamableHTTPTransport } from './streamable-http/streamable-http-transport.js';

function makeSseStub() {
  const writes: string[] = [];
  return {
    stub: {
      closed: false,
      write: vi.fn(async (data: string) => {
        writes.push(data);
      }),
      close: vi.fn(async () => {
        /* noop */
      })
    },
    getWrites: () => writes
  } as const;
}

describe('StreamableHTTPTransport helpers (smoke)', () => {
  it('send() writes responses to mapped stream', async () => {
    const t = new StreamableHTTPTransport();
    await t.start();
    const { stub, getWrites } = makeSseStub();
    const streamId = 's1';
    // @ts-expect-error private access in test
    t.streamMapping.set(streamId, { stream: stub, createdAt: Date.now() });
    // Map request id to stream
    // @ts-expect-error private access in test
    t.requestToStreamMapping.set(1, streamId);

    // Response message path
    await t.send({ jsonrpc: '2.0', id: 1, result: {} } as any);
    expect(getWrites().join('')).toContain('"id":1');
  });

  it('broadcasts notifications to all streams', async () => {
    const t = new StreamableHTTPTransport();
    await t.start();
    const a = makeSseStub();
    const b = makeSseStub();
    // @ts-expect-error private
    t.streamMapping.set('a', { stream: a.stub, createdAt: Date.now() });
    // @ts-expect-error private
    t.streamMapping.set('b', { stream: b.stub, createdAt: Date.now() });

    await t.send({ jsonrpc: '2.0', method: 'foo', params: {} } as any);
    expect(a.getWrites().length).toBeGreaterThan(0);
    expect(b.getWrites().length).toBeGreaterThan(0);
  });

  it('routes progress notifications by token', async () => {
    const t = new StreamableHTTPTransport();
    await t.start();
    const { stub, getWrites } = makeSseStub();
    // @ts-expect-error private
    t.streamMapping.set('x', { stream: stub, createdAt: Date.now() });
    // @ts-expect-error private
    t.progressTokenToStream.set('tok', 'x');

    await t.send({
      jsonrpc: '2.0',
      method: 'notifications/progress',
      params: { progressToken: 'tok', progress: 1 }
    } as any);

    expect(getWrites().join('')).toContain('"notifications/progress"');
  });
});
