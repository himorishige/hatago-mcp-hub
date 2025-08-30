/**
 * Smoke tests for HatagoHub tools.list and naming resolution
 */

import { describe, expect, it } from 'vitest';
import { HatagoHub } from './hub.js';

describe('HatagoHub tools listing and naming', () => {
  it('registers internal tools with prefixed names', async () => {
    const hub = new HatagoHub();
    await hub.start();
    const all = hub.tools.list();

    expect(all.length).toBeGreaterThan(0);
    // Internal tools are registered in the registry under `_internal` but not as a ConnectedServer,
    // so serverId filtering does not apply. Verify by name prefix instead.
    const internal = all.filter((t) => t.name.startsWith('_internal_'));
    expect(internal.length).toBeGreaterThan(0);
    await hub.stop();
  });

  it('resolves tool names with namespace vs none', async () => {
    // namespace (default) requires prefix
    const hub1 = new HatagoHub({ namingStrategy: 'namespace', separator: '_' });
    await hub1.start();
    const res1 = await hub1.tools.call('_internal/hatago_status', {});
    expect((res1.content?.[0] as any)?.text).toContain('toolset');
    await hub1.stop();

    // none allows direct tool names without server prefix
    const hub2 = new HatagoHub({ namingStrategy: 'none' });
    await hub2.start();
    const res2 = await hub2.tools.call('hatago_status', {});
    expect((res2.content?.[0] as any)?.text).toContain('toolset');
    await hub2.stop();
  });
});
