import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { reportLegacyUsage } from './legacy-guard.js';
import { resetOnceLoggerForTests } from './once-logger.js';

const ORIGINAL_ENV = { ...process.env };

describe('legacy-guard (Phase 1)', () => {
  beforeEach(() => {
    resetOnceLoggerForTests();
    process.env.HATAGO_LEGACY_BLOCK = undefined;
    process.env.HATAGO_LEGACY_SILENCE = undefined;
  });

  afterEach(() => {
    // Restore env to avoid pollution across tests
    process.env = { ...ORIGINAL_ENV };
  });

  it('throws when HATAGO_LEGACY_BLOCK=1', () => {
    process.env.HATAGO_LEGACY_BLOCK = '1';
    expect(() => reportLegacyUsage('mcp-server', 'idle-manager')).toThrowError(
      /Legacy module blocked/
    );
  });

  it('does not throw by default (warn-once)', () => {
    expect(() => reportLegacyUsage('security', 'audit-logger')).not.toThrow();
    // second call should also not throw
    expect(() => reportLegacyUsage('security', 'audit-logger')).not.toThrow();
  });

  it('silences warnings when HATAGO_LEGACY_SILENCE=1 (no throw)', () => {
    process.env.HATAGO_LEGACY_SILENCE = '1';
    expect(() => reportLegacyUsage('mcp-server', 'metadata-store')).not.toThrow();
  });
});
