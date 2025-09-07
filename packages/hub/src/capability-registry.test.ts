import { describe, it, expect } from 'vitest';
import { CapabilityRegistry } from './capability-registry.js';

type ClientCaps = { sampling?: boolean; tools?: Record<string, unknown> };

describe('CapabilityRegistry', () => {
  it('tracks server capability support and client caps generically', () => {
    const reg = new CapabilityRegistry<ClientCaps>();

    // server capability
    reg.markServerCapability('s1', 'resources/list', 'supported');
    expect(reg.getServerCapability('s1', 'resources/list')).toBe('supported');
    expect(reg.getServerCapability('s1', 'prompts/list')).toBe('unknown');

    // client caps (generic)
    reg.setClientCapabilities('sess1', { sampling: true });
    const caps = reg.getClientCapabilities('sess1');
    expect(caps.sampling).toBe(true);

    // clear
    reg.clearClientCapabilities('sess1');
    expect(reg.getClientCapabilities('sess1').sampling).toBeUndefined();
  });
});
