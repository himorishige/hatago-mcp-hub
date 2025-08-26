/**
 * Functional config store
 * Simple configuration management without EventEmitter
 */

import type { HatagoConfig, ServerConfig } from '../config/types.js';
import { validateConfig } from '../config/types.js';

/**
 * Subscriber function type
 */
export type ConfigSubscriber = (
  config: HatagoConfig,
  previousConfig?: HatagoConfig,
) => void;

/**
 * Config store interface
 */
export interface ConfigStore {
  get: () => HatagoConfig | null;
  set: (config: unknown) => HatagoConfig;
  subscribe: (fn: ConfigSubscriber) => () => void;
  reload: (config: unknown) => Promise<void>;
  clear: () => void;
}

/**
 * Create a config store
 */
export function createConfigStore(initial?: HatagoConfig): ConfigStore {
  let current: HatagoConfig | null = initial || null;
  let configLock = false;
  const subscribers: ConfigSubscriber[] = [];

  return {
    /**
     * Get current config
     */
    get: () => current,

    /**
     * Set new config
     */
    set: (config: unknown) => {
      // Validate config
      const validatedConfig = validateConfig(config);

      // Check lock
      if (configLock) {
        throw new Error('Configuration update is already in progress');
      }

      configLock = true;
      try {
        const oldConfig = current;
        current = validatedConfig;

        // Notify subscribers
        subscribers.forEach((fn) => {
          try {
            fn(validatedConfig, oldConfig || undefined);
          } catch (error) {
            console.error('Config subscriber error:', error);
          }
        });

        return validatedConfig;
      } finally {
        configLock = false;
      }
    },

    /**
     * Subscribe to config changes
     */
    subscribe: (fn: ConfigSubscriber) => {
      subscribers.push(fn);

      // Return unsubscribe function
      return () => {
        const index = subscribers.indexOf(fn);
        if (index > -1) {
          subscribers.splice(index, 1);
        }
      };
    },

    /**
     * Reload config
     */
    reload: async (config: unknown) => {
      const store = createConfigStore(current || undefined);
      const validatedConfig = store.set(config);
      current = validatedConfig;

      // Notify as reload
      subscribers.forEach((fn) => {
        try {
          fn(validatedConfig, current || undefined);
        } catch (error) {
          console.error('Config reload subscriber error:', error);
        }
      });
    },

    /**
     * Clear config and subscribers
     */
    clear: () => {
      current = null;
      subscribers.length = 0;
    },
  };
}

/**
 * Pure functions for config operations
 */

/**
 * Merge configurations
 */
export function mergeConfigs(
  base: HatagoConfig,
  override: Partial<HatagoConfig>,
): HatagoConfig {
  return {
    ...base,
    ...override,
    servers: override.servers || base.servers,
    security: {
      ...base.security,
      ...override.security,
    },
  };
}

/**
 * Filter servers by type
 */
export function filterServersByType(
  config: HatagoConfig,
  type: 'local' | 'remote' | 'npx',
): HatagoConfig {
  return {
    ...config,
    servers: (config.servers || []).filter((s) => s.type === type),
  };
}

/**
 * Check if config has servers
 */
export function hasServers(config: HatagoConfig): boolean {
  return Boolean(config.servers && config.servers.length > 0);
}

/**
 * Get server by ID
 */
export function getServerById(
  config: HatagoConfig,
  serverId: string,
): ServerConfig | undefined {
  return config.servers?.find((s) => s.id === serverId);
}
