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

function migrationHint(subsystem: 'mcp-server' | 'security', moduleName: string): string {
  // Map legacy module to new package path. [SD]
  // Keep flat mapping for now; refine in Phase 3 when stubs land.
  return `@himorishige/hatago-hub-management/${moduleName}.js`;
}

function isTrue(v: string | undefined): boolean {
  return v === '1' || v === 'true' || v === 'TRUE';
}

export function reportLegacyUsage(subsystem: 'mcp-server' | 'security', moduleName: string): void {
  // Phase detection (pre-release preview). [CMV]
  const phase2 = isTrue(process.env.HATAGO_PHASE2);

  // Plan-aligned flags with backward-compat aliases. [CMV][PEC]
  const forceBlock =
    isTrue(process.env.HATAGO_LEGACY_BLOCK) || isTrue(process.env.HATAGO_NO_LEGACY);
  const enableLegacy = isTrue(process.env.HATAGO_ENABLE_LEGACY);
  const silent = isTrue(process.env.HATAGO_LEGACY_SILENCE);
  // CLI banner suppressor may also silence per-module warnings if desired.
  const bannerSilence = isTrue(process.env.HATAGO_NO_DEPRECATION_BANNER);

  const key = `${subsystem}:${moduleName}`;

  if (forceBlock) {
    // Throw immediately with actionable hint. [REH]
    throw new Error(
      `Legacy module blocked: ${key}. Set HATAGO_NO_LEGACY=0 and consider migration -> ${migrationHint(subsystem, moduleName)}. See docs/refactoring/pr6-legacy-removal-phase1.md`
    );
  }

  // Phase 2 behavior: default blocked, opt-in via HATAGO_ENABLE_LEGACY=1. [PEC]
  if (phase2 && !enableLegacy) {
    throw new Error(
      `Legacy module disabled by default (Phase 2): ${key}. To temporarily allow, set HATAGO_ENABLE_LEGACY=1. Migration -> ${migrationHint(
        subsystem,
        moduleName
      )}`
    );
  }

  if (!silent && !bannerSilence) {
    warnOnce(
      key,
      `Legacy module in use: ${key} (soft-deprecated). Migration -> ${migrationHint(subsystem, moduleName)}.`,
      {
        subsystem,
        module: moduleName,
        envFlags: {
          HATAGO_LEGACY_BLOCK: process.env.HATAGO_LEGACY_BLOCK ?? '0',
          HATAGO_LEGACY_SILENCE: process.env.HATAGO_LEGACY_SILENCE ?? '0',
          HATAGO_NO_LEGACY: process.env.HATAGO_NO_LEGACY ?? '0',
          HATAGO_NO_DEPRECATION_BANNER: process.env.HATAGO_NO_DEPRECATION_BANNER ?? '0',
          HATAGO_ENABLE_LEGACY: process.env.HATAGO_ENABLE_LEGACY ?? '0',
          HATAGO_PHASE2: process.env.HATAGO_PHASE2 ?? '0'
        },
        docs: 'docs/refactoring/pr6-legacy-removal-phase1.md'
      },
      { logger }
    );
  }
}
