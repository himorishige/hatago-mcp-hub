#!/usr/bin/env node
/* eslint-env node */
/* eslint no-console: 0 */
const PROC = globalThis.process;
const CON = globalThis.console;
/**
 * PR6 Phase 3 codemod (no deps) [DM][SF]
 *
 * Rewrites legacy imports to @himorishige/hatago-hub-management/*.
 *
 * Usage:
 *   node scripts/codemod/legacy-imports.mjs <paths...>
 *   DRY_RUN=1 node scripts/codemod/legacy-imports.mjs .
 */
import { readdirSync, statSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

const MAP = new Map([
  ['ActivationManager', 'activation-manager.js'],
  ['IdleManager', 'idle-manager.js'],
  ['MetadataStore', 'metadata-store.js'],
  ['ServerStateMachine', 'state-machine.js'],
  ['AuditLogger', 'audit-logger.js'],
  ['FileAccessGuard', 'file-guard.js']
]);

const DRY = PROC?.env?.DRY_RUN === '1' || PROC?.env?.DRY_RUN === 'true';

/** @param {string[]} roots */
function walk(roots) {
  const files = [];
  for (const root of roots) {
    const abs = resolve(root);
    const st = statSync(abs);
    if (st.isDirectory()) {
      for (const name of readdirSync(abs)) {
        const p = join(abs, name);
        const s = statSync(p);
        if (s.isDirectory()) files.push(...walk([p]));
        else if (/\.(ts|tsx|js|mjs|cjs|tsx)$/i.test(name)) files.push(p);
      }
    } else {
      files.push(abs);
    }
  }
  return files;
}

/** @param {string} src */
function transform(src) {
  let out = src;

  // Direct legacy subpath imports → management package
  out = out.replaceAll(
    /from\s+["']@himorishige\/hatago-hub\/(mcp-server|security)\/([^"']+)["']/g,
    (_m, _grp, file) => `from '@himorishige/hatago-hub-management/${file}'`
  );

  // Root named imports from @himorishige/hatago-hub → per-file management imports
  out = out.replaceAll(
    /import\s+\{([^}]+)\}\s+from\s+["']@himorishige\/hatago-hub["']/g,
    (m, inner) => {
      const names = inner
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean);
      // If none of our targets present, skip
      if (!names.some((n) => MAP.has(n))) return m;
      const survivors = names.filter((n) => !MAP.has(n));
      const migrated = names
        .filter((n) => MAP.has(n))
        .map((n) => `import { ${n} } from '@himorishige/hatago-hub-management/${MAP.get(n)}';`)
        .join('\n');
      const base =
        survivors.length > 0
          ? `import { ${survivors.join(', ')} } from '@himorishige/hatago-hub';\n`
          : '';
      return `${base}${migrated}`;
    }
  );

  return out;
}

function main() {
  const args = PROC?.argv?.slice(2) ?? [];
  if (args.length === 0) {
    CON.error('Usage: node scripts/codemod/legacy-imports.mjs <paths...>');
    PROC?.exit?.(1);
  }
  const files = walk(args);
  let changed = 0;
  for (const f of files) {
    const src = readFileSync(f, 'utf-8');
    const out = transform(src);
    if (out !== src) {
      changed++;
      if (DRY) {
        CON.log(`[dry-run] would update ${f}`);
      } else {
        writeFileSync(f, out);
        CON.log(`updated ${f}`);
      }
    }
  }
  CON.error(`\n${DRY ? '[dry-run] ' : ''}Done. ${changed} file(s) updated.`);
}

main();
