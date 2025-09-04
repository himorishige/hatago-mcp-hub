/**
 * Graceful shutdown helper smoke test (unit-level)
 * - Verifies that sockets are tracked and destroyed after timeout
 */

import { describe, expect, it, vi } from 'vitest';
import { EventEmitter } from 'node:events';
import { setupGracefulShutdown } from '../http.js';

class FakeServer extends EventEmitter {
  closeCb?: () => void;
  close(cb: () => void) {
    this.closeCb = cb;
    // do not call immediately to simulate in-flight requests
  }
}

class FakeSocket extends EventEmitter {
  destroyed = false;
  destroy() {
    this.destroyed = true;
    this.emit('close');
  }
}

describe('setupGracefulShutdown (smoke)', () => {
  it('destroys remaining sockets after timeout', async () => {
    const server = new FakeServer() as any;
    const logger = { info: vi.fn(), error: vi.fn() };
    const hub = { stop: vi.fn().mockResolvedValue(undefined) };

    setupGracefulShutdown({ server, hub, logger, timeoutMs: 10 });

    // attach a socket
    const sock = new FakeSocket() as any;
    (server as unknown as EventEmitter).emit('connection', sock);

    // trigger SIGINT
    const exitSpy = vi.spyOn(process, 'exit').mockImplementation(() => {
      throw new Error('exit');
    });

    await expect(async () => {
      process.emit('SIGINT');
      // allow timers to run
      await new Promise((r) => setTimeout(r, 30));
      // close callback might be pending; force destroy path
    }).rejects.toThrowError('exit');

    expect(hub.stop).toHaveBeenCalled();
    // socket should be destroyed by timeout path
    expect((sock as any).destroyed).toBe(true);

    exitSpy.mockRestore();
  });
});
