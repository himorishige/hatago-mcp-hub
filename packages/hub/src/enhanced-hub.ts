/**
 * Enhanced Hatago Hub with management features
 * Integrates activation management, idle detection, and MCP management tools
 */

import { existsSync, readFileSync, unwatchFile, watchFile } from 'node:fs';
import type { ActivationPolicy, IdlePolicy, Tool } from '@himorishige/hatago-core';
import {
  expandConfig,
  getServerTransportType,
  type ServerState,
  type ServerConfig as CoreServerConfig
} from '@himorishige/hatago-core';
import { getPlatform, setPlatform } from '@himorishige/hatago-runtime';
import { createNodePlatform } from '@himorishige/hatago-runtime/platform/node';
import { HatagoHub } from './hub.js';
import { ActivationManager } from './mcp-server/activation-manager.js';
import { IdleManager } from './mcp-server/idle-manager.js';
import { MetadataStore, type StoredServerMetadata } from './mcp-server/metadata-store.js';
import { ServerStateMachine } from './mcp-server/state-machine.js';
import { AuditLogger } from './security/audit-logger.js';
import type { CallOptions, HubOptions, ListOptions, ServerSpec } from './types.js';

// Extended types for our management features
type ExtendedServerConfig = CoreServerConfig & {
  activationPolicy?: ActivationPolicy;
  idlePolicy?: IdlePolicy;
  _lastError?: {
    message: string;
    timestamp: string;
    retryAfterMs?: number;
  };
};

interface ExtendedHatagoConfig {
  version?: number;
  logLevel?: string;
  mcpServers?: Record<string, ExtendedServerConfig>;
  servers?: Record<string, ExtendedServerConfig>;
  notifications?: {
    enabled?: boolean;
    rateLimitSec?: number;
    severity?: string[];
  };
}

// Re-export as our working types
type ServerConfig = ExtendedServerConfig;
type HatagoConfig = ExtendedHatagoConfig;

/**
 * Enhanced Hub options
 */
export interface EnhancedHubOptions extends HubOptions {
  /** Enable management features */
  enableManagement?: boolean;

  /** Enable audit logging */
  enableAudit?: boolean;

  /** Enable idle management */
  enableIdleManagement?: boolean;

  /** Auto-start 'always' servers */
  autoStartAlways?: boolean;
}

/**
 * Enhanced Hatago Hub with full management capabilities
 */
export class EnhancedHatagoHub extends HatagoHub {
  // Management components
  private stateMachine?: ServerStateMachine;
  private activationManager?: ActivationManager;
  private idleManager?: IdleManager;
  private metadataStore?: MetadataStore;
  private auditLogger?: AuditLogger;

  // Configuration
  private config: HatagoConfig = {
    mcpServers: {}
  };
  private enhancedOptions: EnhancedHubOptions;

  constructor(options: EnhancedHubOptions = {}) {
    super(options);
    this.enhancedOptions = options;

    // Ensure platform is initialized
    if (!getPlatform()) {
      setPlatform(createNodePlatform());
    }

    // Initialize management components if enabled
    if (options.enableManagement !== false) {
      this.initializeManagement();
    }

    // Load configuration if provided
    if (options.configFile) {
      this.loadConfiguration(options.configFile);

      // Watch for config changes if enabled
      if (options.watchConfig) {
        this.startConfigWatch();
      }
    }

    // Override tools object to use callToolWithActivation
    const originalTools = this.tools;
    this.tools = {
      list: (options?: ListOptions): Tool[] => {
        return originalTools.list(options) as Tool[];
      },
      call: async (
        name: string,
        args: unknown,
        options?: CallOptions & {
          progressToken?: string;
          progressCallback?: (progress: unknown) => void;
        }
      ) => {
        // Use callToolWithActivation for on-demand activation support
        return this.callToolWithActivation(name, args, options || {});
      }
    };
  }

  /**
   * Initialize management components
   */
  private initializeManagement(): void {
    const configFile = this.enhancedOptions.configFile || '';

    // Initialize state machine
    this.stateMachine = new ServerStateMachine();

    // Initialize activation manager
    this.activationManager = new ActivationManager(this.stateMachine);
    this.activationManager.setHandlers(
      async (serverId) => this.handleServerActivation(serverId),
      async (serverId) => this.handleServerDeactivation(serverId)
    );

    // Initialize idle manager if enabled
    if (this.enhancedOptions.enableIdleManagement !== false) {
      this.idleManager = new IdleManager(this.stateMachine, this.activationManager);
      this.idleManager.start();
    }

    // Initialize metadata store
    this.metadataStore = new MetadataStore(configFile);

    // Initialize security components
    // File guard initialization removed - unused feature

    if (this.enhancedOptions.enableAudit !== false) {
      this.auditLogger = new AuditLogger(configFile);
    }

    // Management server initialization removed - using base class _internal tools instead

    // Register management tools/resources/prompts
    // Disabled to avoid duplicate management tools - using base class _internal tools instead
    // this.registerManagementCapabilities();
  }

