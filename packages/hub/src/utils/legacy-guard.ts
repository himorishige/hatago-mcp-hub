/**
 * Phase 1: legacy usage reporter with ENV gates. [SF][CMV][REH]
 *
 * ENV flags:
 * - HATAGO_LEGACY_BLOCK = '1' | 'true' -> throw on legacy import
 * - HATAGO_LEGACY_SILENCE = '1' | 'true' -> silence warnings
 * (default) -> warn once per legacy module import
 */
import { Logger } from '../logger.js';
import { warnOnce } from './once-logger.js';

const logger = new Logger('[Hub][Legacy]');

function isTrue(v: string | undefined): boolean {
  return v === '1' || v === 'true' || v === 'TRUE';
}

export function reportLegacyUsage(subsystem: 'mcp-server' | 'security', moduleName: string): void {
  // Plan-aligned flags with backward-compat aliases. [CMV][PEC]
  const block = isTrue(process.env.HATAGO_LEGACY_BLOCK) || isTrue(process.env.HATAGO_NO_LEGACY);
  const silent = isTrue(process.env.HATAGO_LEGACY_SILENCE);
  // CLI banner suppressor may also silence per-module warnings if desired.
  const bannerSilence = isTrue(process.env.HATAGO_NO_DEPRECATION_BANNER);

  const key = `${subsystem}:${moduleName}`;

  if (block) {
    // Throw immediately with actionable hint. [REH]
    throw new Error(
      `Legacy module blocked: ${key}. Set HATAGO_LEGACY_BLOCK=0 temporarily to allow, but migrate away soon. See docs/refactoring/pr6-legacy-removal-phase1.md`
    );
  }

  if (!silent && !bannerSilence) {
    warnOnce(
      key,
      `Legacy module in use: ${key} (soft-deprecated; will be removed in a future minor).`,
      {
        subsystem,
        module: moduleName,
        envFlags: {
          HATAGO_LEGACY_BLOCK: process.env.HATAGO_LEGACY_BLOCK ?? '0',
          HATAGO_LEGACY_SILENCE: process.env.HATAGO_LEGACY_SILENCE ?? '0',
          HATAGO_NO_LEGACY: process.env.HATAGO_NO_LEGACY ?? '0',
          HATAGO_NO_DEPRECATION_BANNER: process.env.HATAGO_NO_DEPRECATION_BANNER ?? '0'
        },
        docs: 'docs/refactoring/pr6-legacy-removal-phase1.md'
      },
      { logger }
    );
  }
}
