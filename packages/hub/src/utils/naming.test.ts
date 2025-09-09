import { describe, it, expect } from 'vitest';
import { parseQualifiedName, buildPublicToolName, buildQualifiedName } from './naming.js';

describe('utils/naming', () => {
  it('parseQualifiedName handles slash form', () => {
    const r = parseQualifiedName('srv/a/b', '_');
    expect(r.serverId).toBe('srv');
    expect(r.name).toBe('a/b');
  });

  it('parseQualifiedName handles separator form', () => {
    const r = parseQualifiedName('srv__tool', '__');
    expect(r.serverId).toBe('srv');
    expect(r.name).toBe('tool');
  });

  it('parseQualifiedName returns name only when no qualifier', () => {
    const r = parseQualifiedName('justName', '__');
    expect(r.serverId).toBeUndefined();
    expect(r.name).toBe('justName');
  });

  it('buildPublicToolName respects strategy none', () => {
    const name = buildPublicToolName('s', 't', 'none', '__');
    expect(name).toBe('t');
  });

  it('buildPublicToolName prefixes when strategy is namespace/prefix', () => {
    expect(buildPublicToolName('s', 't', 'namespace', '__')).toBe('s__t');
    expect(buildPublicToolName('s', 't', 'prefix', '-')).toBe('s-t');
  });

  it('buildQualifiedName joins with separator', () => {
    expect(buildQualifiedName('s', 'x', ':')).toBe('s:x');
  });
});
