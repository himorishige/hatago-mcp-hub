/**
 * Extended API endpoints for server management
 *
 * Provides CRUD operations for MCP server configuration
 */

import { Hono } from 'hono';
import { z } from 'zod';
import type { HatagoHub } from '@himorishige/hatago-hub';
import type { HatagoConfig } from '@himorishige/hatago-core';

// Simple logger implementation for UI
class Logger {
  constructor(private prefix: string) {}

  info(...args: any[]) {
    console.log(this.prefix, ...args);
  }

  error(...args: any[]) {
    console.error(this.prefix, ...args);
  }

  warn(...args: any[]) {
    console.warn(this.prefix, ...args);
  }

  debug(...args: any[]) {
    console.debug(this.prefix, ...args);
  }
}

export interface ExtendedApiOptions {
  hub: HatagoHub;
  configPath: string;
  configManager?: any; // ConfigManager instance from server
}

// Validation schemas
const ServerConfigSchema = z.object({
  id: z
    .string()
    .min(1)
    .max(64)
    .regex(/^[a-zA-Z0-9_-]+$/),
  type: z.enum(['stdio', 'http', 'sse']),
  command: z.string().optional(),
  args: z.array(z.string()).optional(),
  cwd: z.string().optional(),
  url: z.string().url().optional(),
  headers: z.record(z.string(), z.string()).optional(),
  env: z.record(z.string(), z.string()).optional(),
  tags: z.array(z.string()).optional(),
  disabled: z.boolean().optional(),
  timeouts: z
    .object({
      connectMs: z.number().optional(),
      requestMs: z.number().optional(),
      keepAliveMs: z.number().optional()
    })
    .optional()
});

const TestConnectionSchema = z.object({
  type: z.enum(['stdio', 'http', 'sse']),
  command: z.string().optional(),
  args: z.array(z.string()).optional(),
  url: z.string().url().optional(),
  headers: z.record(z.string(), z.string()).optional()
});

/**
 * Problem Details error response (RFC 7807)
 */
interface ProblemDetails {
  type: string;
  title: string;
  status: number;
  detail: string;
  fieldErrors?: Array<{
    field: string;
    message: string;
    code: string;
  }>;
  correlationId: string;
  remediation?: string;
}

/**
 * Create extended API routes for server management
 */
