/**
 * Internal management tools for Hatago Hub
 */

import { z } from 'zod';
import type { HatagoHub } from './hub.js';

export interface InternalTool {
  name: string;
  description: string;
  inputSchema: z.ZodObject<any>;
  handler: (args: any, hub: HatagoHub) => Promise<any>;
}

/**
 * Get internal management tools
 */
export function getInternalTools(): InternalTool[] {
  return [
    {
      name: 'hatago_status',
      description:
        'Get the current status of Hatago Hub including servers, tools, and configuration',
      inputSchema: z.object({}),
      handler: async (_args, hub) => {
        const servers = (hub as any).servers as Map<string, any>;
        const tools = (hub as any).tools.list();
        const revision = (hub as any).toolsetRevision;
        const hash = (hub as any).toolsetHash;

        const serverList = Array.from(servers.values()).map((s) => ({
          id: s.id,
          status: s.status,
          toolCount: s.tools?.length || 0,
          resourceCount: s.resources?.length || 0
        }));

        return {
          hub_version: '0.0.1',
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
      handler: async (args, hub) => {
        const dryRun = args.dry_run || false;

        if (dryRun) {
          return {
            ok: true,
            message: 'Dry run mode - no changes applied',
            current_revision: (hub as any).toolsetRevision,
            current_hash: (hub as any).toolsetHash
          };
        }

        // Trigger reload
        const reloadConfig = (hub as any).reloadConfig;
        if (reloadConfig) {
          try {
            await reloadConfig.call(hub);
            return {
              ok: true,
              message: 'Configuration reloaded successfully',
              new_revision: (hub as any).toolsetRevision,
              new_hash: (hub as any).toolsetHash
            };
          } catch (error) {
            return {
              ok: false,
              message: 'Failed to reload configuration',
              error: error instanceof Error ? error.message : String(error)
            };
          }
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
      handler: async (_args, hub) => {
        const servers = (hub as any).servers as Map<string, any>;

        const serverDetails = Array.from(servers.values()).map((s) => ({
          server_id: s.id,
          status: s.status,
          type: s.spec?.url ? 'remote' : 'local',
          url: s.spec?.url || null,
          command: s.spec?.command || null,
          tools: s.tools?.map((t: any) => t.name) || [],
          resources: s.resources?.map((r: any) => r.uri) || [],
          error: s.error?.message || null
        }));

        return {
          total_servers: serverDetails.length,
          servers: serverDetails
        };
      }
    }
  ];
}
