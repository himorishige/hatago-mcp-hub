/**
 * Smoke test for progress notification forwarding (upstream path up to onNotification)
 */

import { describe, expect, it, vi } from 'vitest';
import { HatagoHub } from './hub.js';

describe('HatagoHub progress forwarding (pre-route)', () => {
  it('forwards notifications/progress to onNotification during tools/call', async () => {
    const hub = new HatagoHub();

    // Prepare transport (must be started to avoid send() throwing)
    const transport = hub.getStreamableTransport();
    await transport?.start();

    // Spy on parent notification
    const onNotification = vi.fn(async () => {});
    hub.onNotification = onNotification;

    // Stub a client that triggers onprogress
    const client: any = {
      callTool: async (_req: any, _unused: any, opts: any) => {
        // Emit a couple of progress updates
        await opts.onprogress({ progress: 10, total: 100, message: 'start' });
        await opts.onprogress({ progress: 100, total: 100, message: 'done' });
        return { content: [{ type: 'text', text: 'ok' }] };
      }
    };

    // Register fake server and client
    (hub as any).servers.set('s1', {
      id: 's1',
      spec: {},
      tools: [],
      resources: [],
      prompts: [],
      status: 'active'
    });
    (hub as any).clients.set('s1', client);

    // Invoke tools/call via internal request handler with progressToken
    const msg = {
      jsonrpc: '2.0',
      id: '1',
      method: 'tools/call',
      params: {
        name: 's1_test',
        arguments: {},
        _meta: { progressToken: 'pt-1' }
      }
    } as any;

    await (hub as any).handleJsonRpcRequest(msg);

    // Verify forwarding to onNotification
    expect(onNotification).toHaveBeenCalled();
    const calls = onNotification.mock.calls.map((c) => c[0]);
    expect(calls.some((n: any) => n.method === 'notifications/progress')).toBe(true);
    const first = calls.find((n: any) => n.method === 'notifications/progress');
    expect(first?.params?.progressToken).toBe('pt-1');
  });
});
