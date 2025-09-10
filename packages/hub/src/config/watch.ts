/**
 * Config file watcher extracted from hub.ts [SF][CA]
 */
import type { HatagoHub } from '../hub.js';

// (no additional exported types)

export async function startConfigWatcher(hub: HatagoHub): Promise<void> {
  // Access configFile through a narrow helper to avoid private leaks.
  const logger = hub.getLogger();
  // @ts-expect-error access through internal field; kept local to watcher module
  const options = (hub as { options?: { configFile?: string } }).options ?? {};

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
            await hub.doReloadConfig();
            logger.info('[ConfigWatcher] Config reload completed');
          })();
        }, 1000); // 1s after last change
      }
    });

    // Store watcher on hub for shutdown (reuse existing field)
    // Store watcher reference on hub if available
    // @ts-expect-error internal field assignment for graceful shutdown
    (hub as { configWatcher?: { close: () => void } }).configWatcher = watcher;
    logger.info('Config file watcher started');
  } catch (error) {
    logger.error('Failed to set up config watcher', {
      error: error instanceof Error ? error.message : String(error)
    });
  }
}
