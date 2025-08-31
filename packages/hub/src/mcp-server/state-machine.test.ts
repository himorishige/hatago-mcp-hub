/**
 * Tests for ServerStateMachine (lightweight)
 */

import { ServerState } from '@himorishige/hatago-core';
import { describe, expect, it } from 'vitest';
import { ServerStateMachine } from './state-machine.js';

describe('ServerStateMachine', () => {
  it('throws on invalid transition', async () => {
    const sm = new ServerStateMachine();
    sm.setState('s1', ServerState.MANUAL);
    await expect(sm.transition('s1', ServerState.ACTIVE)).rejects.toThrow(
      'Invalid state transition'
    );
  });

  it('trims history to 100 entries', async () => {
    const sm = new ServerStateMachine();
    sm.setState('s1', ServerState.INACTIVE);
    // Transition back and forth within valid edges
    for (let i = 0; i < 120; i++) {
      await sm.transition('s1', ServerState.ACTIVATING);
      await sm.transition('s1', ServerState.ACTIVE);
      await sm.transition('s1', ServerState.IDLING);
      await sm.transition('s1', ServerState.STOPPING);
      await sm.transition('s1', ServerState.INACTIVE);
    }
    const history = sm.getHistory('s1');
    expect(history.length).toBeLessThanOrEqual(100);
  });

  it('canActivate returns expected for key states', () => {
    const sm = new ServerStateMachine();
    sm.setState('s1', ServerState.INACTIVE);
    expect(sm.canActivate('s1')).toBe(true);
    sm.setState('s1', ServerState.COOLDOWN);
    expect(sm.canActivate('s1')).toBe(true);
    sm.setState('s1', ServerState.ACTIVE);
    expect(sm.canActivate('s1')).toBe(false);
  });
});
