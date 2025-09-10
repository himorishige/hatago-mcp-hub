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

describe('StreamableHTTPTransport (SSE/HTTP bridge smoke)', () => {
  it('routes notifications/progress to SSE stream when POST has progressToken', async () => {
    const transport = new StreamableHTTPTransport();
    await transport.start();

    const sse = new FakeSSEStream();
    const headers = { accept: 'text/event-stream' } as Record<string, string>;
    const progressToken = 'pt-1';

    // Simulate upstream server: on tools/call request, send a progress first, then a response
    transport.onmessage = (message: JSONRPCMessage) => {
      const req = message as {
        id?: number | string;
        method?: string;
        params?: { _meta?: { progressToken?: string } };
      };
      if (req.method === 'tools/call') {
        const token = req.params?._meta?.progressToken ?? progressToken;
        // Fire progress, then respond
        void transport.sendProgressNotification(token, 10, 100, 'start');
        void transport.send({
          jsonrpc: '2.0',
          id: (req.id ?? 1) as number,
          result: { ok: true }
        } as JSONRPCMessage);
      }
    };

    // Register SSE stream for this request and bind token → stream mapping
    await transport.handleHttpRequest(
      'POST',
      headers,
      {
        jsonrpc: '2.0',
        id: 1,
        method: 'tools/call',
        params: { _meta: { progressToken } }
      },
      sse as any
    );

    // Emit a progress notification and expect it to be written to the SSE stream
    await transport.sendProgressNotification(progressToken, 10, 100, 'start');

    const payloads = sse.messages
      .filter((m) => m.startsWith('data: '))
      .map((m) => JSON.parse(m.replace(/^data: /, '').trim()));

    const progressMsg = payloads.find((p) => p?.method === 'notifications/progress');
    expect(progressMsg).toBeDefined();
    expect(progressMsg.params.progressToken).toBe(progressToken);
    expect(progressMsg.params.progress).toBe(10);
    expect(progressMsg.params.total).toBe(100);
    expect(progressMsg.params.message).toBe('start');
  }, 10000);
});
