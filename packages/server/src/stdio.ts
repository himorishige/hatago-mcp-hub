/**
 * STDIO Mode Implementation
 *
 * Implements MCP protocol over STDIO with newline-delimited JSON messages.
 * This is the preferred mode for Claude Code integration.
 */

import type { HatagoConfig } from '@himorishige/hatago-core';
import { RPC_NOTIFICATION as CORE_RPC_NOTIFICATION } from '@himorishige/hatago-core';
const FALLBACK_RPC_NOTIFICATION = {
  initialized: 'notifications/initialized',
  cancelled: 'notifications/cancelled',
  progress: 'notifications/progress',
  tools_list_changed: 'notifications/tools/list_changed'
} as const;
const RPC_NOTIFICATION = CORE_RPC_NOTIFICATION ?? FALLBACK_RPC_NOTIFICATION;
import { createHub } from '@himorishige/hatago-hub/node';
import type { Logger } from './logger.js';
import { registerHubMetrics } from './metrics.js';
import { sendMessage } from './stdio/writer.js';
import { processMessage as dispatchMessage } from './stdio/dispatcher.js';
import { createLineBuffer, type LineBuffer } from './stdio/parser.js';

/**
 * Start the MCP server in STDIO mode
 */
export async function startStdio(
  config: { path?: string; data: HatagoConfig },
  logger: Logger,
  tags?: string[]
): Promise<void> {
  // Ensure stdout is for protocol only
  process.stdout.setDefaultEncoding('utf8');

  // Shutdown flag to prevent sending messages during shutdown
  let isShuttingDown = false;

  // Create hub instance
  logger.debug('[STDIO] Creating hub', {
    configFile: config.path
  });
  // If the config file does not exist, do not pass `configFile`.
  // Otherwise Hub.start() will try to reload from disk and cause ENOENT.
  const maybeExists = (config as unknown as { exists?: boolean }).exists;
  const hub = createHub({
    configFile: maybeExists ? config.path : undefined,
    preloadedConfig: { path: config.path, data: config.data },

    tags,
    enableStreamableTransport: false
  });
  // Metrics via hub event (opt-in); no HTTP endpoint in STDIO
  registerHubMetrics(hub);

  // Hub readiness and early-request buffering
  let hubReady = false;
  const pendingRequests: Array<Record<string, unknown>> = [];

  const shouldWaitForHub = (method?: unknown) => {
    if (typeof method !== 'string') return false;
    if (method === 'initialize') return false; // respond immediately
    if (
      method === RPC_NOTIFICATION.initialized ||
      method === RPC_NOTIFICATION.cancelled ||
      method === RPC_NOTIFICATION.progress
    )
      return false; // pass-through
    return (
      method.startsWith('tools/') ||
      method.startsWith('resources/') ||
      method.startsWith('prompts/')
    );
  };

  const flushPending = async () => {
    for (const msg of pendingRequests.splice(0)) {
      const response = await dispatchMessage(hub, msg, logger);
      if (response) {
        await sendMessage(response, logger, isShuttingDown);
      }
    }
  };

  // Set up notification handler to forward to Claude Code
  (hub as { onNotification?: (n: unknown) => Promise<void> }).onNotification = async (
    notification: unknown
  ) => {
    // Don't send notifications during shutdown
    if (isShuttingDown) {
      return;
    }

    logger.debug('[STDIO] Forwarding notification from child server:', notification);
    // Ensure it's a proper notification (no id field)
    const notificationObj = notification as { method?: string; id?: unknown };
    if (!notificationObj.method) {
      logger.warn('Invalid notification without method:', notification);
      return;
    }
    // Remove any id field to ensure it's treated as a notification
    const { id, ...notificationWithoutId } = notificationObj;
    void id; // Explicitly ignore
    await sendMessage(notificationWithoutId, logger, isShuttingDown);
  };

  // Setup graceful shutdown
  const shutdown = async (signal: string) => {
    if (isShuttingDown) {
      return; // Already shutting down
    }
    isShuttingDown = true;
    logger.info(`Received ${signal}, shutting down...`);

    try {
      await hub.stop();
    } catch (e) {
      const err = e instanceof Error ? e : new Error(String(e));
      logger.error('Error during hub shutdown:', err);
    }

    process.exit(0);
  };

  process.on('SIGINT', () => {
    void shutdown('SIGINT');
  });
  process.on('SIGTERM', () => {
    void shutdown('SIGTERM');
  });

  // NDJSON line buffer (keep original 60s timeout)
  const lineBuffer: LineBuffer = createLineBuffer({
    logger,
    timeoutMs: 60000,
    onLine: async (line: string) => {
      // Preserve original per-line handling
      try {
        const message = JSON.parse(line) as unknown;
        if (!message || typeof message !== 'object') {
          await sendMessage(
            {
              jsonrpc: '2.0',
              error: {
                code: -32600,
                message: 'Invalid Request',
                data: 'Request must be an object'
              },
              id: (message as Record<string, unknown>)?.id ?? null
            },
            logger,
            isShuttingDown
          );
          return;
        }

        const msg = message as Record<string, unknown>;
        if (!msg.method && !msg.result && !msg.error) {
          await sendMessage(
            {
              jsonrpc: '2.0',
              error: {
                code: -32600,
                message: 'Invalid Request',
                data: 'Missing required fields'
              },
              id: msg.id ?? null
            },
            logger,
            isShuttingDown
          );
          return;
        }

        logger.debug('Received:', message);

        if (!hubReady && shouldWaitForHub(msg.method)) {
          pendingRequests.push(msg);
          return;
        }

        const response = await dispatchMessage(hub, msg, logger);
        if (response) {
          await sendMessage(response, logger, isShuttingDown);
        }
      } catch (e) {
        const err = e instanceof Error ? e : new Error(String(e));
        logger.error('Failed to parse message:', err, 'Line:', line);
        await sendMessage(
          {
            jsonrpc: '2.0',
            error: {
              code: -32700,
              message: 'Parse error',
              data: err.message ?? 'Invalid JSON'
            },
            id: null
          },
          logger,
          isShuttingDown
        );
      }
    }
  });

  // IMPORTANT: Set up STDIO message handler BEFORE starting hub
  // This ensures we don't miss any messages that arrive immediately after startup
  process.stdin.on('data', (chunk: Buffer) => {
    if (isShuttingDown) return;
    void lineBuffer.onData(chunk);
  });

  // Handle stdin errors
  process.stdin.on('error', (error) => {
    isShuttingDown = true; // Set flag immediately
    if ((error as { code?: string }).code === 'EPIPE') {
      logger.info('STDIN pipe closed');
    } else {
      logger.error('STDIN error:', error);
    }
    void shutdown('STDIN_ERROR');
  });

  process.stdin.on('end', () => {
    isShuttingDown = true; // Set flag immediately
    logger.info('STDIN closed, shutting down...');
    void shutdown('STDIN_CLOSE');
  });

  // Start reading
  process.stdin.resume();

  // Start hub AFTER setting up all listeners
  // This prevents missing any messages that arrive immediately after startup
  await hub.start();

  // Mark ready and flush any buffered requests
  hubReady = true;
  await flushPending();

  logger.info('Hatago MCP Hub started in STDIO mode');

  // Ensure the interval stops on process exit
  process.on('exit', () => {
    lineBuffer.stop();
  });
}
