import type { SessionMaps } from './session-map.js';

export class CleanupScheduler {
  private interval?: ReturnType<typeof setInterval>;

  constructor(
    private readonly maps: SessionMaps,
    private readonly ttlMs: number,
    private readonly maxSessions: number
  ) {}

  start(): void {
    if (this.interval) return;
    this.interval = setInterval(() => this.tick(), 10000);
  }

  stop(): void {
    if (this.interval) clearInterval(this.interval);
    this.interval = undefined;
  }

  private tick(): void {
    const now = Date.now();

    // Clean closed or idle streams
    for (const [streamId, streamData] of this.maps.streamMapping.entries()) {
      const idleFor = now - (streamData.lastActivityAt ?? streamData.createdAt);
      if (streamData.stream.closed || idleFor > this.ttlMs) {
        if (streamData.keepaliveInterval) clearInterval(streamData.keepaliveInterval);
        this.maps.streamMapping.delete(streamId);
      }
    }

    // Bound sessions map
    if (this.maps.initializedSessions.size > this.maxSessions) {
      const toDelete = this.maps.initializedSessions.size - this.maxSessions;
      const it = this.maps.initializedSessions.keys();
      for (let i = 0; i < toDelete; i++) {
        const key = it.next().value;
        if (key) this.maps.initializedSessions.delete(key);
      }
    }
  }
}