  /**
   * Load configuration from file
   */
  private loadConfiguration(configFile: string): void {
    if (!existsSync(configFile)) {
      // Don't log warning - handled by CLI
      return;
    }

    try {
      const content = readFileSync(configFile, 'utf-8');
      const rawConfig = JSON.parse(content) as unknown;

      // Expand environment variables
      this.config = expandConfig(rawConfig) as HatagoConfig;

      // Process servers
      this.processConfiguration();

      this.logger.info('Configuration loaded', {
        serverCount: this.getServerCount()
      });
    } catch (error) {
      this.logger.error('Failed to load configuration', {
        error: error instanceof Error ? error.message : String(error)
      });
    }
  }

  /**
   * Process loaded configuration
   */
  private processConfiguration(): void {
    const servers = { ...this.config.mcpServers, ...this.config.servers };

    for (const [serverId, serverConfig] of Object.entries(servers)) {
      const config = serverConfig;

      // Register with activation manager
      if (this.activationManager) {
        this.activationManager.registerServer(serverId, config);
      }

      // Register idle policy
      if (this.idleManager && config.idlePolicy) {
        this.idleManager.registerPolicy(serverId, config.idlePolicy);
      }

      // Auto-start 'always' servers
      // Disabled by default to avoid blocking initialization
      // Can be enabled explicitly if needed
      if (this.enhancedOptions.autoStartAlways === true && config.activationPolicy === 'always') {
        this.scheduleServerStart(serverId);
      }
    }
  }

  /**
   * Schedule server startup
   */
  private scheduleServerStart(serverId: string): void {
    // Start after a short delay to allow full initialization
    setTimeout(async () => {
      try {
        // Use 'startup' type for always servers
        if (!this.activationManager) {
          throw new Error('Management features not enabled');
        }

        const result = await this.activationManager.activate(
          serverId,
          { type: 'startup' },
          'Startup activation for always policy'
        );

        if (!result.success) {
          throw new Error(result.error || 'Activation failed');
        }
      } catch (error) {
        this.logger.error(`Failed to auto-start server ${serverId}`, {
          error: error instanceof Error ? error.message : String(error)
        });
      }
    }, 1000);
  }

  /**
   * Handle server activation
   */
  private async handleServerActivation(serverId: string): Promise<void> {
    const servers = { ...this.config.mcpServers, ...this.config.servers };
    const config = servers[serverId] as ServerConfig;

    if (!config) {
      throw new Error(`Server configuration not found: ${serverId}`);
    }

    // Convert to ServerSpec based on transport type
    const transportType = getServerTransportType(config as CoreServerConfig);

    // Debug logging
    this.logger.debug(`[Enhanced] Server ${serverId} config:`, config);
    this.logger.debug(`[Enhanced] Detected transport type: ${transportType}`);

    const spec: ServerSpec = {
      command:
        'command' in config && typeof config.command === 'string' ? config.command : undefined,
      args: 'args' in config && Array.isArray(config.args) ? (config.args as string[]) : undefined,
      env:
        'env' in config && typeof config.env === 'object' && config.env !== null
          ? (config.env as Record<string, string>)
          : undefined,
      cwd: 'cwd' in config && typeof config.cwd === 'string' ? config.cwd : undefined,
      url: 'url' in config && typeof config.url === 'string' ? config.url : undefined,
      type: transportType === 'stdio' ? undefined : transportType,
      headers:
        'headers' in config && typeof config.headers === 'object' && config.headers !== null
          ? (config.headers as Record<string, string>)
          : undefined
    };

    this.logger.debug(`[Enhanced] Created spec for ${serverId}:`, spec);

    // Add server to hub
    await this.addServer(serverId, spec);

    // Store metadata for connected server
    if (this.metadataStore) {
      const server = this.servers.get(serverId);
      if (server) {
        await this.metadataStore.storeTools(serverId, server.tools);
        await this.metadataStore.storeResources(serverId, server.resources);
        await this.metadataStore.storePrompts(serverId, server.prompts);
        await this.metadataStore.updateConnectionInfo(serverId, true);
      }
    }
  }

  /**
   * Handle server deactivation
   */
  private async handleServerDeactivation(serverId: string): Promise<void> {
    await this.removeServer(serverId);

    // Update metadata
    if (this.metadataStore) {
      await this.metadataStore.updateConnectionInfo(serverId, false);
    }
  }

