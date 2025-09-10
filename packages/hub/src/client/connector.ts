import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import type { ITransport } from '@himorishige/hatago-transport';
import type { Logger } from '../logger.js';
import type { ServerConfig } from '@himorishige/hatago-core/schemas';
import type { ServerSpec } from '../types.js';
import { HATAGO_VERSION } from '@himorishige/hatago-core';

// ---- transport wrapping ----------------------------------------------------

export function wrapTransport(
  transport: ITransport,
  serverId: string,
  baseLogger: Logger
): ITransport {
  const logger = baseLogger.child(serverId);
  const originalSend = transport.send?.bind(transport);
  if (originalSend) {
    transport.send = async (message: unknown) => {
      logger.debug('RPC Request', { message });
      try {
        const result = await originalSend(message);
        logger.debug('RPC Response', { result });
        return result;
      } catch (error) {
        logger.error('RPC Error', {
          error: error instanceof Error ? error.message : String(error)
        });
        throw error;
      }
    };
  }
  return transport;
}

// ---- connect with retry ----------------------------------------------------

export async function connectWithRetry(args: {
  id: string;
  createTransport: () => ITransport | Promise<ITransport>;
  maxRetries?: number;
  connectTimeoutMs?: number;
  logger: Logger;
}): Promise<Client> {
  const { id, createTransport, maxRetries = 3, connectTimeoutMs, logger } = args;

  let lastError: Error | undefined;

  for (let i = 0; i < maxRetries; i++) {
    try {
      const transport = wrapTransport(await createTransport(), id, logger);
      const client = new Client(
        {
          name: `hatago-hub-${id}`,
          version: HATAGO_VERSION
        },
        {
          capabilities: {
            tools: {},
            resources: {},
            prompts: {}
          }
        }
      );

      // Apply connection timeout if provided
      if (connectTimeoutMs && Number.isFinite(connectTimeoutMs)) {
        let timer: ReturnType<typeof setTimeout> | undefined;
        const race = Promise.race([
          client.connect(transport),
          new Promise((_, reject) => {
            timer = setTimeout(
              () => reject(new Error(`Connection timed out after ${connectTimeoutMs}ms`)),
              connectTimeoutMs
            );
          })
        ]);
        try {
          await race;
        } finally {
          if (timer) clearTimeout(timer);
        }
      } else {
        await client.connect(transport);
      }

      logger.info(`Successfully connected to ${id} on attempt ${i + 1}`);
      return client;
    } catch (error) {
      lastError = error as Error;
      logger.warn(`Connection attempt ${i + 1} failed for ${id}`, {
        error: lastError.message,
        retriesLeft: maxRetries - i - 1
      });
      if (i < maxRetries - 1) {
        const delay = 500 * 2 ** i;
        logger.debug(`Waiting ${delay}ms before retry...`);
        await new Promise((resolve) => setTimeout(resolve, delay));
      }
    }
  }

  if (lastError) {
    // Preserve original error details for better debuggability without risky casts
    const err = new Error(`Failed to connect to ${id} after ${maxRetries} attempts`);
    // Set cause when supported (avoid unsafe member access in strict lint)
    // Assign lazily for runtimes supporting Error.cause
    // eslint-disable-next-line @typescript-eslint/ban-ts-comment
    // @ts-ignore
    err.cause = err.cause ?? lastError;
    throw err;
  }
  throw new Error(`Failed to connect to ${id} after ${maxRetries} attempts`);
}

// ---- normalize server spec -------------------------------------------------

export function normalizeServerSpec(config: ServerConfig): ServerSpec {
  const spec: ServerSpec = {};

  if ('command' in config) {
    spec.command = config.command;
    spec.args = config.args;
    spec.env = config.env;
    spec.cwd = config.cwd;
  }

  if ('url' in config) {
    spec.url = config.url;
    spec.type = config.type ?? 'streamable-http';
    spec.headers = config.headers;
  }

  if (config.timeouts) {
    spec.timeout = config.timeouts.requestMs;
    spec.connectTimeout = config.timeouts.connectMs;
    spec.keepAliveTimeout = config.timeouts.keepAliveMs;
  } else {
    const maybeHatago = (config as Record<string, unknown>).hatagoOptions;
    if (typeof maybeHatago === 'object' && maybeHatago !== null) {
      const t = (maybeHatago as Record<string, unknown>).timeouts;
      const reconnect = (maybeHatago as Record<string, unknown>).reconnect;
      const reconnectDelay = (maybeHatago as Record<string, unknown>).reconnectDelay;
      if (typeof t === 'object' && t !== null) {
        const timeout = (t as Record<string, unknown>).timeout;
        if (typeof timeout === 'number') spec.timeout = timeout;
      }
      if (typeof reconnect === 'boolean') spec.reconnect = reconnect;
      if (typeof reconnectDelay === 'number') spec.reconnectDelay = reconnectDelay;
    }
    const topTimeout = (config as Record<string, unknown>).timeout;
    if (spec.timeout === undefined && typeof topTimeout === 'number') {
      spec.timeout = topTimeout;
    }
  }

  return spec;
}
