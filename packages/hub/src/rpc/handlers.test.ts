import { describe, it, expect, vi } from 'vitest';
import { HatagoHub } from '../hub.js';
import { handleToolsList, handlePing } from './handlers.js';

describe('rpc handlers (smoke)', () => {
  it('handlePing returns empty result with same id', () => {
    const res = handlePing(123);
    expect(res).toEqual({ jsonrpc: '2.0', id: 123, result: {} });
  });

  it('handleToolsList returns tools array shape', async () => {
    const hub = new HatagoHub();
    // no tools registered yet
    const res = await handleToolsList(hub as unknown as never, 1);
    expect(res.jsonrpc).toBe('2.0');
    expect(res.id).toBe(1);
    expect(res.result).toHaveProperty('tools');
    expect(Array.isArray((res.result as { tools: unknown[] }).tools)).toBe(true);
  });
});
