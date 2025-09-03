/**
 * STDIO Mode Implementation
 *
 * Implements MCP protocol over STDIO with newline-delimited JSON messages.
 * This is the preferred mode for Claude Code integration.
 */

import { once } from 'node:events';
import type { HatagoHub } from '@himorishige/hatago-hub';
import type { HatagoConfig } from '@himorishige/hatago-core';
import { createHub } from '@himorishige/hatago-hub/node';
import type { Logger } from './logger.js';

/**
 * Start the MCP server in STDIO mode
 */
export async function startStdio(
  config: { path?: string; data: HatagoConfig },
  logger: Logger,
  watchConfig = false,
  tags?: string[]
): Promise<void> {
  // Ensure stdout is for protocol only
  process.stdout.setDefaultEncoding('utf8');

  // Shutdown flag to prevent sending messages during shutdown
  let isShuttingDown = false;

  // Create hub instance
  logger.debug('[STDIO] Creating hub with config watch', {
    configFile: config.path,
    watchConfig
  });
  // If the config file does not exist, do not pass `configFile`.
  // Otherwise Hub.start() will try to reload from disk and cause ENOENT.
  const maybeExists = (config as unknown as { exists?: boolean }).exists;
  const hub = createHub({
    configFile: maybeExists ? config.path : undefined,
    preloadedConfig: { path: config.path, data: config.data },
    watchConfig,
    tags
  });

  // Set up notification handler to forward to Claude Code
  hub.onNotification = async (notification: unknown) => {
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
    } catch (error) {
      logger.error('Error during hub shutdown:', error);
    }

    process.exit(0);
  };

  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));

  // Handle STDIO input with proper buffering
  let buffer = '';
  let lastMessageTime = Date.now();
  const MESSAGE_TIMEOUT = 60000; // 60 seconds timeout for incomplete messages

  // Periodic cleanup for incomplete messages
  const timeoutCheck = setInterval(() => {
    if (buffer.length > 0 && Date.now() - lastMessageTime > MESSAGE_TIMEOUT) {
      logger.warn('Clearing incomplete message buffer after timeout');
      buffer = '';
    }
  }, 10000); // Check every 10 seconds

  // Cleanup interval on shutdown
  process.on('exit', () => {
    clearInterval(timeoutCheck);
  });

  // IMPORTANT: Set up STDIO message handler BEFORE starting hub
  // This ensures we don't miss any messages that arrive immediately after startup
  process.stdin.on('data', async (chunk: Buffer) => {
    // Don't process new data during shutdown
    if (isShuttingDown) {
      return;
    }

    lastMessageTime = Date.now();
    // Append new data to buffer
    buffer += chunk.toString();

    // Process all complete messages (newline-delimited)
    const lines = buffer.split('\n');
    buffer = lines.pop() || ''; // Keep incomplete line in buffer

    for (const line of lines) {
      if (!line.trim()) continue; // Skip empty lines

      try {
        const message = JSON.parse(line) as unknown;

        // Validate JSON-RPC structure
        if (!message || typeof message !== 'object') {
          await sendMessage(
            {
              jsonrpc: '2.0',
              error: {
                code: -32600,
                message: 'Invalid Request',
                data: 'Request must be an object'
              },
              id: (message as Record<string, unknown>)?.id || null
            },
            logger,
            isShuttingDown
          );
          continue;
        }

        // Check for required fields
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
              id: msg.id || null
            },
            logger,
            isShuttingDown
          );
          continue;
        }

        logger.debug('Received:', message);

        // Process message through hub
        const response = await processMessage(hub, msg, logger);

        if (response) {
          await sendMessage(response, logger, isShuttingDown);
        }
      } catch (error) {
        logger.error('Failed to parse message:', error, 'Line:', line);

        // Send parse error response
        await sendMessage(
          {
            jsonrpc: '2.0',
            error: {
              code: -32700,
              message: 'Parse error',
              data: error instanceof Error ? error.message : 'Invalid JSON'
            },
            id: null
          },
          logger,
          isShuttingDown
        );
      }
    }
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

  logger.info('Hatago MCP Hub started in STDIO mode');
}

/**
 * Send a message over STDIO with newline delimiter
 */
async function sendMessage(
  message: unknown,
  logger: Logger,
  isShuttingDown = false
): Promise<void> {
  // Don't send messages during shutdown
  if (isShuttingDown) {
    return;
  }

  const body = `${JSON.stringify(message)}\n`;

  // Log what we're sending at debug level
  logger.debug('Sending message:', JSON.stringify(message));

  try {
    // Write JSON message with newline
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

/**
 * Process incoming MCP message
 */
async function processMessage(
  hub: HatagoHub,
  message: Record<string, unknown>,
  logger: Logger
): Promise<unknown> {
  const { method, params, id } = message;
  void params; // Currently unused but kept for future use

  try {
    // Handle different MCP methods
    switch (method) {
      case 'initialize':
        return {
          jsonrpc: '2.0',
          id: id as string | number | null,
          result: {
            protocolVersion: '2025-06-18',
            capabilities: {
              tools: {},
              resources: {},
              prompts: {}
            },
            serverInfo: {
              name: 'hatago-hub',
              version: '0.1.0'
            }
          }
        };

      case 'notifications/initialized':
      case 'notifications/cancelled':
      case 'notifications/progress':
        // These are notifications, no response needed
        return null;

      case 'tools/list':
      case 'tools/call':
      case 'resources/list':
      case 'resources/read':
      case 'resources/templates/list':
      case 'prompts/list':
      case 'prompts/get':
        // Forward to hub's JSON-RPC handler
        return hub.handleJsonRpcRequest(message);

      default:
        // If it's a notification (no id), don't return an error
        if (id === undefined) {
          logger.debug(`Unknown notification: ${method}`);
          return null;
        }
        // For requests, return method not found error
        return {
          jsonrpc: '2.0',
          id: id as string | number | null,
          error: {
            code: -32601,
            message: 'Method not found',
            data: { method }
          }
        };
    }
  } catch (error) {
    return {
      jsonrpc: '2.0',
      id: id as string | number | null,
      error: {
        code: -32603,
        message: 'Internal error',
        data: error instanceof Error ? error.message : String(error)
      }
    };
  }
}
