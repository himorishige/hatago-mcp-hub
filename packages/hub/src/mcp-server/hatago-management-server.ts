/**
 * Hatago Management MCP Server
 * Provides tools, resources, and prompts for managing Hatago from Claude Code
 */

import type {
  ActivationPolicy,
  IdlePolicy,
  Prompt,
  Resource,
  Tool
} from '@himorishige/hatago-core';
import { ServerState } from '@himorishige/hatago-core';

// Extended types for management features
interface ServerConfig {
  type?: 'http' | 'sse'; // Optional for HTTP, required for SSE
  command?: string; // For STDIO servers
  args?: string[];
  env?: Record<string, string>;
  cwd?: string;
  url?: string; // For HTTP/SSE servers
  headers?: Record<string, string>;
  disabled?: boolean;
  activationPolicy?: ActivationPolicy;
  idlePolicy?: IdlePolicy;
  timeouts?: {
    connectMs?: number;
    requestMs?: number;
    keepAliveMs?: number;
  };
}

interface HatagoConfig {
  version?: number;
  logLevel?: string;
  mcpServers?: Record<string, ServerConfig>;
  servers?: Record<string, ServerConfig>;
  notifications?: {
    enabled?: boolean;
    rateLimitSec?: number;
    severity?: string[];
  };
  adminMode?: boolean;
  defaults?: {
    activationPolicy?: ActivationPolicy;
    idlePolicy?: IdlePolicy;
  };
}

import { existsSync, readFileSync } from 'node:fs';
import { AuditLogger } from '../security/audit-logger.js';
import { type DiffResult, FileAccessGuard } from '../security/file-guard.js';
import type { ActivationManager } from './activation-manager.js';
import { getManagementTools } from './hatago-management-tools.js';
import type { IdleManager } from './idle-manager.js';
import type { ServerStateMachine } from './state-machine.js';

/**
 * Management server options
 */
export interface ManagementServerOptions {
  configFilePath: string;
  stateMachine: ServerStateMachine;
  activationManager: ActivationManager;
  idleManager: IdleManager;
  enableAudit?: boolean;
}

/**
 * Hatago Management MCP Server
 * Exposes management capabilities through MCP protocol
 */
export class HatagoManagementServer {
  private readonly fileGuard: FileAccessGuard;
  private readonly auditLogger: AuditLogger;
  private readonly stateMachine: ServerStateMachine;
  private readonly activationManager: ActivationManager;
  private readonly idleManager: IdleManager;
  private readonly configFilePath: string;
  private config: HatagoConfig = {};

  constructor(options: ManagementServerOptions) {
    this.configFilePath = options.configFilePath;
    this.fileGuard = new FileAccessGuard(options.configFilePath);
    this.auditLogger = new AuditLogger(options.configFilePath);
    this.stateMachine = options.stateMachine;
    this.activationManager = options.activationManager;
    this.idleManager = options.idleManager;

    // Load initial config if path is provided
    if (this.configFilePath) {
      this.loadConfig();
    }
  }

