import { describe, it, expect } from 'vitest';
import { aggregateInstructions, INSTRUCTIONS_BYTE_LIMIT } from './instructions.js';

function makeOpts(over?: Partial<Parameters<typeof aggregateInstructions>[1]>) {
  const warnings: string[] = [];
  const opts = {
    baseDir: '/cfg',
    isActive: () => true,
    readFile: (p: string) => `FILE:${p}`,
    warn: (m: string) => warnings.push(m),
    ...over
  };
  return { opts, warnings };
}

describe('aggregateInstructions', () => {
  it('returns empty string when no server has instructions', () => {
    const { opts } = makeOpts();
    expect(aggregateInstructions({ a: { command: 'x' }, b: {} }, opts)).toBe('');
  });

  it('emits a ## <id> section for each inline-string instruction, in config order', () => {
    const { opts } = makeOpts();
    const out = aggregateInstructions(
      { hub: { instructions: 'Search me first.' }, wiki: { instructions: 'Internal docs.' } },
      opts
    );
    expect(out).toBe('## hub\nSearch me first.\n\n## wiki\nInternal docs.');
  });

  it('resolves { file } against baseDir via the injected readFile', () => {
    const reads: string[] = [];
    const { opts } = makeOpts({
      readFile: (p: string) => {
        reads.push(p);
        return 'From a file.';
      }
    });
    const out = aggregateInstructions({ hub: { instructions: { file: './guide.md' } } }, opts);
    expect(reads).toEqual(['/cfg/guide.md']);
    expect(out).toBe('## hub\nFrom a file.');
  });

  it('mixes inline and file sources', () => {
    const { opts } = makeOpts({ readFile: () => 'file body' });
    const out = aggregateInstructions(
      { a: { instructions: 'inline' }, b: { instructions: { file: 'b.md' } } },
      opts
    );
    expect(out).toBe('## a\ninline\n\n## b\nfile body');
  });

  it('excludes servers filtered out by isActive (disabled / tags)', () => {
    const { opts } = makeOpts({
      isActive: (cfg) => (cfg as { disabled?: boolean }).disabled !== true
    });
    const out = aggregateInstructions(
      { on: { instructions: 'yes' }, off: { instructions: 'no', disabled: true } },
      opts
    );
    expect(out).toBe('## on\nyes');
  });

  it('skips whitespace-only instructions', () => {
    const { opts } = makeOpts();
    expect(aggregateInstructions({ a: { instructions: '   \n  ' } }, opts)).toBe('');
  });

  it('warns and skips a server when its file read fails', () => {
    const { opts, warnings } = makeOpts({
      readFile: () => {
        throw new Error('ENOENT');
      }
    });
    const out = aggregateInstructions(
      { a: { instructions: { file: 'missing.md' } }, b: { instructions: 'ok' } },
      opts
    );
    expect(out).toBe('## b\nok');
    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toContain('missing.md');
    expect(warnings[0]).toContain("server 'a'");
  });

  it('THROWS when the aggregate exceeds the 2KB byte limit', () => {
    const big = 'x'.repeat(INSTRUCTIONS_BYTE_LIMIT + 1);
    const { opts } = makeOpts();
    expect(() => aggregateInstructions({ a: { instructions: big } }, opts)).toThrow(
      /2048-byte limit/
    );
  });

  it('does not warn when the aggregate is within the limit', () => {
    const { opts, warnings } = makeOpts();
    aggregateInstructions({ a: { instructions: 'small' } }, opts);
    expect(warnings).toHaveLength(0);
  });

  it('skips (with a warning) when instructions.file escapes the config directory (traversal)', () => {
    const { opts, warnings } = makeOpts();
    const out = aggregateInstructions(
      { a: { instructions: { file: '../../etc/passwd' } }, b: { instructions: 'ok' } },
      opts
    );
    expect(out).toBe('## b\nok');
    expect(warnings.some((w) => w.includes('outside the config directory'))).toBe(true);
  });

  it('skips (with a warning) when instructions.file is an absolute path outside baseDir', () => {
    const { opts, warnings } = makeOpts();
    const out = aggregateInstructions({ a: { instructions: { file: '/etc/passwd' } } }, opts);
    expect(out).toBe('');
    expect(warnings.some((w) => w.includes('outside the config directory'))).toBe(true);
  });
});
