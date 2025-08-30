/**
 * Smoke tests for Hub notifications
 */

import { describe, expect, it, vi } from 'vitest';
import { HatagoHub } from './hub.js';

describe('HatagoHub notifications', () => {
  it('sends tools/list_changed notification via onNotification', async () => {
    const hub = new HatagoHub();
    const onNotification = vi.fn(async () => {});
    hub.onNotification = onNotification;

    await hub.start();

    // Trigger notification directly (private method call is fine at runtime)
    await (hub as any).sendToolListChangedNotification();

    expect(onNotification).toHaveBeenCalled();
    const arg = onNotification.mock.calls[0][0];
    expect(arg.method).toBe('notifications/tools/list_changed');
    expect(arg.params).toHaveProperty('revision');
    expect(arg.params).toHaveProperty('hash');

    await hub.stop();
  });
});
