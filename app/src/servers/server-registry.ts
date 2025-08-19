/**
 * Server registry for managing MCP servers
 */

import { EventEmitter } from 'node:events';
import type { NpxServerConfig, ServerConfig } from '../config/types.js';
import { getRuntime } from '../runtime/types.js';
import { NpxMcpServer, ServerState } from './npx-mcp-server.js';
import type { WorkspaceManager } from './workspace-manager.js';

/**
 * Registered server information
 */
export interface RegisteredServer {
  id: string;
  config: ServerConfig;
  instance?: NpxMcpServer; // Only for NPX servers
  state: ServerState;
  registeredAt: Date;
  lastHealthCheck?: Date;
  tools?: string[]; // Discovered tools
  healthCheckFailures?: number; // Consecutive health check failures
  lastHealthCheckError?: string; // Last health check error message
  autoRestartAttempts?: number; // Auto-restart attempt counter
}

/**
 * Server registry configuration
 */
export interface ServerRegistryConfig {
  autoStart?: boolean; // Auto-start servers on registration
  healthCheckIntervalMs?: number;
  discoveryTimeoutMs?: number;
  maxHealthCheckFailures?: number; // Max consecutive failures before auto-restart
  autoRestartOnHealthFailure?: boolean; // Enable auto-restart on health check failure
}

/**
 * Registry for managing MCP servers
 */
export class ServerRegistry extends EventEmitter {
  private servers = new Map<string, RegisteredServer>();
  private workspaceManager: WorkspaceManager;
  private config: ServerRegistryConfig;
  private healthCheckInterval: NodeJS.Timeout | null = null;
  private runtime = getRuntime();

  // Default configuration
  private readonly defaults = {
    autoStart: false,
    healthCheckIntervalMs: 30000, // 30 seconds
    discoveryTimeoutMs: 10000, // 10 seconds
    maxHealthCheckFailures: 3, // 3 consecutive failures
    autoRestartOnHealthFailure: true, // Auto-restart by default
  };

  constructor(
    workspaceManager: WorkspaceManager,
    config?: ServerRegistryConfig,
  ) {
    super();
    this.workspaceManager = workspaceManager;
    this.config = {
      ...this.defaults,
      ...config,
    };
  }

  /**
   * Initialize the registry
   */
  async initialize(): Promise<void> {
    const runtime = await this.runtime;

    // Start health check interval
    if (this.config.healthCheckIntervalMs) {
      this.healthCheckInterval = runtime.setInterval(
        () => this.performHealthChecks(),
        this.config.healthCheckIntervalMs,
      );
    }
  }

  /**
   * Register a new NPX server
   */
  async registerNpxServer(config: NpxServerConfig): Promise<RegisteredServer> {
    // Check if server already exists
    if (this.servers.has(config.id)) {
      throw new Error(`Server ${config.id} is already registered`);
    }

    // Create workspace for the server
    const workspace = await this.workspaceManager.createWorkspace(config.id);

    // Update config with workspace directory
    const serverConfig: NpxServerConfig = {
      ...config,
      workDir: workspace.path,
    };

    // Create server instance
    const server = new NpxMcpServer(serverConfig);

    // Set up event listeners
    this.setupServerListeners(server);

    // Create registered server entry
    const registered: RegisteredServer = {
      id: config.id,
      config: serverConfig,
      instance: server,
      state: ServerState.STOPPED,
      registeredAt: new Date(),
    };

    // Register the server
    this.servers.set(config.id, registered);

    // Auto-start if configured
    if (this.config.autoStart) {
      await this.startServer(config.id);
    }

    this.emit('server:registered', { serverId: config.id });

    return registered;
  }

  /**
   * Register a server from config
   */
  async registerServer(config: ServerConfig): Promise<RegisteredServer> {
    if (config.type === 'npx') {
      return this.registerNpxServer(config as NpxServerConfig);
    }

    // For non-NPX servers, just register without instance
    const registered: RegisteredServer = {
      id: config.id,
      config,
      state: ServerState.STOPPED,
      registeredAt: new Date(),
    };

    this.servers.set(config.id, registered);
    this.emit('server:registered', { serverId: config.id });

    return registered;
  }

  /**
   * Set up event listeners for NPX server
   */
  private setupServerListeners(server: NpxMcpServer): void {
    server.on('starting', ({ serverId }) => {
      const registered = this.servers.get(serverId);
      if (registered) {
        registered.state = ServerState.STARTING;
      }
      this.emit('server:starting', { serverId });
    });

    server.on('started', async ({ serverId }) => {
      const registered = this.servers.get(serverId);
      if (registered) {
        registered.state = ServerState.RUNNING;
        // Discover tools after startup
        await this.discoverTools(serverId);
      }
      this.emit('server:started', { serverId });
    });

    server.on('stopping', ({ serverId }) => {
      const registered = this.servers.get(serverId);
      if (registered) {
        registered.state = ServerState.STOPPING;
      }
      this.emit('server:stopping', { serverId });
    });

    server.on('stopped', ({ serverId }) => {
      const registered = this.servers.get(serverId);
      if (registered) {
        registered.state = ServerState.STOPPED;
      }
      this.emit('server:stopped', { serverId });
    });

    server.on('crashed', ({ serverId, code, signal }) => {
      const registered = this.servers.get(serverId);
      if (registered) {
        registered.state = ServerState.CRASHED;
      }
      this.emit('server:crashed', { serverId, code, signal });
    });

    server.on('error', ({ serverId, error }) => {
      this.emit('server:error', { serverId, error });
    });
  }

