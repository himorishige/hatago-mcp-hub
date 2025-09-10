import { describe, it, expect } from 'vitest';
import { StreamableHTTPTransport } from '@himorishige/hatago-transport';
import type { JSONRPCMessage } from '@modelcontextprotocol/sdk/types.js';

class FakeSSEStream {
  closed = false;
  messages: string[] = [];
  onAbortCb: (() => void) | undefined;
  async write(data: string) {
    this.messages.push(data);
  }
  async close() {
    this.closed = true;
  }
  onAbort(cb: () => void) {
    this.onAbortCb = cb;
  }
}

describe('StreamableHTTPTransport cleanup', () => {
  it('cleans progress token mapping on abort', async () => {
    const transport = new StreamableHTTPTransport();
    await transport.start();

    // Simulate upstream: respond quickly when request arrives
    transport.onmessage = (message: JSONRPCMessage) => {
      const req = message as {
        id?: number | string;
        method?: string;
        params?: { _meta?: { progressToken?: string } };
      };
      if (req.method === 'tools/call') {
        const token = req.params?._meta?.progressToken ?? 'tok';
        void transport.sendProgressNotification(token, 1);
        void transport.send({
          jsonrpc: '2.0',
          id: (req.id ?? 1) as number,
          result: { ok: true }
        } as JSONRPCMessage);
      }
    };

    const sse = new FakeSSEStream();
    const headers = { accept: 'text/event-stream' } as Record<string, string>;
    const progressToken = 'tok-99';

    await transport.handleHttpRequest(
      'POST',
      headers,
      { jsonrpc: '2.0', id: 1, method: 'tools/call', params: { _meta: { progressToken } } },
      sse as any
    );

    // Progress should be routed at least once (from onmessage handler)
    const payloadsBefore = sse.messages
      .filter((m) => m.startsWith('data: '))
      .map((m) => JSON.parse(m.replace(/^data: /, '').trim()));
    const hadProgress = payloadsBefore.some((p) => p?.method === 'notifications/progress');
    expect(hadProgress).toBe(true);

    // Abort connection and ensure mapping is cleared
    sse.onAbortCb?.();
    const beforeAbort = sse.messages.length;
    await transport.sendProgressNotification(progressToken, 10);
    const after = sse.messages.length;
    expect(after).toBe(beforeAbort); // no new writes after abort
  }, 10000);
});
