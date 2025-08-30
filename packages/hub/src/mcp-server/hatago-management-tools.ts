/**
 * Simplified tool definitions for Hatago Management
 * Uses plain JSON Schema instead of Zod for compatibility
 */

import type { Tool } from '@himorishige/hatago-core';

/**
 * Get simplified management tools
 */
export function getManagementTools(): Tool[] {
  return [
    // === Configuration Management ===
    {
      name: 'hatago_get_config',
      description: 'Get current Hatago configuration',
      inputSchema: {
        type: 'object',
        properties: {
          format: {
            type: 'string',
            enum: ['full', 'summary', 'servers_only'],
            description: 'Output format',
          },
        },
      },
    },

    {
      name: 'hatago_list_servers',
      description: 'List all MCP servers with their current state',
      inputSchema: {
        type: 'object',
        properties: {
          filter: {
            type: 'string',
            enum: ['all', 'active', 'inactive', 'error'],
            description: 'Filter servers by state',
          },
        },
      },
    },

    {
      name: 'hatago_activate_server',
      description: 'Manually activate a server',
      inputSchema: {
        type: 'object',
        properties: {
          serverId: {
            type: 'string',
            description: 'Server ID',
          },
          reason: {
            type: 'string',
            description: 'Activation reason',
          },
        },
        required: ['serverId'],
      },
    },

    {
      name: 'hatago_deactivate_server',
      description: 'Manually deactivate a server',
      inputSchema: {
        type: 'object',
        properties: {
          serverId: {
            type: 'string',
            description: 'Server ID',
          },
          reason: {
            type: 'string',
            description: 'Deactivation reason',
          },
        },
        required: ['serverId'],
      },
    },

    {
      name: 'hatago_get_server_info',
      description: 'Get detailed information about a specific server',
      inputSchema: {
        type: 'object',
        properties: {
          serverId: {
            type: 'string',
            description: 'Server ID',
          },
        },
        required: ['serverId'],
      },
    },

    {
      name: 'hatago_get_server_states',
      description: 'Get current state of all servers',
      inputSchema: {
        type: 'object',
        properties: {},
      },
    },

    {
      name: 'hatago_reset_server',
      description: 'Reset server state and clear errors',
      inputSchema: {
        type: 'object',
        properties: {
          serverId: {
            type: 'string',
            description: 'Server ID to reset',
          },
        },
        required: ['serverId'],
      },
    },
  ];
}
