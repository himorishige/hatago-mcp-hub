import { describe, it, expect } from 'vitest';
import { processMessage } from './dispatcher.js';
import type { Logger } from '../logger.js';

const logger = { debug() {}, info() {}, warn() {}, error() {} } as unknown as Logger;

describe('stdio dispatcher: initialize instructions', () => {
  it('includes instructions from the hub in the initialize result', async () => {
    const hub = { instructions: '## confluence-primary\nSearch here first.' };
    const res = (await processMessage(hub, { jsonrpc: '2.0', id: 1, method: 'initialize' }, logger)) as {
      result: { instructions?: string; serverInfo: unknown };
    };
    expect(res.result.instructions).toBe('## confluence-primary\nSearch here first.');
    expect(res.result.serverInfo).toBeDefined();
  });

  it('omits instructions when the hub has none', async () => {
    const hub = { instructions: '' };
    const res = (await processMessage(hub, { jsonrpc: '2.0', id: 1, method: 'initialize' }, logger)) as {
      result: { instructions?: string };
    };
    expect(res.result.instructions).toBeUndefined();
  });
});
