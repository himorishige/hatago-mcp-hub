import { once } from 'node:events';
import type { Logger } from '../logger.js';

/**
 * STDIO newline-delimited JSON writer utility.
 * Extracted from stdio.ts without changing behavior. [SF][PEC]
 */
export async function sendMessage(
  message: unknown,
  logger: Logger,
  isShuttingDown = false
): Promise<void> {
  if (isShuttingDown) return;

  const body = `${JSON.stringify(message)}\n`;
  logger.debug('Sending message:', JSON.stringify(message));

  try {
    if (!process.stdout.write(body)) {
      await once(process.stdout, 'drain');
    }
  } catch (error) {
    if ((error as { code?: string }).code === 'EPIPE') {
      logger.info('STDOUT pipe closed');
      process.exit(0);
    } else {
      logger.error('Failed to send message:', error);
    }
  }
}
