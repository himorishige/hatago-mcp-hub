import { describe, it, expect } from 'vitest';
import { HatagoHub } from '../hub.js';

describe('HTTP handler (smoke)', () => {
  it('returns JSON-RPC error for unknown method', async () => {
    const hub = new HatagoHub();
    const req = new Request('http://localhost/mcp', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'unknown/method', params: {} })
    });

    const res = await hub.handleHttpRequest(req);
    expect(res.status).toBe(200);
    const body = (await res.json()) as { jsonrpc: string; id: number; error?: { code: number } };
    expect(body.jsonrpc).toBe('2.0');
    expect(body.id).toBe(1);
    expect(body.error?.code).toBe(-32601);
  });
});
