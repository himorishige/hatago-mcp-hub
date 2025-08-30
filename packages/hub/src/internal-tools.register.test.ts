/**
 * Smoke tests for internal tool registration in HatagoHub
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { HatagoHub } from './hub.js';

describe('HatagoHub internal tools', () => {
  let hub: HatagoHub;

  beforeEach(() => {
    vi.useFakeTimers();
    hub = new HatagoHub();
  });

  afterEach(async () => {
    await hub.stop();
    vi.useRealTimers();
  });

  it('should register internal tools on start', async () => {
    await hub.start();

    const tools = hub.tools.list().map((t) => t.name);
    expect(tools.some((n) => n.endsWith('hatago_status'))).toBe(true);
    expect(tools.some((n) => n.endsWith('hatago_reload'))).toBe(true);
    expect(tools.some((n) => n.endsWith('hatago_list_servers'))).toBe(true);

    // Public names should be namespaced with serverId by default
    expect(tools).toContain('_internal_hatago_status');
  });

  it('should invoke internal tool handler via tools.call', async () => {
    await hub.start();

    const result = await hub.tools.call('_internal/hatago_status', {});
    const text = (result.content?.[0] as any)?.text || '';

    // Result is serialized JSON text; check for expected keys
    expect(text).toContain('hub_version');
    expect(text).toContain('toolset');
    expect(text).toContain('servers');
  });
});