  /**
   * Activate a server
   */
  async activateServer(serverId: string, reason?: string): Promise<void> {
    if (!this.activationManager) {
      throw new Error('Management features not enabled');
    }

    const result = await this.activationManager.activate(serverId, { type: 'manual' }, reason);

    if (!result.success) {
      throw new Error(result.error || 'Activation failed');
    }
  }

  /**
   * Deactivate a server
   */
  async deactivateServer(serverId: string, reason?: string): Promise<void> {
    if (!this.activationManager) {
      throw new Error('Management features not enabled');
    }

    const result = await this.activationManager.deactivate(serverId, reason);

    if (!result.success) {
      throw new Error(result.error || 'Deactivation failed');
    }
  }

  /**
   * Call a tool with on-demand activation support
   */
  async callToolWithActivation(
    name: string,
    args: unknown,
    options: CallOptions = {}
  ): Promise<unknown> {
    // Check if tool requires server activation
    const toolInfo = this.toolRegistry.getTool(name);
    if (toolInfo && this.activationManager && this.metadataStore) {
      const serverId = toolInfo.serverId;

      // Check if server is active
      if (!this.activationManager.isActive(serverId)) {
        // Check metadata for cached tool definition
        const cachedTools = this.metadataStore.getTools(serverId);
        const hasTool = cachedTools?.some((t) => t.name === name);

        if (hasTool) {
          // Activate server on-demand
          const result = await this.activationManager.activate(
            serverId,
            { type: 'tool_call', toolName: name },
            `Tool call: ${name}`
          );

          if (!result.success) {
            throw new Error(`Failed to activate server ${serverId}: ${result.error}`);
          }
        }
      }

      // Track activity for idle management
      if (this.idleManager) {
        const sessionId = options.sessionId || 'default';
        this.idleManager.trackActivityStart(serverId, sessionId, name);

        try {
          // Call the tool through invoker
          const result = await this.toolInvoker.callTool(serverId, name, args, {
            timeout: options.timeout || this.options.defaultTimeout
          });

          // Update statistics
          if (this.metadataStore) {
            await this.metadataStore.updateStatistics(serverId);
          }

          return result;
        } finally {
          // Track activity end
          this.idleManager.trackActivityEnd(serverId, sessionId, name);
        }
      }
    }

    // Fall back to normal tool invocation
    return this.toolInvoker.callTool('default', name, args, {
      timeout: options.timeout || this.options.defaultTimeout
    });
  }

  /**
   * Get server count
   */
  private getServerCount(): number {
    const servers = { ...this.config.mcpServers, ...this.config.servers };
    return Object.keys(servers).length;
  }

  /**
   * Start watching config file
   */
  private startConfigWatch(): void {
    if (!this.enhancedOptions.configFile) return;

    const configFile = this.enhancedOptions.configFile;

    // Watch for changes
    watchFile(configFile, { interval: 2000 }, () => {
      this.logger.info('Configuration file changed, reloading...');
      void this.reloadConfiguration();
    });
  }

  /**
   * Reload configuration
   */
  async reloadConfiguration(): Promise<void> {
    if (!this.enhancedOptions.configFile) return;

    try {
      // Load new configuration
      this.loadConfiguration(this.enhancedOptions.configFile);

      // Log reload
      if (this.auditLogger) {
        await this.auditLogger.log(
          'CONFIG_READ',
          {
            type: 'system'
          },
          {
            metadata: { reason: 'Config file watch' }
          },
          'info'
        );
      }

      this.logger.info('Configuration reloaded successfully');
    } catch (error) {
      this.logger.error('Failed to reload configuration', {
        error: error instanceof Error ? error.message : String(error)
      });
    }
  }

  /**
   * Get server states
   */
  getServerStates(): Map<string, ServerState> | undefined {
    return this.stateMachine?.getAllStates();
  }

  /**
   * Get server metadata
   */
  getServerMetadata(serverId: string): StoredServerMetadata | undefined {
    return this.metadataStore?.getServerMetadata(serverId);
  }

  /**
   * Search for tools across all servers
   */
  searchTools(query: string): Array<{
    serverId: string;
    tool: Tool;
    metadata: StoredServerMetadata;
  }> {
    if (!this.metadataStore) return [];
    return this.metadataStore.searchTools(query);
  }

  /**
   * Shutdown the hub
   */
  async shutdown(): Promise<void> {
    // Stop config watching
    if (this.enhancedOptions.configFile) {
      unwatchFile(this.enhancedOptions.configFile);
    }

    // Shutdown management components
    if (this.activationManager) {
      await this.activationManager.shutdown();
    }

    if (this.idleManager) {
      this.idleManager.stop();
    }

    if (this.metadataStore) {
      this.metadataStore.destroy();
    }

    // Disconnect all servers
    for (const serverId of this.servers.keys()) {
      await this.removeServer(serverId);
    }

    this.logger.info('Hub shutdown complete');
  }
}
