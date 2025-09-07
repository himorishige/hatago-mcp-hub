/**
 * Internal management tools for Hatago Hub
 */

import { z } from 'zod';
import type { HatagoHub } from './hub.js';

export type InternalTool<T = unknown> = {
  name: string;
  description: string;
  inputSchema: z.ZodObject<z.ZodRawShape>;
  handler: (args: T, hub: HatagoHub) => Promise<unknown> | unknown;
};

/**
 * Get internal management tools
 */
export function getInternalTools(): Array<InternalTool<unknown>> {
  return [
    {
      name: 'hatago_status',
      description:
        'Get the current status of Hatago Hub including servers, tools, and configuration',
      inputSchema: z.object({}),
      handler: (_args, hub) => {
        const servers = hub.getServers();
        const tools = hub.tools.list();
        const revision = hub.getToolsetRevision();
        const hash = hub.getToolsetHash();

        const serverList = servers.map((s) => ({
          id: s.id,
          status: s.status,
          toolCount: s.tools?.length ?? 0,
          resourceCount: s.resources?.length ?? 0
        }));

        return {
          hub_version: '0.1.0',
          mcp_protocol: '2025-06-18',
          toolset: {
            revision,
            hash,
            total_tools: tools.length
          },
          servers: {
            total: serverList.length,
            list: serverList
          },
          last_reload: new Date().toISOString()
        };
      }
    },

    {
      name: 'hatago_reload',
      description: 'Reload the Hatago configuration and refresh the tool list',
      inputSchema: z.object({
        dry_run: z.boolean().optional().describe('Perform a dry run without applying changes')
      }),
      handler: async (args: unknown, hub) => {
        const dryRun = (args as { dry_run?: boolean })?.dry_run ?? false;

        if (dryRun) {
          return {
            ok: true,
            message: 'Dry run mode - no changes applied',
            current_revision: hub.getToolsetRevision(),
            current_hash: hub.getToolsetHash()
          };
        }

        // Trigger reload
        try {
          await hub.doReloadConfig();
          return {
            ok: true,
            message: 'Configuration reloaded successfully',
            new_revision: hub.getToolsetRevision(),
            new_hash: hub.getToolsetHash()
          };
        } catch (error) {
          return {
            ok: false,
            message: 'Failed to reload configuration',
            error: error instanceof Error ? error.message : String(error)
          };
        }

        return {
          ok: false,
          message: 'Reload not available'
        };
      }
    },

    {
      name: 'hatago_list_servers',
      description: 'List all connected MCP servers with their details',
      inputSchema: z.object({}),
      handler: (_args, hub) => {
        const servers = hub.getServers();

        const serverDetails = servers.map((s) => ({
          server_id: s.id,
          status: s.status,
          type: s.spec?.url ? 'remote' : 'local',
          url: s.spec?.url ?? null,
          command: s.spec?.command ?? null,
          tools: s.tools?.map((t) => t.name) ?? [],
          resources: s.resources?.map((r) => r.uri) ?? [],
          error: s.error?.message ?? null
        }));

        return {
          total_servers: serverDetails.length,
          servers: serverDetails
        };
      }
    }
  ];
}
