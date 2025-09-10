import { describe, it, expect } from 'vitest';
import { createTypedEmitter } from './events.js';

type TestEvents = {
  a: { n: number };
  b: string;
};

describe('TypedEmitter', () => {
  it('emits and receives typed payloads', () => {
    const emitter = createTypedEmitter<TestEvents>();
    let gotA = 0;
    let gotB = '';

    emitter.on('a', (d) => {
      gotA = d.n;
    });
    emitter.on('b', (d) => {
      gotB = d;
    });

    emitter.emit('a', { n: 42 });
    emitter.emit('b', 'ok');

    expect(gotA).toBe(42);
    expect(gotB).toBe('ok');
  });

  it('supports off()', () => {
    const emitter = createTypedEmitter<TestEvents>();
    let calls = 0;
    const handler = () => {
      calls++;
    };
    emitter.on('b', handler);
    emitter.emit('b', 'x');
    emitter.off('b', handler);
    emitter.emit('b', 'y');
    expect(calls).toBe(1);
  });
});