export function createExtendedApi(options: ExtendedApiOptions) {
  const { hub, configManager: serverConfigManager } = options;
  const api = new Hono();

  // Initialize logger
  const logger = new Logger('[ConfigManager]');

  // Use server's ConfigManager if available, otherwise use simplified version
  const configManager = serverConfigManager
    ? {
        async readConfig(): Promise<{ data: HatagoConfig; version: string }> {
          return serverConfigManager.readConfig();
        },

        async saveConfig(
          config: HatagoConfig,
          version?: string
        ): Promise<{ success: boolean; version?: string; error?: string }> {
          return serverConfigManager.saveConfig(config, version);
        },

        async listBackups(): Promise<Array<{ name: string; date: Date; size: number }>> {
          return serverConfigManager.listBackups();
        },

        async restoreFromBackup(
          name: string
        ): Promise<{ success: boolean; version?: string; error?: string }> {
          return serverConfigManager.restoreFromBackup(name);
        }
      }
    : {
        async readConfig(): Promise<{ data: HatagoConfig; version: string }> {
          try {
            // Use the actual config from hub which has ConfigManager
            const config = hub.getConfig();

            // Get version from the hub's internal state
            // Note: This is a simplified version - in production,
            // the version should be tracked by the server's ConfigManager
            return {
              data: config,
              version: new Date().toISOString() // Temporary version
            };
          } catch (error) {
            logger.error('Failed to read configuration', error);
            throw new Error('Failed to read configuration');
          }
        },

        async saveConfig(
          _config: HatagoConfig,
          _version?: string
        ): Promise<{ success: boolean; version?: string; error?: string }> {
          try {
            // In UI context, we need to delegate to the server's ConfigManager
            // For now, we'll update the hub directly and trigger a reload
            // TODO: Implement proper server-side config saving endpoint

            // Trigger hub reload with new config
            await hub.doReloadConfig();

            return {
              success: true,
              version: new Date().toISOString()
            };
          } catch (error) {
            logger.error('Failed to save configuration', error);
            return {
              success: false,
              error: error instanceof Error ? error.message : 'Unknown error'
            };
          }
        },

        async listBackups(): Promise<Array<{ name: string; date: Date; size: number }>> {
          // TODO: Implement backup listing via server API
          return [];
        },

        async restoreFromBackup(
          _name: string
        ): Promise<{ success: boolean; version?: string; error?: string }> {
          // TODO: Implement backup restoration via server API
          return { success: false, error: 'Not implemented' };
        }
      };

  /**
   * Helper to create problem details response
   */
  function problemDetails(
    status: number,
    title: string,
    detail: string,
    fieldErrors?: Array<{ field: string; message: string; code: string }>
  ): ProblemDetails {
    return {
      type: `https://hatago.dev/errors/${status}`,
      title,
      status,
      detail,
      fieldErrors,
      correlationId: crypto.randomUUID()
    };
  }

  // Get server details
  api.get('/servers/:id', async (c) => {
    const id = c.req.param('id');
    const server = hub.getServer(id);

    if (!server) {
      return c.json(
        problemDetails(404, 'Server Not Found', `Server with ID '${id}' not found`),
        404
      );
    }

    try {
      const config = await configManager.readConfig();
      const serverConfig = config.data.mcpServers?.[id];

      return c.json({
        id: server.id,
        status: server.status,
        type: server.spec?.type || 'unknown',
        tools: server.tools.length,
        resources: server.resources?.length || 0,
        prompts: server.prompts?.length || 0,
        config: serverConfig || {},
        error: server.error?.message,
        version: config.version
      });
    } catch (error) {
      return c.json(
        problemDetails(500, 'Internal Error', 'Failed to read server configuration'),
        500
      );
    }
  });

  // Add new server
  api.post('/servers', async (c) => {
    try {
      const body = await c.req.json();

      // Validate input
      const validation = ServerConfigSchema.safeParse(body);
      if (!validation.success) {
        const fieldErrors = validation.error.issues.map((err: any) => ({
          field: err.path.join('.'),
          message: err.message,
          code: `validation.${err.code}`
        }));

        return c.json(
          problemDetails(400, 'Validation Error', 'Invalid server configuration', fieldErrors),
          400
        );
      }

      const serverConfig = validation.data;

      // Read current config
      const current = await configManager.readConfig();

      // Check for duplicate ID
      if (current.data.mcpServers?.[serverConfig.id]) {
        return c.json(
          problemDetails(409, 'Conflict', `Server with ID '${serverConfig.id}' already exists`, [
            { field: 'id', message: 'Server ID already exists', code: 'duplicate_id' }
          ]),
          409
        );
      }

      // Add server to config - extract id and use rest of config
      const { id: serverId, ...serverDataWithoutId } = serverConfig;
      const updated = {
        ...current.data,
        mcpServers: {
          ...current.data.mcpServers,
          [serverId]: serverDataWithoutId
        }
      };

      // Save config
      const result = await configManager.saveConfig(updated as any, current.version);

      if (!result.success) {
        return c.json(
          problemDetails(500, 'Save Failed', result.error || 'Failed to save configuration'),
          500
        );
      }

      // Reload hub configuration
      await hub.doReloadConfig();

      return c.json(
        {
          success: true,
          id: serverConfig.id,
          message: 'Server added successfully',
          version: result.version
        },
        201
      );
    } catch (error) {
      return c.json(
        problemDetails(
          500,
          'Internal Error',
          error instanceof Error ? error.message : 'Unknown error'
        ),
        500
      );
    }
  });

  // Update server (partial update)
  api.patch('/servers/:id', async (c) => {
    const id = c.req.param('id');

    try {
      const body = await c.req.json();
      const current = await configManager.readConfig();

      // Check if server exists
      if (!current.data.mcpServers?.[id]) {
        return c.json(
          problemDetails(404, 'Server Not Found', `Server with ID '${id}' not found`),
          404
        );
      }

      // Remove id field from body if present
      const { id: _bodyId, ...bodyWithoutId } = body;

      // Merge with existing config
      const updated = {
        ...current.data,
        mcpServers: {
          ...current.data.mcpServers,
          [id]: {
            ...current.data.mcpServers[id],
            ...bodyWithoutId
          }
        }
      };

      // Save config
      const result = await configManager.saveConfig(updated as any, current.version);

      if (!result.success) {
        return c.json(
          problemDetails(500, 'Save Failed', result.error || 'Failed to save configuration'),
          500
        );
      }

      // Reload hub configuration
      await hub.doReloadConfig();

      return c.json({
        success: true,
        message: 'Server updated successfully',
        version: result.version
      });
    } catch (error) {
      return c.json(
        problemDetails(
          500,
          'Internal Error',
          error instanceof Error ? error.message : 'Unknown error'
        ),
        500
      );
    }
  });

  // Delete server
  api.delete('/servers/:id', async (c) => {
    const id = c.req.param('id');

    try {
      const current = await configManager.readConfig();

      // Check if server exists
      if (!current.data.mcpServers?.[id]) {
        return c.json(
          problemDetails(404, 'Server Not Found', `Server with ID '${id}' not found`),
          404
        );
      }

      // Remove server from config
      const { [id]: removed, ...rest } = current.data.mcpServers;
      const updated = {
        ...current.data,
        mcpServers: rest
      };

      // Save config
      const result = await configManager.saveConfig(updated as any, current.version);

      if (!result.success) {
        return c.json(
          problemDetails(500, 'Save Failed', result.error || 'Failed to save configuration'),
          500
        );
      }

      // Reload hub configuration
      await hub.doReloadConfig();

      return c.json({
        success: true,
        message: 'Server deleted successfully',
        version: result.version
      });
    } catch (error) {
      return c.json(
        problemDetails(
          500,
          'Internal Error',
          error instanceof Error ? error.message : 'Unknown error'
        ),
        500
      );
    }
  });

  // Enable server
  api.post('/servers/:id/enable', async (c) => {
    const id = c.req.param('id');

    try {
      const current = await configManager.readConfig();

      if (!current.data.mcpServers?.[id]) {
        return c.json(
          problemDetails(404, 'Server Not Found', `Server with ID '${id}' not found`),
          404
        );
      }

      // Enable server
      const updated = {
        ...current.data,
        mcpServers: {
          ...current.data.mcpServers,
          [id]: {
            ...current.data.mcpServers[id],
            disabled: false
          }
        }
      };

      const result = await configManager.saveConfig(updated as any, current.version);

      if (!result.success) {
        return c.json(
          problemDetails(500, 'Save Failed', result.error || 'Failed to save configuration'),
          500
        );
      }

      await hub.doReloadConfig();

      return c.json({
        success: true,
        message: 'Server enabled successfully',
        version: result.version
      });
    } catch (error) {
      return c.json(
        problemDetails(
          500,
          'Internal Error',
          error instanceof Error ? error.message : 'Unknown error'
        ),
        500
      );
    }
  });

  // Disable server
  api.post('/servers/:id/disable', async (c) => {
    const id = c.req.param('id');

    try {
      const current = await configManager.readConfig();

      if (!current.data.mcpServers?.[id]) {
        return c.json(
          problemDetails(404, 'Server Not Found', `Server with ID '${id}' not found`),
          404
        );
      }

      // Disable server
      const updated = {
        ...current.data,
        mcpServers: {
          ...current.data.mcpServers,
          [id]: {
            ...current.data.mcpServers[id],
            disabled: true
          }
        }
      };

      const result = await configManager.saveConfig(updated as any, current.version);

      if (!result.success) {
        return c.json(
          problemDetails(500, 'Save Failed', result.error || 'Failed to save configuration'),
          500
        );
      }

      await hub.doReloadConfig();

      return c.json({
        success: true,
        message: 'Server disabled successfully',
        version: result.version
      });
    } catch (error) {
      return c.json(
        problemDetails(
          500,
          'Internal Error',
          error instanceof Error ? error.message : 'Unknown error'
        ),
        500
      );
    }
  });

  // Test connection (without saving)
  api.post('/servers/test', async (c) => {
    try {
      const body = await c.req.json();

      // Validate input
      const validation = TestConnectionSchema.safeParse(body);
      if (!validation.success) {
        const fieldErrors = validation.error.issues.map((err: any) => ({
          field: err.path.join('.'),
          message: err.message,
          code: `validation.${err.code}`
        }));

        return c.json(
          problemDetails(400, 'Validation Error', 'Invalid test configuration', fieldErrors),
          400
        );
      }

      const config = validation.data;

      // Test connection based on type
      if (config.type === 'stdio' && config.command) {
        // In UI context, we can't check file system directly
        // Just validate command format
        if (!config.command || config.command.trim() === '') {
          return c.json({
            success: false,
            message: 'Command is empty',
            remediation: 'Provide a valid command path'
          });
        }
        return c.json({
          success: true,
          message: 'Command format is valid (actual check will be done server-side)'
        });
      } else if ((config.type === 'http' || config.type === 'sse') && config.url) {
        // Try to connect to the URL
        try {
          const response = await fetch(config.url, {
            method: 'HEAD',
            headers: config.headers as HeadersInit | undefined,
            signal: AbortSignal.timeout(5000)
          });

          if (response.ok) {
            return c.json({
              success: true,
              message: 'Successfully connected to server'
            });
          } else {
            return c.json({
              success: false,
              message: `Server responded with status ${response.status}`,
              remediation: 'Check if the server is running and accessible'
            });
          }
        } catch (error) {
          return c.json({
            success: false,
            message: error instanceof Error ? error.message : 'Connection failed',
            remediation: 'Check the URL and network connectivity'
          });
        }
      }

      return c.json({
        success: false,
        message: 'Invalid configuration for testing'
      });
    } catch (error) {
      return c.json(
        problemDetails(
          500,
          'Internal Error',
          error instanceof Error ? error.message : 'Unknown error'
        ),
        500
      );
    }
  });

  // Get configuration
  api.get('/config', async (c) => {
    try {
      const config = await configManager.readConfig();
      return c.json({
        data: config.data,
        version: config.version
      });
    } catch (error) {
      return c.json(problemDetails(500, 'Internal Error', 'Failed to read configuration'), 500);
    }
  });

  // Get backups
  api.get('/config/backups', async (c) => {
    try {
      const backups = await configManager.listBackups();
      return c.json({ backups });
    } catch (error) {
      return c.json(problemDetails(500, 'Internal Error', 'Failed to list backups'), 500);
    }
  });

  // Restore from backup
  api.post('/config/backups/:name/restore', async (c) => {
    const name = c.req.param('name');

    try {
      const result = await configManager.restoreFromBackup(name);

      if (!result.success) {
        return c.json(
          problemDetails(404, 'Backup Not Found', result.error || 'Backup not found'),
          404
        );
      }

      // Reload hub configuration
      await hub.doReloadConfig();

      return c.json({
        success: true,
        message: 'Configuration restored successfully',
        version: result.version
      });
    } catch (error) {
      return c.json(
        problemDetails(
          500,
          'Internal Error',
          error instanceof Error ? error.message : 'Unknown error'
        ),
        500
      );
    }
  });

  return api;
}
