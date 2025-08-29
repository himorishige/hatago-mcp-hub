/**
 * Configuration Management for Workers
 *
 * Uses KV Storage for read-heavy config access with eventual consistency.
 * Implements write aggregation through Durable Objects to handle the
 * KV write limitations (low RPS per key).
 */

import type { KVNamespace } from '@cloudflare/workers-types';

export interface MCPServerConfig {
  id: string;
  url: string;
  type: 'http' | 'sse';
  headers?: Record<string, string>;
  timeout?: number;
  retryConfig?: {
    maxRetries: number;
    retryDelay: number;
  };
}

export interface HubConfig {
  version: string;
  mcpServers: Record<string, MCPServerConfig>;
  sessionConfig?: {
    ttl: number;
    maxClients: number;
  };
  rateLimits?: {
    requestsPerMinute: number;
    burstSize: number;
  };
}

const DEFAULT_CONFIG: HubConfig = {
  version: '0.1.0',
  mcpServers: {},
  sessionConfig: {
    ttl: 86400000, // 24 hours
    maxClients: 100,
  },
  rateLimits: {
    requestsPerMinute: 1000,
    burstSize: 50,
  },
};

/**
 * Load configuration from KV Storage
 * Optimized for frequent reads with caching
 */
export async function loadConfig(kv: KVNamespace): Promise<HubConfig> {
  try {
    // Try to get config from KV
    const storedConfig = await kv.get<HubConfig>('hub-config', {
      type: 'json',
      cacheTtl: 60, // Cache for 1 minute
    });

    if (storedConfig) {
      return { ...DEFAULT_CONFIG, ...storedConfig };
    }

    // If no config exists, return default
    return DEFAULT_CONFIG;
  } catch (error) {
    console.error('Failed to load config from KV:', error);
    return DEFAULT_CONFIG;
  }
}

/**
 * Save configuration to KV Storage
 * Should be called through DO for write aggregation
 */
export async function saveConfig(
  kv: KVNamespace,
  config: HubConfig,
): Promise<void> {
  try {
    await kv.put('hub-config', JSON.stringify(config), {
      metadata: {
        updatedAt: new Date().toISOString(),
        version: config.version,
      },
    });
  } catch (error) {
    console.error('Failed to save config to KV:', error);
    throw new Error('Configuration save failed');
  }
}

/**
 * Get specific MCP server configuration
 */
export async function getServerConfig(
  kv: KVNamespace,
  serverId: string,
): Promise<MCPServerConfig | null> {
  try {
    // Try individual server config first (for better caching)
    const serverConfig = await kv.get<MCPServerConfig>(`server:${serverId}`, {
      type: 'json',
      cacheTtl: 300, // Cache for 5 minutes
    });

    if (serverConfig) {
      return serverConfig;
    }

    // Fallback to main config
    const config = await loadConfig(kv);
    return config.mcpServers[serverId] || null;
  } catch (error) {
    console.error(`Failed to get server config for ${serverId}:`, error);
    return null;
  }
}

/**
 * Update server configuration
 * Should be called through DO for write aggregation
 */
export async function updateServerConfig(
  kv: KVNamespace,
  serverId: string,
  serverConfig: MCPServerConfig,
): Promise<void> {
  try {
    // Store individual server config for better cache granularity
    await kv.put(`server:${serverId}`, JSON.stringify(serverConfig), {
      metadata: {
        updatedAt: new Date().toISOString(),
      },
    });

    // Also update main config
    const config = await loadConfig(kv);
    config.mcpServers[serverId] = serverConfig;
    await saveConfig(kv, config);
  } catch (error) {
    console.error(`Failed to update server config for ${serverId}:`, error);
    throw new Error('Server configuration update failed');
  }
}

/**
 * Delete server configuration
 */
export async function deleteServerConfig(
  kv: KVNamespace,
  serverId: string,
): Promise<void> {
  try {
    // Delete individual server config
    await kv.delete(`server:${serverId}`);

    // Update main config
    const config = await loadConfig(kv);
    delete config.mcpServers[serverId];
    await saveConfig(kv, config);
  } catch (error) {
    console.error(`Failed to delete server config for ${serverId}:`, error);
    throw new Error('Server configuration deletion failed');
  }
}

/**
 * List all configured MCP servers
 */
export async function listServers(kv: KVNamespace): Promise<MCPServerConfig[]> {
  try {
    const config = await loadConfig(kv);
    return Object.values(config.mcpServers);
  } catch (error) {
    console.error('Failed to list servers:', error);
    return [];
  }
}

/**
 * Configuration write aggregator using Durable Objects
 * This helps avoid KV write rate limits
 */
export class ConfigWriteAggregator {
  private pendingWrites: Map<string, any>;
  private writeTimer: number | null;
  private kv: KVNamespace;

  constructor(kv: KVNamespace) {
    this.kv = kv;
    this.pendingWrites = new Map();
    this.writeTimer = null;
  }

  /**
   * Queue a configuration write
   */
  queueWrite(key: string, value: any) {
    this.pendingWrites.set(key, value);

    // Debounce writes (aggregate over 100ms)
    if (this.writeTimer) {
      clearTimeout(this.writeTimer);
    }

    this.writeTimer = setTimeout(() => {
      this.flushWrites();
    }, 100) as any;
  }

  /**
   * Flush all pending writes to KV
   */
  private async flushWrites() {
    if (this.pendingWrites.size === 0) return;

    const writes = Array.from(this.pendingWrites.entries());
    this.pendingWrites.clear();

    // Batch write to KV (if supported in future)
    // For now, write sequentially with small delays
    for (const [key, value] of writes) {
      try {
        await this.kv.put(key, JSON.stringify(value));
        // Small delay to avoid rate limits
        await new Promise((resolve) => setTimeout(resolve, 50));
      } catch (error) {
        console.error(`Failed to write ${key}:`, error);
      }
    }
  }
}
