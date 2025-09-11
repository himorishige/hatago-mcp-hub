import type { Logger } from '../logger.js';

/**
 * NDJSON line buffer with periodic cleanup.
 * Reproduces original timeout behavior (60s) and 10s interval checks. [SF][REH]
 */
export type LineBuffer = {
  onData: (chunk: Buffer) => Promise<void> | void;
  stop: () => void;
};

export function createLineBuffer(options: {
  logger: Logger;
  timeoutMs?: number;
  onLine: (line: string) => Promise<void> | void;
}): LineBuffer {
  const { logger, onLine } = options;
  let timeoutMs = 60000;
  if (typeof options.timeoutMs === 'number' && Number.isFinite(options.timeoutMs)) {
    timeoutMs = options.timeoutMs;
  }

  let buffer = '';
  let lastMessageTime = Date.now();
  const interval = setInterval(() => {
    if (buffer.length > 0 && Date.now() - lastMessageTime > timeoutMs) {
      logger.warn('Clearing incomplete message buffer after timeout');
      buffer = '';
    }
  }, 10000);

  async function onData(chunk: Buffer) {
    lastMessageTime = Date.now();
    buffer += chunk.toString();
    const lines = buffer.split('\n');
    buffer = lines.pop() ?? '';

    for (const line of lines) {
      if (!line.trim()) continue;
      await onLine(line);
    }
  }

  function stop() {
    clearInterval(interval);
  }

  return { onData, stop };
}