  /**
   * Get management tools
   */
  getTools(): Tool[] {
    return getManagementTools();
    /* REMOVED COMPLEX TOOL DEFINITIONS - NOW IN hatago-management-tools.ts
    return [
      // === Configuration Management ===
      {
        name: 'hatago_get_config',
        description: 'Get current Hatago configuration',
        inputSchema: this.toToolSchema(z.object({
          format: z.enum(['full', 'summary', 'servers_only']).optional()
            .describe('Output format')
        }))
      },
      
      {
        name: 'hatago_preview_config_change',
        description: 'Preview configuration changes before applying',
        inputSchema: this.toToolSchema(z.object({
          changes: z.record(z.unknown())
            .describe('Configuration changes to preview')
        }))
      },
      
      {
        name: 'hatago_apply_config_change',
        description: 'Apply configuration changes with validation',
        inputSchema: this.toToolSchema(z.object({
          changes: z.record(z.unknown())
            .describe('Configuration changes to apply'),
          force: z.boolean().optional()
            .describe('Force apply even with warnings')
        }))
      },
      
      // === Server Management ===
      {
        name: 'hatago_list_servers',
        description: 'List all MCP servers with their current state',
        inputSchema: this.toToolSchema(z.object({
          filter: z.enum(['all', 'active', 'inactive', 'error']).optional()
            .describe('Filter servers by state')
        }))
      },
      
      {
        name: 'hatago_get_server_info',
        description: 'Get detailed information about a specific server',
        inputSchema: this.toToolSchema(z.object({
          serverId: z.string().describe('Server ID')
        }))
      },
      
      {
        name: 'hatago_activate_server',
        description: 'Manually activate a server',
        inputSchema: this.toToolSchema(z.object({
          serverId: z.string().describe('Server ID'),
          reason: z.string().optional().describe('Activation reason')
        }))
      },
      
      {
        name: 'hatago_deactivate_server',
        description: 'Manually deactivate a server',
        inputSchema: this.toToolSchema(z.object({
          serverId: z.string().describe('Server ID'),
          reason: z.string().optional().describe('Deactivation reason')
        }))
      },
      
      {
        name: 'hatago_set_server_policy',
        description: 'Change server activation policy',
        inputSchema: this.toToolSchema(z.object({
          serverId: z.string().describe('Server ID'),
          policy: z.enum(['always', 'onDemand', 'manual'])
            .describe('New activation policy')
        }))
      },
      
      // === Server CRUD ===
      {
        name: 'hatago_add_server',
        description: 'Add a new MCP server',
        inputSchema: this.toToolSchema(z.object({
          serverId: z.string().describe('Unique server ID'),
          config: z.object({
            command: z.string().optional().describe('Local command'),
            args: z.array(z.string()).optional().describe('Command arguments'),
            url: z.string().optional().describe('Remote server URL'),
            type: z.enum(['stdio', 'http', 'sse', 'ws']).optional()
              .describe('Transport type'),
            activationPolicy: z.enum(['always', 'onDemand', 'manual']).optional()
              .describe('Activation policy'),
            env: z.record(z.string()).optional().describe('Environment variables')
          }).describe('Server configuration'))
        }))
      },
      
      {
        name: 'hatago_remove_server',
        description: 'Remove an MCP server',
        inputSchema: this.toToolSchema(z.object({
          serverId: z.string().describe('Server ID to remove'),
          force: z.boolean().optional()
            .describe('Force removal even if active')
        }))
      },
      
      {
        name: 'hatago_update_server',
        description: 'Update server configuration',
        inputSchema: this.toToolSchema(z.object({
          serverId: z.string().describe('Server ID'),
          updates: z.record(z.unknown())
            .describe('Configuration updates')
        }))
      },
      
      // === Monitoring ===
      {
        name: 'hatago_get_server_states',
        description: 'Get current state of all servers',
        inputSchema: this.toToolSchema(z.object({})
      },
      
      {
        name: 'hatago_get_server_activity',
        description: 'Get server activity statistics',
        inputSchema: this.toToolSchema(z.object({
          serverId: z.string().optional()
            .describe('Server ID (omit for all servers)')
        }))
      },
      
      {
        name: 'hatago_get_audit_log',
        description: 'Query audit log entries',
        inputSchema: this.toToolSchema(z.object({
          limit: z.number().optional().describe('Number of entries'),
          eventTypes: z.array(z.string()).optional()
            .describe('Filter by event types'),
          serverId: z.string().optional().describe('Filter by server'),
          startTime: z.string().optional().describe('Start time (ISO 8601)'),
          endTime: z.string().optional().describe('End time (ISO 8601)')
        }))
      },
      
      // === Diagnostics ===
      {
        name: 'hatago_test_server_connection',
        description: 'Test connection to a server',
        inputSchema: this.toToolSchema(z.object({
          serverId: z.string().describe('Server ID to test')
        }))
      },
      
      {
        name: 'hatago_reset_server',
        description: 'Reset server state and clear errors',
        inputSchema: this.toToolSchema(z.object({
          serverId: z.string().describe('Server ID to reset')
        }))
      },
      
      {
        name: 'hatago_stop_idle_servers',
        description: 'Force stop all idle servers',
        inputSchema: this.toToolSchema(z.object({})
      }
    ];
    END OF REMOVED TOOL DEFINITIONS */
  }

  /**
   * Get management resources
   */
  getResources(): Resource[] {
    return [
      {
        uri: 'hatago://config',
        name: 'Current Configuration',
        description: 'The current Hatago configuration file',
        mimeType: 'application/json'
      },
      {
        uri: 'hatago://servers',
        name: 'Server List',
        description: 'List of all configured MCP servers',
        mimeType: 'application/json'
      },
      {
        uri: 'hatago://states',
        name: 'Server States',
        description: 'Current state of all servers',
        mimeType: 'application/json'
      },
      {
        uri: 'hatago://audit',
        name: 'Audit Log',
        description: 'Recent audit log entries',
        mimeType: 'application/json'
      },
      {
        uri: 'hatago://stats',
        name: 'Statistics',
        description: 'Server usage and performance statistics',
        mimeType: 'application/json'
      }
    ];
  }

