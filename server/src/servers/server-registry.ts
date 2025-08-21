/**
 * Server registry for managing MCP servers
 */

import { EventEmitter } from 'node:events';
import type {
  Prompt,
  Resource,
  Tool,
} from '@modelcontextprotocol/sdk/types.js';
import type {
  LocalServerConfig,
  NpxServerConfig,
  RemoteServerConfig,
  ServerConfig,
} from '../config/types.js';
import { getRuntime } from '../runtime/runtime-factory.js';
import type { RegistryStorage } from '../storage/registry-storage.js';
import { sanitizeLog } from '../utils/security.js';
import { NpxMcpServer, ServerState } from './npx-mcp-server.js';
import { RemoteMcpServer } from './remote-mcp-server.js';
import type { WorkspaceManager } from './workspace-manager.js';

/**
 * Registered server information
 */
export interface RegisteredServer {
  id: string;
  config: ServerConfig;
  instance?: NpxMcpServer | RemoteMcpServer; // NPX or Remote servers
  state: ServerState;
  registeredAt: Date;
  lastHealthCheck?: Date;
  tools?: Tool[]; // Discovered tools with full metadata
  resources?: Resource[]; // Discovered resources with full metadata
  prompts?: Prompt[]; // Discovered prompts with full metadata
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
  private storage: RegistryStorage | null = null;
  private serverListeners = new WeakMap<
    NpxMcpServer | RemoteMcpServer,
    Map<string, (...args: unknown[]) => void>
  >();

  // Default configuration
  private readonly defaults = {
    autoStart: false,
    healthCheckIntervalMs: 30000, // 30 seconds
    discoveryTimeoutMs: 10000, // 10 seconds
    maxHealthCheckFailures: 3, // 3 consecutive failures
    autoRestartOnHealthFailure: true, // Auto-restart by default
  };

  // Circuit breaker for resource discovery (track consecutive failures)
  private resourceDiscoveryFailures = new Map<string, number>();
  private readonly maxConsecutiveFailures = 3;

  constructor(
    workspaceManager: WorkspaceManager,
    config?: ServerRegistryConfig,
    storage?: RegistryStorage,
  ) {
    super();
    this.workspaceManager = workspaceManager;
    this.config = {
      ...this.defaults,
      ...config,
    };
    this.storage = storage || null;
  }

  /**
   * Initialize the registry
   */
  async initialize(): Promise<void> {
    const runtime = await this.runtime;

    // Initialize storage if available
    if (this.storage) {
      await this.storage.init();

      // Restore server states
      const savedStates = await this.storage.getAllServerStates();
      for (const [serverId, state] of savedStates.entries()) {
        console.log(`Restoring state for server ${serverId}: ${state.state}`);
        // Store minimal state for recovery tracking
        // Actual server instances will be created on demand
      }
    }

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

    // Save to storage
    if (this.storage) {
      await this.storage.saveServerState(config.id, {
        id: config.id,
        type: config.type,
        state: registered.state,
        lastStartedAt: registered.state === 'running' ? new Date() : undefined,
        discoveredTools: registered.tools,
      });
    }

    // Auto-start if configured
    if (this.config.autoStart) {
      await this.startServer(config.id);
    }

    this.emit('server:registered', { serverId: config.id });

    return registered;
  }

  /**
   * Register a new Remote server
   */
  async registerRemoteServer(
    config: RemoteServerConfig,
  ): Promise<RegisteredServer> {
    // Check if server already exists
    if (this.servers.has(config.id)) {
      throw new Error(`Server ${config.id} is already registered`);
    }

    // Create server instance
    const server = new RemoteMcpServer(config);

    // Set up event listeners (reuse existing setup)
    this.setupServerListeners(server);

    // Create registered server entry
    const registered: RegisteredServer = {
      id: config.id,
      config,
      instance: server,
      state: ServerState.STOPPED,
      registeredAt: new Date(),
    };

    // Register the server
    this.servers.set(config.id, registered);

    // Save to storage
    if (this.storage) {
      await this.storage.saveServerState(config.id, {
        id: config.id,
        type: config.type,
        state: registered.state,
        lastStartedAt: registered.state === 'running' ? new Date() : undefined,
        discoveredTools: registered.tools,
      });
    }

    // Auto-start if configured
    if (this.config.autoStart) {
      await this.startServer(config.id);
    }

    this.emit('server:registered', { serverId: config.id });

    return registered;
  }