  /**
   * Unregister a server
   */
  async unregisterServer(id: string): Promise<void> {
    const registered = this.servers.get(id);

    if (!registered) {
      throw new Error(`Server ${id} is not registered`);
    }

    // Stop the server if it's running
    if (registered.instance && registered.state !== ServerState.STOPPED) {
      await registered.instance.stop();
    }

    // Delete workspace
    const workspace = await this.workspaceManager.getWorkspaceByServerId(id);
    if (workspace) {
      await this.workspaceManager.deleteWorkspace(workspace.id);
    }

    // Remove from registry
    this.servers.delete(id);

    this.emit('server:unregistered', { serverId: id });
  }

  /**
   * Start a server
   */
  async startServer(id: string): Promise<void> {
    const registered = this.servers.get(id);

    if (!registered) {
      throw new Error(`Server ${id} is not registered`);
    }

    if (!registered.instance) {
      throw new Error(
        `Server ${id} does not have an instance (non-NPX server)`,
      );
    }

    await registered.instance.start();
  }

  /**
   * Stop a server
   */
  async stopServer(id: string): Promise<void> {
    const registered = this.servers.get(id);

    if (!registered) {
      throw new Error(`Server ${id} is not registered`);
    }

    if (!registered.instance) {
      throw new Error(
        `Server ${id} does not have an instance (non-NPX server)`,
      );
    }

    await registered.instance.stop();
  }

  /**
   * Restart a server
   */
  async restartServer(id: string): Promise<void> {
    const registered = this.servers.get(id);

    if (!registered) {
      throw new Error(`Server ${id} is not registered`);
    }

    if (!registered.instance) {
      throw new Error(
        `Server ${id} does not have an instance (non-NPX server)`,
      );
    }

    await registered.instance.restart();
  }

  /**
   * Get a registered server
   */
  getServer(id: string): RegisteredServer | null {
    return this.servers.get(id) || null;
  }

  /**
   * List all registered servers
   */
  listServers(): RegisteredServer[] {
    return Array.from(this.servers.values());
  }

  /**
   * Get servers by state
   */
  getServersByState(state: ServerState): RegisteredServer[] {
    return Array.from(this.servers.values()).filter((s) => s.state === state);
  }

  /**
   * Discover tools from a server
   */
  private async discoverTools(serverId: string): Promise<void> {
    const runtime = await this.runtime;
    const registered = this.servers.get(serverId);

    if (!registered || !registered.instance) {
      return;
    }

    try {
      // Send discovery request to server
      const discoveryRequest = JSON.stringify({
        jsonrpc: '2.0',
        id: await runtime.idGenerator.generate(),
        method: 'tools/list',
      });

      await registered.instance.send(`${discoveryRequest}\n`);

      // Wait for response with timeout
      const tools = await this.waitForDiscoveryResponse(
        registered.instance,
        this.config.discoveryTimeoutMs || this.defaults.discoveryTimeoutMs,
      );

      // Update registered server with discovered tools
      registered.tools = tools;

      this.emit('server:tools-discovered', {
        serverId,
        tools,
      });
    } catch (error) {
      console.error(`Failed to discover tools for server ${serverId}:`, error);
    }
  }

  /**
   * Wait for discovery response from server
   */
  private async waitForDiscoveryResponse(
    server: NpxMcpServer,
    timeoutMs: number,
  ): Promise<string[]> {
    const runtime = await this.runtime;

    return new Promise((resolve, _reject) => {
      let buffer = '';
      const tools: string[] = [];
      let cleanupStdout: (() => void) | null = null;

      const onData = (data: Buffer) => {
        buffer += data.toString();

        // Try to parse JSON-RPC response
        const lines = buffer.split('\n');

        for (const line of lines) {
          if (line.trim()) {
            try {
              const response = JSON.parse(line);

              if (response.result && Array.isArray(response.result.tools)) {
                for (const tool of response.result.tools) {
                  if (tool.name) {
                    tools.push(tool.name);
                  }
                }

                cleanup();
                resolve(tools);
                return;
              }
            } catch {
              // Not valid JSON, continue buffering
            }
          }
        }
      };

      const cleanup = () => {
        if (cleanupStdout) {
          cleanupStdout();
        }
        runtime.clearTimeout(timeoutId);
      };

      const timeoutId = runtime.setTimeout(() => {
        cleanup();
        resolve(tools); // Return whatever we found
      }, timeoutMs);

      // Store cleanup function
      cleanupStdout = server.onStdout(onData);
    });
  }