  /**
   * Get management prompts
   */
  getPrompts(): Prompt[] {
    return [
      {
        name: 'configure_new_server',
        description: 'Interactive prompt to configure a new MCP server',
        arguments: [
          {
            name: 'serverType',
            description: 'Type of server (local, npx, remote)',
            required: true
          }
        ]
      },
      {
        name: 'diagnose_server_issues',
        description: 'Diagnose and fix server connection issues',
        arguments: [
          {
            name: 'serverId',
            description: 'Server ID to diagnose',
            required: true
          }
        ]
      },
      {
        name: 'optimize_server_policies',
        description: 'Analyze usage and suggest optimal activation policies',
        arguments: []
      }
    ];
  }

  /**
   * Handle tool call
   */
  async handleToolCall(name: string, args: any): Promise<any> {
    // Log tool call
    await this.auditLogger.log(
      'TOOL_CALLED',
      {
        type: 'mcp_tool',
        toolName: name
      },
      { metadata: args },
      'info'
    );

    switch (name) {
      // Configuration
      case 'hatago_get_config':
        return this.getConfig(args.format);

      case 'hatago_preview_config_change':
        return this.previewConfigChange(args.changes);

      case 'hatago_apply_config_change':
        return this.applyConfigChange(args.changes, args.force);

      // Server Management
      case 'hatago_list_servers':
        return this.listServers(args.filter);

      case 'hatago_get_server_info':
        return this.getServerInfo(args.serverId);

      case 'hatago_activate_server':
        return this.activateServer(args.serverId, args.reason);

      case 'hatago_deactivate_server':
        return this.deactivateServer(args.serverId, args.reason);

      case 'hatago_set_server_policy':
        return this.setServerPolicy(args.serverId, args.policy);

      // Server CRUD
      case 'hatago_add_server':
        return this.addServer(args.serverId, args.config);

      case 'hatago_remove_server':
        return this.removeServer(args.serverId, args.force);

      case 'hatago_update_server':
        return this.updateServer(args.serverId, args.updates);

      // Monitoring
      case 'hatago_get_server_states':
        return this.getServerStates();

      case 'hatago_get_server_activity':
        return this.getServerActivity(args.serverId);

      case 'hatago_get_audit_log':
        return this.getAuditLog(args);

      // Diagnostics
      case 'hatago_test_server_connection':
        return this.testServerConnection(args.serverId);

      case 'hatago_reset_server':
        return this.resetServer(args.serverId);

      case 'hatago_stop_idle_servers':
        return this.stopIdleServers();

      default:
        throw new Error(`Unknown tool: ${name}`);
    }
  }

  /**
   * Handle resource read
   */
  async handleResourceRead(uri: string): Promise<any> {
    switch (uri) {
      case 'hatago://config':
        return this.getConfig('full');

      case 'hatago://servers':
        return this.listServers('all');

      case 'hatago://states':
        return this.getServerStates();

      case 'hatago://audit':
        return this.getAuditLog({ limit: 100 });

      case 'hatago://stats':
        return this.getStatistics();

      default:
        throw new Error(`Unknown resource: ${uri}`);
    }
  }

  /**
   * Handle prompt
   */
  async handlePrompt(name: string, args: any): Promise<string> {
    switch (name) {
      case 'configure_new_server':
        return this.getNewServerPrompt(args.serverType);

      case 'diagnose_server_issues':
        return this.getDiagnosticPrompt(args.serverId);

      case 'optimize_server_policies':
        return this.getOptimizationPrompt();

      default:
        throw new Error(`Unknown prompt: ${name}`);
    }
  }

  // Private implementation methods

  private loadConfig(): void {
    if (existsSync(this.configFilePath)) {
      const content = readFileSync(this.configFilePath, 'utf-8');
      this.config = JSON.parse(content);
    }
  }

  private async getConfig(format?: string): Promise<any> {
    await this.auditLogger.logConfigRead({
      type: 'mcp_tool'
    });

    switch (format) {
      case 'summary': {
        const servers = { ...this.config.mcpServers, ...this.config.servers };
        return {
          serverCount: Object.keys(servers).length,
          adminMode: this.config.adminMode,
          defaults: this.config.defaults
        };
      }

      case 'servers_only':
        return { ...this.config.mcpServers, ...this.config.servers };

      default:
        return this.config;
    }
  }

