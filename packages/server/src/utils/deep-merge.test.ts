import { describe, it, expect } from 'vitest';
import { deepMerge, mergeConfigs } from './deep-merge.js';

describe('deepMerge', () => {
  it('overwrites primitives from source', () => {
    const result = deepMerge({ a: 1 } as unknown, { a: 2 } as unknown) as any;
    expect(result.a).toBe(2);
  });

  it('replaces arrays (no concat)', () => {
    const result = deepMerge({ a: [1, 2] } as any, { a: [3] } as any) as any;
    expect(result.a).toEqual([3]);
  });

  it('deep merges plain objects', () => {
    const result = deepMerge({ a: { x: 1 } } as any, { a: { y: 2 } } as any) as any;
    expect(result).toEqual({ a: { x: 1, y: 2 } });
  });

  it('treats class instances as primitives (overwrite, no deep merge)', () => {
    class Foo {
      constructor(public v = 42) {}
    }
    const foo = new Foo(7);
    const result = deepMerge({ a: { x: 1 } } as any, { a: foo } as any) as any;
    expect(result.a).toBe(foo);
  });

  it('handles env specially: null deletes keys', () => {
    const target = { env: { A: 'x', B: 'y' } };
    const source = { env: { A: null, C: 'z' } } as any;
    const result = deepMerge(target as any, source) as any;
    expect(result.env).toEqual({ B: 'y', C: 'z' });
  });

  it('prevents prototype pollution via __proto__/constructor/prototype', () => {
    const polluted: any = {};
    expect((polluted as any).polluted).toBeUndefined();

    const result = deepMerge({}, {
      // These keys should be ignored
      __proto__: { polluted: true },
      constructor: { prototype: { polluted: true } },
      prototype: { polluted: true },
      safe: 1
    } as any) as any;

    expect(result.safe).toBe(1);
    expect(({} as any).polluted).toBeUndefined();
  });

  it('returns null when source is null', () => {
    const result = deepMerge({ a: 1 }, null);
    expect(result).toBeNull();
  });
});

describe('mergeConfigs', () => {
  it('merges multiple configs in order', () => {
    const merged = mergeConfigs([
      { a: 1, b: { x: 1 }, arr: [1, 2] },
      { b: { y: 2 }, arr: [3] },
      { c: true }
    ]) as any;

    expect(merged).toEqual({ a: 1, b: { x: 1, y: 2 }, arr: [3], c: true });
  });
});