  /**
   * Perform health checks on all servers
   */
  private async performHealthChecks(): Promise<void> {
    const promises: Promise<void>[] = [];

    for (const registered of this.servers.values()) {
      if (registered.instance && registered.state === ServerState.RUNNING) {
        promises.push(this.checkServerHealth(registered));
      }
    }

    await Promise.allSettled(promises);
  }

  /**
   * Check health of a single server
   */
  private async checkServerHealth(registered: RegisteredServer): Promise<void> {
    const runtime = await this.runtime;

    if (!registered.instance) {
      return;
    }

    try {
      // Send ping request
      const pingRequest = JSON.stringify({
        jsonrpc: '2.0',
        id: await runtime.idGenerator.generate(),
        method: 'ping',
      });

      await registered.instance.send(`${pingRequest}\n`);

      // Update last health check time and reset failure count
      registered.lastHealthCheck = new Date();
      registered.healthCheckFailures = 0;
      delete registered.lastHealthCheckError;

      this.emit('server:health-check', {
        serverId: registered.id,
        healthy: true,
      });
    } catch (error) {
      // Increment failure count
      registered.healthCheckFailures =
        (registered.healthCheckFailures || 0) + 1;
      registered.lastHealthCheckError =
        error instanceof Error ? error.message : String(error);

      this.emit('server:health-check', {
        serverId: registered.id,
        healthy: false,
        error: registered.lastHealthCheckError,
        failureCount: registered.healthCheckFailures,
      });

      // Check if auto-restart is needed
      const maxFailures =
        this.config.maxHealthCheckFailures ||
        this.defaults.maxHealthCheckFailures;
      const autoRestart =
        this.config.autoRestartOnHealthFailure ??
        this.defaults.autoRestartOnHealthFailure;

      if (autoRestart && registered.healthCheckFailures >= maxFailures) {
        console.warn(
          `Server ${registered.id} failed ${registered.healthCheckFailures} consecutive health checks. Attempting auto-restart...`,
        );

        // Attempt to restart the server
        await this.attemptAutoRestart(registered);
      }
    }
  }

  /**
   * Attempt to auto-restart a failed server
   */
  private async attemptAutoRestart(
    registered: RegisteredServer,
  ): Promise<void> {
    if (!registered.instance) {
      return;
    }

    // Track auto-restart attempts to prevent infinite loops
    const maxAutoRestartAttempts = 3;
    const autoRestartAttempts = registered.autoRestartAttempts || 0;

    if (autoRestartAttempts >= maxAutoRestartAttempts) {
      console.error(
        `Server ${registered.id} exceeded max auto-restart attempts (${maxAutoRestartAttempts})`,
      );
      registered.state = ServerState.CRASHED;
      return;
    }

    try {
      this.emit('server:auto-restart', {
        serverId: registered.id,
        reason: 'health_check_failure',
        failures: registered.healthCheckFailures,
        attempt: autoRestartAttempts + 1,
      });

      // Increment attempt counter
      registered.autoRestartAttempts = autoRestartAttempts + 1;

      // Restart the server
      await registered.instance.restart();

      // Reset failure count and attempt counter after successful restart
      registered.healthCheckFailures = 0;
      delete registered.lastHealthCheckError;
      delete registered.autoRestartAttempts;

      this.emit('server:auto-restart-success', {
        serverId: registered.id,
      });

      console.log(`Server ${registered.id} auto-restarted successfully`);
    } catch (error) {
      this.emit('server:auto-restart-failed', {
        serverId: registered.id,
        error: error instanceof Error ? error.message : String(error),
        attempt: registered.autoRestartAttempts,
      });

      console.error(`Failed to auto-restart server ${registered.id}:`, error);

      // Mark server as crashed if restart fails
      registered.state = ServerState.CRASHED;
    }
  }

  /**
   * Get registry statistics
   */
  getStats(): {
    totalServers: number;
    serversByState: Record<ServerState, number>;
    serversByType: Record<string, number>;
    totalTools: number;
  } {
    const stats = {
      totalServers: this.servers.size,
      serversByState: {} as Record<ServerState, number>,
      serversByType: {} as Record<string, number>,
      totalTools: 0,
    };

    for (const registered of this.servers.values()) {
      // Count by state
      stats.serversByState[registered.state] =
        (stats.serversByState[registered.state] || 0) + 1;

      // Count by type
      const type = registered.config.type;
      stats.serversByType[type] = (stats.serversByType[type] || 0) + 1;

      // Count tools
      if (registered.tools) {
        stats.totalTools += registered.tools.length;
      }
    }

    return stats;
  }

  /**
   * Shutdown the registry
   */
  async shutdown(): Promise<void> {
    const runtime = await this.runtime;

    // Stop health check interval
    if (this.healthCheckInterval) {
      runtime.clearInterval(this.healthCheckInterval);
      this.healthCheckInterval = null;
    }

    // Stop all servers
    const promises: Promise<void>[] = [];

    for (const registered of this.servers.values()) {
      if (registered.instance && registered.state !== ServerState.STOPPED) {
        promises.push(registered.instance.stop());
      }
    }

    await Promise.allSettled(promises);

    // Clear registry
    this.servers.clear();
    this.removeAllListeners();
  }
}