  private async previewConfigChange(changes: any): Promise<DiffResult> {
    return this.fileGuard.previewChanges(changes);
  }

  private async applyConfigChange(changes: any, force?: boolean): Promise<any> {
    const preview = await this.fileGuard.previewChanges(changes);

    if (!preview.validation.valid && !force) {
      return {
        success: false,
        errors: preview.validation.errors,
        message: 'Configuration validation failed'
      };
    }

    // Apply changes
    const merged = { ...this.config, ...changes };
    const content = JSON.stringify(merged, null, 2);

    await this.fileGuard.safeWrite(this.configFilePath, content);
    await this.auditLogger.logConfigWrite({ type: 'mcp_tool' }, changes);

    this.config = merged;

    return {
      success: true,
      impacts: preview.impacts
    };
  }

  private async listServers(filter?: string): Promise<any[]> {
    const servers = { ...this.config.mcpServers, ...this.config.servers };
    const result = [];

    for (const [id, config] of Object.entries(servers)) {
      const state = this.stateMachine?.getState(id) || 'unknown';

      if (filter && filter !== 'all') {
        if (filter === 'active' && state !== ServerState.ACTIVE) continue;
        if (filter === 'inactive' && state !== ServerState.INACTIVE) continue;
        if (filter === 'error' && state !== ServerState.ERROR) continue;
      }

      result.push({
        id,
        state,
        policy: config.activationPolicy || 'manual',
        type: config.url ? 'remote' : 'local'
      });
    }

    return result;
  }

  private async getServerInfo(serverId: string): Promise<any> {
    const servers = { ...this.config.mcpServers, ...this.config.servers };
    const config = servers[serverId] as ServerConfig;

    if (!config) {
      throw new Error(`Server not found: ${serverId}`);
    }

    const state = this.stateMachine.getState(serverId);
    const activity = this.idleManager.getActivityStats(serverId);
    const history = this.activationManager.getActivationHistory(serverId);

    return {
      id: serverId,
      config,
      state,
      activity,
      activationHistory: history.slice(-5)
    };
  }

  private async activateServer(serverId: string, reason?: string): Promise<any> {
    const result = await this.activationManager.activate(serverId, { type: 'manual' }, reason);

    await this.auditLogger.logServerStateChange(serverId, 'SERVER_ACTIVATED', {
      type: 'mcp_tool'
    });

    return result;
  }

  private async deactivateServer(serverId: string, reason?: string): Promise<any> {
    const result = await this.activationManager.deactivate(serverId, reason);

    await this.auditLogger.logServerStateChange(serverId, 'SERVER_DEACTIVATED', {
      type: 'mcp_tool'
    });

    return result;
  }

  private async setServerPolicy(serverId: string, policy: ActivationPolicy): Promise<any> {
    const servers = { ...this.config.mcpServers, ...this.config.servers };

    if (!servers[serverId]) {
      throw new Error(`Server not found: ${serverId}`);
    }

    const updates = {
      [`${this.config.mcpServers?.[serverId] ? 'mcpServers' : 'servers'}.${serverId}.activationPolicy`]:
        policy
    };

    return this.applyConfigChange(updates);
  }

  private async addServer(serverId: string, config: ServerConfig): Promise<any> {
    const servers = { ...this.config.mcpServers, ...this.config.servers };

    if (servers[serverId]) {
      throw new Error(`Server already exists: ${serverId}`);
    }

    const updates = {
      mcpServers: {
        ...this.config.mcpServers,
        [serverId]: config
      }
    };

    const result = await this.applyConfigChange(updates);

    if (result.success) {
      this.activationManager.registerServer(serverId, config);
    }

    return result;
  }

  private async removeServer(serverId: string, force?: boolean): Promise<any> {
    const servers = { ...this.config.mcpServers, ...this.config.servers };

    if (!servers[serverId]) {
      throw new Error(`Server not found: ${serverId}`);
    }

    // Check if active
    if (!force && this.activationManager.isActive(serverId)) {
      throw new Error('Server is active. Use force=true to remove');
    }

    // Deactivate first
    if (this.activationManager.isActive(serverId)) {
      await this.activationManager.deactivate(serverId, 'Server removal');
    }

    // Remove from config
    const isInMcpServers = !!this.config.mcpServers?.[serverId];
    const updates = isInMcpServers
      ? {
          mcpServers: Object.fromEntries(
            Object.entries(this.config.mcpServers || {}).filter(([id]) => id !== serverId)
          )
        }
      : {
          servers: Object.fromEntries(
            Object.entries(this.config.servers || {}).filter(([id]) => id !== serverId)
          )
        };

    return this.applyConfigChange(updates);
  }

