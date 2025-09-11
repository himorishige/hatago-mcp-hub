import type { SSEStream } from '@himorishige/hatago-transport';
import type { SSEStreamingApi } from 'hono/streaming';

/**
 * Create SSE adapter for Hono stream to the internal SSEStream interface.
 * No behavior change; extracted for readability. [SF][RP]
 */
export function createSSEAdapter(stream: SSEStreamingApi): SSEStream {
  return {
    closed: false,
    async write(data: string) {
      if (!this.closed) {
        await stream.write(data);
      }
    },
    async close() {
      this.closed = true;
      await stream.close();
    },
    onAbort(callback: () => void) {
      stream.onAbort(callback);
    }
  };
}
