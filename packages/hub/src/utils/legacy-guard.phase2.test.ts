import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { reportLegacyUsage } from './legacy-guard.js';
import { resetOnceLoggerForTests } from './once-logger.js';

const SNAP = { ...process.env };

describe('legacy-guard Phase 2 gating', () => {
  beforeEach(() => {
    resetOnceLoggerForTests();
    process.env.HATAGO_PHASE2 = undefined;
    process.env.HATAGO_ENABLE_LEGACY = undefined;
    process.env.HATAGO_NO_LEGACY = undefined;
  });

  afterEach(() => {
    process.env = { ...SNAP };
  });

  it('blocks by default when HATAGO_PHASE2=1', () => {
    process.env.HATAGO_PHASE2 = '1';
    expect(() => reportLegacyUsage('mcp-server', 'activation-manager')).toThrowError(
      /disabled by default \(Phase 2\)/
    );
  });

  it('allows when HATAGO_PHASE2=1 and HATAGO_ENABLE_LEGACY=1', () => {
    process.env.HATAGO_PHASE2 = '1';
    process.env.HATAGO_ENABLE_LEGACY = '1';
    expect(() => reportLegacyUsage('mcp-server', 'activation-manager')).not.toThrow();
  });
});