  private async updateServer(serverId: string, updates: any): Promise<any> {
    const servers = { ...this.config.mcpServers, ...this.config.servers };

    if (!servers[serverId]) {
      throw new Error(`Server not found: ${serverId}`);
    }

    const isInMcpServers = !!this.config.mcpServers?.[serverId];
    const configKey = isInMcpServers ? 'mcpServers' : 'servers';

    const configUpdates = {
      [configKey]: {
        ...this.config[configKey],
        [serverId]: {
          ...servers[serverId],
          ...updates
        }
      }
    };

    return this.applyConfigChange(configUpdates);
  }

  private getServerStates(): any {
    // Return empty states when stateMachine is not available
    if (!this.stateMachine) {
      return {};
    }
    const states = this.stateMachine.getAllStates();
    return Object.fromEntries(states);
  }

  private getServerActivity(serverId?: string): any {
    if (!this.idleManager) {
      return {};
    }

    if (serverId) {
      return this.idleManager.getActivityStats(serverId);
    }

    const all = this.idleManager.getAllActivities();
    return Object.fromEntries(all);
  }

  private async getAuditLog(options: any): Promise<any> {
    return this.auditLogger.query(options);
  }

  private async testServerConnection(serverId: string): Promise<any> {
    // This would trigger actual connection test
    // For now, return current state
    return {
      serverId,
      state: this.stateMachine.getState(serverId),
      canActivate: this.stateMachine.canActivate(serverId)
    };
  }

  private async resetServer(serverId: string): Promise<any> {
    await this.activationManager.resetServer(serverId);
    return {
      success: true,
      newState: this.stateMachine.getState(serverId)
    };
  }

  private async stopIdleServers(): Promise<any> {
    const results = await this.idleManager.stopIdleServers();
    return Object.fromEntries(results);
  }

  private async getStatistics(): Promise<any> {
    const auditStats = await this.auditLogger.getStatistics();
    const activities = this.idleManager?.getAllActivities() || new Map();

    return {
      audit: auditStats,
      servers: Object.fromEntries(
        Array.from(activities.entries()).map(([id, data]) => [
          id,
          {
            totalCalls: data.totalCalls,
            uptime: Date.now() - data.startTime,
            referenceCount: data.referenceCount
          }
        ])
      )
    };
  }

  private getNewServerPrompt(serverType: string): string {
    switch (serverType) {
      case 'local':
        return `To add a local MCP server, provide:
1. Server ID (unique identifier)
2. Command to run (e.g., "node", "python")
3. Arguments (e.g., ["./server.js"])
4. Working directory (optional)
5. Environment variables (optional)
6. Activation policy (always/onDemand/manual)`;

      case 'npx':
        return `To add an NPX MCP server, provide:
1. Server ID (unique identifier)
2. NPX package name (e.g., "@modelcontextprotocol/server-filesystem")
3. Arguments for the package
4. Activation policy (always/onDemand/manual)`;

      case 'remote':
        return `To add a remote MCP server, provide:
1. Server ID (unique identifier)
2. Server URL
3. Transport type (http/sse/ws)
4. Headers (optional, for authentication)
5. Activation policy (always/onDemand/manual)`;

      default:
        return 'Unknown server type';
    }
  }

  private async getDiagnosticPrompt(serverId: string): Promise<string> {
    const info = await this.getServerInfo(serverId);

    return `Server ${serverId} diagnostic:
State: ${info.state}
Policy: ${info.config.activationPolicy}
Last Error: ${info.config._lastError?.message || 'None'}

Suggested actions:
1. Check server logs
2. Verify command/URL is correct
3. Test connection manually
4. Reset server state if needed`;
  }

  private async getOptimizationPrompt(): Promise<string> {
    const activities = this.idleManager.getAllActivities();
    const suggestions = [];

    for (const [id, data] of activities) {
      const config = this.config.mcpServers?.[id] || this.config.servers?.[id];
      if (!config) continue;

      const currentPolicy = config.activationPolicy || 'manual';

      // Suggest based on usage
      if (data.totalCalls > 100 && currentPolicy !== 'always') {
        suggestions.push(`${id}: Consider 'always' policy (high usage)`);
      } else if (data.totalCalls < 10 && currentPolicy === 'always') {
        suggestions.push(`${id}: Consider 'onDemand' policy (low usage)`);
      }
    }

    return `Optimization suggestions:\n${suggestions.join('\n')}`;
  }
}
