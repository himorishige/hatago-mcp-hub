import { describe, it, expect } from 'vitest';
import { RPC_DISPATCH, isRpcMethod } from './dispatch.js';
import type { RpcMethod } from '@himorishige/hatago-core/types/rpc';

// Keep this list typed to RpcMethod so compiler forces updates on union change.
const ALL_METHODS: RpcMethod[] = [
  'initialize',
  'tools/list',
  'tools/call',
  'resources/list',
  'resources/read',
  'resources/templates/list',
  'prompts/list',
  'prompts/get',
  'ping',
  'sampling/createMessage'
];

describe('RPC dispatch mapping', () => {
  it('has handler for every RpcMethod', () => {
    for (const m of ALL_METHODS) {
      expect(typeof RPC_DISPATCH[m]).toBe('function');
    }
  });

  it('does not expose unknown methods', () => {
    for (const key of Object.keys(RPC_DISPATCH)) {
      expect(isRpcMethod(key)).toBe(true);
    }
  });

  it('isRpcMethod recognizes supported/unsupported methods', () => {
    expect(isRpcMethod('tools/list')).toBe(true);
    expect(isRpcMethod('unknown/method')).toBe(false);
  });
});
