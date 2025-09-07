/**
 * Config file watcher extracted from hub.ts [SF][CA]
 */
import type { HatagoHub } from '../hub.js';
import type { Logger } from '../logger.js';

type WatchHub = {
  options: { configFile?: string };
  logger: Logger;
  doReloadConfig: () => Promise<void>;
  configWatcher?: { close: () => void };
};

export async function startConfigWatcher(hub: HatagoHub): Promise<void> {
  const h = hub as unknown as WatchHub;
  const { options, logger } = h;

  if (!options.configFile) return;

  try {
    const { watch } = await import('node:fs');
    const { resolve } = await import('node:path');

    const configPath = resolve(options.configFile);
    logger.info('Setting up config file watcher', { path: configPath });

    // Debounce rapid successive changes
    let reloadTimeout: NodeJS.Timeout | undefined;

    const watcher = watch(configPath, (eventType: string) => {
      logger.debug(`Config file event: ${eventType}`, { path: configPath });
      if (eventType === 'change') {
        if (reloadTimeout) clearTimeout(reloadTimeout);
        reloadTimeout = setTimeout(() => {
          void (async () => {
            logger.info('[ConfigWatcher] Config file changed, starting reload...');
            await h.doReloadConfig();
            logger.info('[ConfigWatcher] Config reload completed');
          })();
        }, 1000); // 1s after last change
      }
    });

    // Store watcher on hub for shutdown (reuse existing field)
    h.configWatcher = watcher;
    logger.info('Config file watcher started');
  } catch (error) {
    logger.error('Failed to set up config watcher', {
      error: error instanceof Error ? error.message : String(error)
    });
  }
}