  /**
   * Register a new Local server
   */
  async registerLocalServer(
    config: LocalServerConfig,
  ): Promise<RegisteredServer> {
    // Check if server already exists
    if (this.servers.has(config.id)) {
      throw new Error(`Server ${config.id} is already registered`);
    }

    // Create workspace for the server
    const workspace = await this.workspaceManager.createWorkspace(config.id);

    // Update config with workspace directory
    const serverConfig: LocalServerConfig = {
      ...config,
      workDir: workspace.path,
    };

    // Create server instance using NpxMcpServer (which can handle any command)
    // We'll pass the config as if it were an NPX server but with a different command
    const npxLikeConfig: NpxServerConfig = {
      id: config.id,
      type: 'npx',
      package: config.command, // Use command as package name
      args: config.args || [],
      transport: config.transport || 'stdio',
      start: config.start || 'lazy',
      env: config.env,
      workDir: workspace.path,
      autoRestart: config.autoRestart,
      maxRestarts: config.maxRestarts,
      restartDelayMs: config.restartDelayMs,
    };

    const server = new NpxMcpServer(npxLikeConfig);

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

    // Save to storage
    if (this.storage) {
      await this.storage.saveServerState(config.id, {
        id: config.id,
        type: config.type,
        state: registered.state,
        lastStartedAt: registered.state === 'running' ? new Date() : undefined,
        discoveredTools: registered.tools,
      });
    }

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

    if (config.type === 'remote') {
      return this.registerRemoteServer(config as RemoteServerConfig);
    }

    if (config.type === 'local') {
      return this.registerLocalServer(config as LocalServerConfig);
    }

    // For local servers, just register without instance (handled by MCP Hub directly)
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
   * Set up event listeners for MCP server (NPX or Remote)
   */
  private setupServerListeners(server: NpxMcpServer | RemoteMcpServer): void {
    // Store listener functions for later cleanup
    type ListenerFunc = (...args: unknown[]) => void;
    const listeners = new Map<string, ListenerFunc>();

    const startingListener = ({ serverId }: { serverId: string }) => {
      const registered = this.servers.get(serverId);
      if (registered) {
        registered.state = ServerState.STARTING;
      }
      this.emit('server:starting', { serverId });
    };
    listeners.set('starting', startingListener);
    server.on('starting', startingListener);

    const startedListener = async ({ serverId }: { serverId: string }) => {
      const registered = this.servers.get(serverId);
      if (registered) {
        registered.state = ServerState.RUNNING;
        // Discover tools and resources after startup
        await this.discoverTools(serverId);
        await this.discoverResources(serverId);
      }
      this.emit('server:started', { serverId });
    };
    listeners.set('started', startedListener);
    server.on('started', startedListener);

    const stoppingListener = ({ serverId }: { serverId: string }) => {
      const registered = this.servers.get(serverId);
      if (registered) {
        registered.state = ServerState.STOPPING;
      }
      this.emit('server:stopping', { serverId });
    };
    listeners.set('stopping', stoppingListener);
    server.on('stopping', stoppingListener);

    const stoppedListener = ({ serverId }: { serverId: string }) => {
      const registered = this.servers.get(serverId);
      if (registered) {
        registered.state = ServerState.STOPPED;
      }
      this.emit('server:stopped', { serverId });
    };
    listeners.set('stopped', stoppedListener);
    server.on('stopped', stoppedListener);

    const crashedListener = ({
      serverId,
      code,
      signal,
    }: {
      serverId: string;
      code?: number;
      signal?: string;
    }) => {
      const registered = this.servers.get(serverId);
      if (registered) {
        registered.state = ServerState.CRASHED;
      }
      this.emit('server:crashed', { serverId, code, signal });
    };
    listeners.set('crashed', crashedListener);
    server.on('crashed', crashedListener);

    const errorListener = ({
      serverId,
      error,
    }: {
      serverId: string;
      error: string;
    }) => {
      this.emit('server:error', { serverId, error });
    };
    listeners.set('error', errorListener);
    server.on('error', errorListener);

    // Tools discovered event listener
    const toolsDiscoveredListener = ({
      serverId,
      tools,
    }: {
      serverId: string;
      tools: Tool[];
    }) => {
      const registered = this.servers.get(serverId);
      if (registered) {
        registered.tools = tools;
        this.emit('server:tools-discovered', { serverId, tools });
      }
    };
    listeners.set('tools-discovered', toolsDiscoveredListener);
    server.on('tools-discovered', toolsDiscoveredListener);

    // Resources discovered event listener
    const resourcesDiscoveredListener = ({
      serverId,
      resources,
    }: {
      serverId: string;
      resources: Resource[];
    }) => {
      const registered = this.servers.get(serverId);
      if (registered) {
        registered.resources = resources;
        this.emit('server:resources-discovered', { serverId, resources });
      }
    };
    listeners.set('resources-discovered', resourcesDiscoveredListener);
    server.on('resources-discovered', resourcesDiscoveredListener);

    // Prompts discovered event listener
    const promptsDiscoveredListener = ({
      serverId,
      prompts,
    }: {
      serverId: string;
      prompts: Prompt[];
    }) => {
      const registered = this.servers.get(serverId);
      if (registered) {
        registered.prompts = prompts;
        this.emit('server:prompts-discovered', { serverId, prompts });
      }
    };
    listeners.set('prompts-discovered', promptsDiscoveredListener);
    server.on('prompts-discovered', promptsDiscoveredListener);

    // Store listeners map for cleanup (WeakMap prevents memory leaks)
    this.serverListeners.set(server, listeners);
  }

  /**
   * Unregister a server
   */
  async unregisterServer(id: string): Promise<void> {
    const registered = this.servers.get(id);

    if (!registered) {
      throw new Error(`Server ${id} is not registered`);
    }

    // Clean up event listeners
    if (registered.instance) {
      const listeners = this.serverListeners.get(registered.instance);
      if (listeners) {
        for (const [event, listener] of listeners) {
          registered.instance.off(event, listener);
        }
        this.serverListeners.delete(registered.instance);
      }
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

    // Remove from storage
    if (this.storage) {
      await this.storage.deleteServerState(id);
    }

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

    // Update storage
    if (this.storage) {
      await this.storage.saveServerState(id, {
        id,
        type: registered.config.type,
        state: ServerState.RUNNING,
        lastStartedAt: new Date(),
        discoveredTools: registered.tools,
      });
    }
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

    // Update storage
    if (this.storage) {
      await this.storage.saveServerState(id, {
        id,
        type: registered.config.type,
        state: ServerState.STOPPED,
        lastStoppedAt: new Date(),
        discoveredTools: registered.tools,
      });
    }
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
    const _runtime = await this.runtime;
    const registered = this.servers.get(serverId);

    if (!registered || !registered.instance) {
      return;
    }

    try {
      let tools: Tool[] = [];

      if (registered.instance instanceof RemoteMcpServer) {
        // For remote servers, use the direct API
        const result = await registered.instance.listTools();
        if (result && typeof result === 'object' && 'tools' in result) {
          const toolsResult = result as { tools: Tool[] };
          if (Array.isArray(toolsResult.tools)) {
            tools = toolsResult.tools;
          }
        }
      } else if (registered.instance instanceof NpxMcpServer) {
        // For NPX servers, use the getTools method
        tools = registered.instance.getTools();
      }

      // Update registered server with discovered tools
      registered.tools = tools;

      this.emit('server:tools-discovered', {
        serverId,
        tools,
      });
    } catch (error) {
      const safeError = await sanitizeLog(String(error));
      console.error(
        `Failed to discover tools for server ${serverId}:`,
        safeError,
      );
    }
  }

  /**
   * Discover resources from a server with Circuit Breaker pattern
   */
  private async discoverResources(serverId: string): Promise<void> {
    const _runtime = await this.runtime;
    const registered = this.servers.get(serverId);

    if (!registered || !registered.instance) {
      return;
    }

    // Check circuit breaker
    const failures = this.resourceDiscoveryFailures.get(serverId) || 0;
    if (failures >= this.maxConsecutiveFailures) {
      console.warn(
        `Circuit breaker open for ${serverId}: skipping resource discovery after ${failures} consecutive failures`,
      );
      registered.resources = [];
      return;
    }

    try {
      let resources: Resource[] = [];

      if (registered.instance instanceof RemoteMcpServer) {
        // For remote servers, use the discoverResources method
        const result = await registered.instance.discoverResources();
        if (Array.isArray(result)) {
          resources = result as Resource[];
        }
      } else if (registered.instance instanceof NpxMcpServer) {
        // For NPX servers, use the getResources method
        resources = registered.instance.getResources();
      }

      // Update registered server with discovered resources
      registered.resources = resources;

      // Reset failure counter on success
      this.resourceDiscoveryFailures.delete(serverId);

      this.emit('server:resources-discovered', {
        serverId,
        resources,
      });
    } catch (error) {
      // Increment failure counter
      const currentFailures = this.resourceDiscoveryFailures.get(serverId) || 0;
      this.resourceDiscoveryFailures.set(serverId, currentFailures + 1);

      const safeError = await sanitizeLog(String(error));
      console.error(
        `Failed to discover resources for server ${serverId} (failure ${currentFailures + 1}/${this.maxConsecutiveFailures}):`,
        safeError,
      );
      // Don't throw - resources are optional
      registered.resources = [];
    }
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

      // Save failure state to storage
      if (this.storage) {
        await this.storage.saveServerState(registered.id, {
          id: registered.id,
          type: registered.config.type,
          state: registered.state,
          failureCount: registered.healthCheckFailures,
          lastFailureAt: new Date(),
          lastFailureReason: registered.lastHealthCheckError,
          discoveredTools: registered.tools,
        });
      }

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

      console.log(`🏮 Server ${registered.id} auto-restarted successfully`);
    } catch (error) {
      this.emit('server:auto-restart-failed', {
        serverId: registered.id,
        error: error instanceof Error ? error.message : String(error),
        attempt: registered.autoRestartAttempts,
      });

      const safeError = await sanitizeLog(String(error));
      console.error(
        `Failed to auto-restart server ${registered.id}:`,
        safeError,
      );

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
   * Get all tools from all registered servers
   */
  getAllTools(): Array<{
    name: string;
    serverId: string;
    description?: string;
    inputSchema?: Record<string, unknown>;
  }> {
    const allTools: Array<{
      name: string;
      serverId: string;
      description?: string;
      inputSchema?: Record<string, unknown>;
    }> = [];

    for (const registered of this.servers.values()) {
      if (registered.tools) {
        for (const tool of registered.tools) {
          allTools.push({
            name: tool.name,
            serverId: registered.id,
            description: tool.description,
            inputSchema: tool.inputSchema,
          });
        }
      }
    }

    return allTools;
  }

  /**
   * Register discovered tools for a server
   */
  registerServerTools(serverId: string, tools: Tool[]): void {
    const registered = this.servers.get(serverId);
    if (!registered) {
      console.warn(`Server ${serverId} not found for tool registration`);
      return;
    }

    registered.tools = tools;
    this.emit('server:tools-discovered', { serverId, tools });
  }

  /**
   * Register discovered resources for a server
   */
  registerServerResources(serverId: string, resources: Resource[]): void {
    const registered = this.servers.get(serverId);
    if (!registered) {
      console.warn(`Server ${serverId} not found for resource registration`);
      return;
    }

    registered.resources = resources;
    this.emit('server:resources-discovered', { serverId, resources });
  }

  /**
   * Register discovered prompts for a server
   */
  registerServerPrompts(serverId: string, prompts: Prompt[]): void {
    const registered = this.servers.get(serverId);
    if (!registered) {
      console.warn(`Server ${serverId} not found for prompt registration`);
      return;
    }

    registered.prompts = prompts;
    this.emit('server:prompts-discovered', { serverId, prompts });
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

    // Close storage
    if (this.storage) {
      await this.storage.close();
    }
  }
}
