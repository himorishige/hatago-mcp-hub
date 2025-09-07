/**
 * Config reload logic extracted from hub.ts [SF][CA]
 */
import type { Logger } from '../logger.js';
import type { ConnectedServer, ServerSpec } from '../types.js';
import { normalizeServerSpec } from '../client/connector.js';

function stableStringify(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map((v) => stableStringify(v)).join(',')}]`;
  const obj = value as Record<string, unknown>;
  const keys = Object.keys(obj).sort();
  const entries = keys.map((k) => `"${k}":${stableStringify(obj[k])}`).join(',');
  return `{${entries}}`;
}

type ReloadHub = {
  options: { configFile?: string; tags?: string[] };
  logger: Logger;
  servers: Map<string, ConnectedServer>;
  removeServer: (id: string) => Promise<void>;
  addServer: (
    id: string,
    spec: ServerSpec,
    options?: { suppressToolListNotification?: boolean }
  ) => Promise<unknown>;
  sendToolListChangedNotification: () => Promise<void>;
};

export async function reloadConfig(h: ReloadHub): Promise<void> {
  const { options, logger } = h;

  if (!options.configFile) return;

  logger.info('[ConfigReload] Starting configuration reload...');

  try {
    const { readFileSync } = await import('node:fs');
    const { resolve } = await import('node:path');

    const configPath = resolve(options.configFile);
    const configContent = readFileSync(configPath, 'utf-8');
    const newConfig = JSON.parse(configContent) as unknown;

    const { safeParseConfig, formatConfigError } = await import('@himorishige/hatago-core/schemas');
    const parseResult = safeParseConfig(newConfig);

    if (!parseResult.success) {
      const errorMessage = formatConfigError(parseResult.error);
      logger.error('Invalid config file', { error: errorMessage });
      return;
    }

    const config = parseResult.data as { mcpServers?: Record<string, unknown> };
    const serversMap = h.servers;

    const newServerIds = new Set(Object.keys(config.mcpServers ?? {}));
    const existingServerIds = new Set(serversMap.keys());

    // Remove servers that are no longer in config
    for (const id of existingServerIds) {
      if (!newServerIds.has(id)) {
        logger.info(`[ConfigReload] Removing server ${id} (no longer in config)`);
        await h.removeServer(id);
      }
    }

    // Add or update servers
    if (config.mcpServers) {
      for (const [id, serverConfig] of Object.entries(config.mcpServers)) {
        // Skip disabled servers
        if ((serverConfig as { disabled?: boolean }).disabled === true) {
          if (existingServerIds.has(id)) {
            logger.info(`Removing server ${id} (now disabled)`);
            await h.removeServer(id);
          } else {
            logger.info(`Skipping disabled server: ${id}`);
          }
          continue;
        }

        // Tag filtering
        if (options.tags && options.tags.length > 0) {
          const serverTags = (serverConfig as { tags?: string[] }).tags ?? [];
          const hasMatchingTag = options.tags.some((tag) => serverTags.includes(tag));
          if (!hasMatchingTag) {
            if (existingServerIds.has(id)) {
              logger.info(`[ConfigReload] Removing server ${id} (no matching tags)`, {
                requiredTags: options.tags,
                serverTags
              });
              await h.removeServer(id);
            } else {
              logger.info(`[ConfigReload] Skipping server ${id} (no matching tags)`, {
                requiredTags: options.tags,
                serverTags
              });
            }
            continue;
          }
        }

        // Accept broader input but normalize into ServerSpec safely
        const spec = normalizeServerSpec(serverConfig as never);
        const hatagoOptions = ((serverConfig as { hatagoOptions?: { start?: string } })
          .hatagoOptions ?? {}) as {
          start?: string;
        };
        if (hatagoOptions.start !== 'lazy') {
          try {
            if (existingServerIds.has(id)) {
              const existingServer = h.servers.get(id);
              if (
                existingServer &&
                stableStringify(existingServer.spec) !== stableStringify(spec)
              ) {
                logger.info(`Reloading server ${id} (config changed)`);
                await h.removeServer(id);
                await h.addServer(id, spec, { suppressToolListNotification: true });
              }
            } else {
              logger.info(`[ConfigReload] Adding new server: ${id}`, { spec });
              await h.addServer(id, spec, { suppressToolListNotification: true });
            }
          } catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            logger.error(`Failed to connect to server ${id}`, { error: errorMessage });
          }
        }
      }
    }

    logger.info('Configuration reloaded successfully');
    await h.sendToolListChangedNotification();
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logger.error('Failed to reload config', { error: errorMessage });
  }
}
