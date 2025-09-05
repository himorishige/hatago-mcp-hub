/**
 * API Facade for Hatago internal management tools
 *
 * This module provides HTTP endpoints that wrap the existing internal tools
 * from the hub, making them accessible to the web UI.
 */

import { Hono } from 'hono';
import type { HatagoHub } from '@himorishige/hatago-hub';

export interface UIApiOptions {
  hub: HatagoHub;
}

/**
 * Create API routes for web UI
 */
export function createUIApi(options: UIApiOptions) {
  const { hub } = options;
  const api = new Hono();

  // Status endpoint - wraps hatago_status internal tool
  api.get('/status', async (c) => {
    try {
      const servers = hub.getServers();
      const tools = hub.tools.list();
      const revision = hub.getToolsetRevision();
      const hash = hub.getToolsetHash();

      const serverList = servers.map((server) => {
        const serverTools = tools.filter((tool: any) => tool.name.startsWith(`${server.id}_`));
        return {
          id: server.id,
          status: server.status === 'connected' ? 'connected' : 'disconnected',
          tools: serverTools.length,
          type: server.spec?.type || 'unknown',
          tags: [] // TODO: ServerSpec doesn't include tags, need to get from config
        };
      });

      const status = {
        servers: serverList,
        tools: tools.map((tool: any) => ({
          name: tool.name,
          description: tool.description || '',
          server: tool.name.includes('_') ? tool.name.split('_')[0] : 'internal'
        })),
        toolsetRevision: revision,
        toolsetHash: hash,
        totalServers: servers.length,
        connectedServers: serverList.filter((s) => s.status === 'connected').length,
        totalTools: tools.length,
        uptime: process.uptime(),
        timestamp: new Date().toISOString()
      };

      return c.json(status);
    } catch (error) {
      console.error('Status API error:', error);
      return c.json({ error: 'Failed to get status' }, 500);
    }
  });

  // Reload endpoint - wraps hatago_reload internal tool
  api.post('/reload', async (c) => {
    try {
      // Call the hub's reload functionality
      await hub.doReloadConfig();

      return c.json({
        success: true,
        message: 'Configuration reloaded successfully',
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      console.error('Reload API error:', error);
      return c.json(
        {
          error: 'Failed to reload configuration',
          message: error instanceof Error ? error.message : String(error)
        },
        500
      );
    }
  });

  // Servers list endpoint - wraps hatago_list_servers internal tool
  api.get('/servers', async (c) => {
    try {
      const servers = hub.getServers();

      const serverDetails = servers.map((server) => ({
        id: server.id,
        status: server.status === 'connected' ? 'connected' : 'disconnected',
        type: server.spec?.type || 'unknown',
        tags: [], // TODO: ServerSpec doesn't include tags, need to get from config
        config: {
          // Only include safe config info, not sensitive data
          command: server.spec?.command ? '[configured]' : undefined,
          url: server.spec?.url || undefined,
          disabled: false // ServerSpec doesn't have disabled, it's filtered at config level
        },
        lastSeen: null, // ConnectedServer doesn't track lastSeen
        error: server.error?.message || null
      }));

      return c.json({
        servers: serverDetails,
        total: servers.length,
        connected: serverDetails.filter((s) => s.status === 'connected').length,
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      console.error('Servers API error:', error);
      return c.json({ error: 'Failed to get servers' }, 500);
    }
  });

  // Health endpoint for API monitoring
  api.get('/health', (c) => {
    return c.json({
      status: 'healthy',
      service: 'hatago-ui-api',
      timestamp: new Date().toISOString(),
      uptime: process.uptime()
    });
  });

  return api;
}

/**
 * API Response Types
 */
export interface StatusResponse {
  servers: Array<{
    id: string;
    status: 'connected' | 'disconnected';
    tools: number;
    type: string;
    tags: string[];
  }>;
  tools: Array<{
    name: string;
    description: string;
    server: string;
  }>;
  toolsetRevision: number;
  toolsetHash: string;
  totalServers: number;
  connectedServers: number;
  totalTools: number;
  uptime: number;
  timestamp: string;
}

export interface ReloadResponse {
  success: boolean;
  message: string;
  timestamp: string;
}

export interface ServersResponse {
  servers: Array<{
    id: string;
    status: 'connected' | 'disconnected';
    type: string;
    tags: string[];
    config: {
      command?: string;
      url?: string;
      disabled: boolean;
    };
    lastSeen: string | null;
    error: string | null;
  }>;
  total: number;
  connected: number;
  timestamp: string;
}
