/**
 * Server registry for managing MCP servers
 */

import { EventEmitter } from 'node:events';
import { join } from 'node:path';
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

import { logger } from '../observability/minimal-logger.js';
import type { RegistryStorage } from '../storage/registry-storage.js';
import type { ServerState as StorageServerState } from '../storage/types.js';
import { ErrorHelpers } from '../utils/errors.js';
// import { sanitizeLog } from '../utils/security.js';
import { NpxMcpServer, ServerState } from './npx-mcp-server.js';
import { RemoteMcpServer } from './remote-mcp-server.js';

/**
 * Server event argument types
 */
interface ServerEventArgs {
  serverId: string;
}

interface ServerCrashedEventArgs extends ServerEventArgs {
  code?: number;
  signal?: string;
}

interface ServerErrorEventArgs extends ServerEventArgs {
  error: Error;
}

interface ToolDiscoveredEventArgs extends ServerEventArgs {
  tools: Tool[];
}

interface ResourceDiscoveredEventArgs extends ServerEventArgs {
  resources: Resource[];
}

interface PromptDiscoveredEventArgs extends ServerEventArgs {
  prompts: Prompt[];
}

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
  isRestarting?: boolean; // Flag to prevent health checks during restart
  lastRestartAt?: Date; // Track when last restart occurred
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
/**
 * Convert internal ServerState enum to storage state string
 */
function toStorageState(state: ServerState): StorageServerState['state'] {
  switch (state) {
    case ServerState.STOPPED:
      return 'stopped';
    case ServerState.STARTING:
    case ServerState.INITIALIZED:
    case ServerState.TOOLS_DISCOVERING:
    case ServerState.TOOLS_READY:
    case ServerState.RESOURCES_DISCOVERING:
    case ServerState.RESOURCES_READY:
    case ServerState.PROMPTS_DISCOVERING:
    case ServerState.PROMPTS_READY:
    case ServerState.READY:
    case ServerState.RUNNING:
      return 'running';
    case ServerState.STOPPING:
      return 'stopped';
    case ServerState.CRASHED:
    case ServerState.ERROR:
      return 'failed';
    default:
      return 'pending';
  }
}

export class ServerRegistry extends EventEmitter {
  private servers = new Map<string, RegisteredServer>();

  private config: ServerRegistryConfig;
  private healthCheckInterval: unknown = null;

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

  constructor(storage?: RegistryStorage, config?: ServerRegistryConfig) {
    super();

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
    // Initialize storage if available
    if (this.storage) {
      await this.storage.init();

      // Restore server states
      const savedStates = await this.storage.getAllServerStates();
      for (const [serverId, state] of savedStates.entries()) {
        logger.info(`Restoring state for server ${serverId}: ${state.state}`);
        // Store minimal state for recovery tracking
        // Actual server instances will be created on demand
      }
    }

    // Start health check interval
    if (this.config.healthCheckIntervalMs) {
      this.healthCheckInterval = setInterval(
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
      throw ErrorHelpers.serverAlreadyRegistered(config.id);
    }

    // Use temp directory for NPX servers
    const tmpDir = require('node:os').tmpdir();
    const workDir = join(tmpDir, 'hatago-npx', config.id);

    // Create work directory if needed
    const { fileSystem } = await import('../utils/node-utils.js');
    await fileSystem.mkdir(workDir, { recursive: true });

    // Update config with workspace directory
    const serverConfig: NpxServerConfig = {
      ...config,
      workDir,
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
        state: toStorageState(registered.state),
        lastStartedAt:
          registered.state === ServerState.RUNNING ? new Date() : undefined,
        discoveredTools: registered.tools?.map((t) => t.name),
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
      throw ErrorHelpers.serverAlreadyRegistered(config.id);
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
        state: toStorageState(registered.state),
        lastStartedAt:
          registered.state === ServerState.RUNNING ? new Date() : undefined,
        discoveredTools: registered.tools?.map((t) => t.name),
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
    logger.info(
      `[ServerRegistry] registerLocalServer called with config.cwd: ${config.cwd}`,
    );
    // Check if server already exists
    if (this.servers.has(config.id)) {
      throw ErrorHelpers.serverAlreadyRegistered(config.id);
    }

    // Use temp directory for local servers
    const tmpDir = require('node:os').tmpdir();
    const workDir = join(tmpDir, 'hatago-local', config.id);

    // Create work directory if needed
    const { fileSystem } = await import('../utils/node-utils.js');
    await fileSystem.mkdir(workDir, { recursive: true });

    // Update config with workspace directory (use cwd if provided)
    const serverConfig: LocalServerConfig = {
      ...config,
      cwd: config.cwd || workDir,
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
      // Use cwd from config if provided, otherwise use workspace path
      workDir: config.cwd || workDir,
      autoRestart: undefined, // Local servers don't have auto-restart config
      maxRestarts: undefined,
      restartDelayMs: undefined,
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
        state: toStorageState(registered.state),
        lastStartedAt:
          registered.state === ServerState.RUNNING ? new Date() : undefined,
        discoveredTools: registered.tools?.map((t) => t.name),
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

    // This should never happen (all types are handled above)
    throw new Error(
      `Unknown server type: ${(config as { type: string }).type}`,
    );
  }

  /**
   * Set up event listeners for MCP server (NPX or Remote)
   */
  private setupServerListeners(server: NpxMcpServer | RemoteMcpServer): void {
    // Store listener functions for later cleanup
    type ListenerFunc = (...args: unknown[]) => void;
    const listeners = new Map<string, ListenerFunc>();

    const startingListener = (args: unknown) => {
      const typedArgs = args as ServerEventArgs;
      const { serverId } = typedArgs;
      const registered = this.servers.get(serverId);
      if (registered) {
        registered.state = ServerState.STARTING;
      }
      this.emit('server:starting', { serverId });
    };
    listeners.set('starting', startingListener);
    server.on('starting', startingListener as (...args: unknown[]) => void);

    const startedListener = async (args: unknown) => {
      const typedArgs = args as ServerEventArgs;
      const { serverId } = typedArgs;
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
    server.on('started', startedListener as (...args: unknown[]) => void);

    const stoppingListener = (args: unknown) => {
      const typedArgs = args as ServerEventArgs;
      const { serverId } = typedArgs;
      const registered = this.servers.get(serverId);
      if (registered) {
        registered.state = ServerState.STOPPING;
      }
      this.emit('server:stopping', { serverId });
    };
    listeners.set('stopping', stoppingListener);
    server.on('stopping', stoppingListener as (...args: unknown[]) => void);

    const stoppedListener = (args: unknown) => {
      const typedArgs = args as ServerEventArgs;
      const { serverId } = typedArgs;
      const registered = this.servers.get(serverId);
      if (registered) {
        registered.state = ServerState.STOPPED;
      }
      this.emit('server:stopped', { serverId });
    };
    listeners.set('stopped', stoppedListener);
    server.on('stopped', stoppedListener as (...args: unknown[]) => void);

    const crashedListener = (args: unknown) => {
      const typedArgs = args as ServerCrashedEventArgs;
      const { serverId, code, signal } = typedArgs;
      const registered = this.servers.get(serverId);
      if (registered) {
        registered.state = ServerState.CRASHED;
      }
      this.emit('server:crashed', { serverId, code, signal });
    };
    listeners.set('crashed', crashedListener);
    server.on('crashed', crashedListener as (...args: unknown[]) => void);

    const errorListener = (args: unknown) => {
      const typedArgs = args as ServerErrorEventArgs;
      const { serverId, error } = typedArgs;
      this.emit('server:error', { serverId, error });
    };
    listeners.set('error', errorListener);
    server.on('error', errorListener as (...args: unknown[]) => void);

    // Tools discovered event listener
    const toolsDiscoveredListener = (args: unknown) => {
      const typedArgs = args as ToolDiscoveredEventArgs;
      const { serverId, tools } = typedArgs;
      const registered = this.servers.get(serverId);
      if (registered) {
        registered.tools = tools;
        this.emit('server:tools-discovered', { serverId, tools });
      }
    };
    listeners.set('tools-discovered', toolsDiscoveredListener);
    server.on(
      'tools-discovered',
      toolsDiscoveredListener as (...args: unknown[]) => void,
    );

    // Resources discovered event listener
    const resourcesDiscoveredListener = (args: unknown) => {
      const typedArgs = args as ResourceDiscoveredEventArgs;
      const { serverId, resources } = typedArgs;
      const registered = this.servers.get(serverId);
      if (registered) {
        registered.resources = resources;
        this.emit('server:resources-discovered', { serverId, resources });
      }
    };
    listeners.set('resources-discovered', resourcesDiscoveredListener);
    server.on(
      'resources-discovered',
      resourcesDiscoveredListener as (...args: unknown[]) => void,
    );

    // Prompts discovered event listener
    const promptsDiscoveredListener = (args: unknown) => {
      const typedArgs = args as PromptDiscoveredEventArgs;
      const { serverId, prompts } = typedArgs;
      const registered = this.servers.get(serverId);
      if (registered) {
        registered.prompts = prompts;
        this.emit('server:prompts-discovered', { serverId, prompts });
      }
    };
    listeners.set('prompts-discovered', promptsDiscoveredListener);
    server.on(
      'prompts-discovered',
      promptsDiscoveredListener as (...args: unknown[]) => void,
    );

    // Store listeners map for cleanup (WeakMap prevents memory leaks)
    this.serverListeners.set(server, listeners);
  }

  /**
   * Unregister a server
   */
  async unregisterServer(id: string): Promise<void> {
    const registered = this.servers.get(id);

    if (!registered) {
      throw ErrorHelpers.serverNotRegistered(id);
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

    // Clean up workspace directory if it exists
    const tmpDir = require('node:os').tmpdir();
    const workDirNpx = join(tmpDir, 'hatago-npx', id);
    const workDirLocal = join(tmpDir, 'hatago-local', id);
    const { fileSystem } = await import('../utils/node-utils.js');

    // Try to clean both possible directories
    for (const dir of [workDirNpx, workDirLocal]) {
      try {
        await fileSystem.stat(dir);
        await fileSystem.rm(dir, { recursive: true });
      } catch {
        // Directory doesn't exist, ignore
      }
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
      throw ErrorHelpers.serverNotRegistered(id);
    }

    if (!registered.instance) {
      throw ErrorHelpers.invalidInput(
        'server',
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
        discoveredTools: registered.tools?.map((t) => t.name),
      });
    }
  }

  /**
   * Stop a server
   */
  async stopServer(id: string): Promise<void> {
    const registered = this.servers.get(id);

    if (!registered) {
      throw ErrorHelpers.serverNotRegistered(id);
    }

    if (!registered.instance) {
      throw ErrorHelpers.invalidInput(
        'server',
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
        discoveredTools: registered.tools?.map((t) => t.name),
      });
    }
  }

  /**
   * Restart a server
   */
  async restartServer(id: string): Promise<void> {
    const registered = this.servers.get(id);

    if (!registered) {
      throw ErrorHelpers.serverNotRegistered(id);
    }

    if (!registered.instance) {
      throw ErrorHelpers.invalidInput(
        'server',
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
      const safeError = String(error); // await sanitizeLog(String(error));
      // Tools discovery should rarely fail, but log as warn instead of error
      logger.warn(
        `Failed to discover tools for server ${serverId}:`,
        safeError,
      );
    }
  }

  /**
   * Discover resources from a server with Circuit Breaker pattern
   */
  private async discoverResources(serverId: string): Promise<void> {
    const registered = this.servers.get(serverId);

    if (!registered || !registered.instance) {
      return;
    }

    // Check circuit breaker
    const failures = this.resourceDiscoveryFailures.get(serverId) || 0;
    if (failures >= this.maxConsecutiveFailures) {
      logger.warn(
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

      const safeError = String(error); // await sanitizeLog(String(error));
      // Resources discovery failure is normal for servers that don't implement it
      logger.debug(
        `Server ${serverId} doesn't implement resources/list (attempt ${currentFailures + 1}/${this.maxConsecutiveFailures})`,
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
      // Skip health check for servers that are:
      // - Not running
      // - Currently restarting
      // - Already crashed
      if (
        registered.instance &&
        registered.state === ServerState.RUNNING &&
        !registered.isRestarting
      ) {
        promises.push(this.checkServerHealth(registered));
      }
    }

    await Promise.allSettled(promises);
  }

  /**
   * Check health of a single server
   */
  private async checkServerHealth(registered: RegisteredServer): Promise<void> {
    const { generateId } = await import('../utils/node-utils.js');

    if (!registered.instance) {
      return;
    }

    try {
      // Send a standard MCP request for health check (tools/list is always supported)
      const _healthCheckRequest = JSON.stringify({
        jsonrpc: '2.0',
        id: await generateId(),
        method: 'tools/list',
      });

      // For remote servers, use the appropriate method
      if (registered.instance instanceof RemoteMcpServer) {
        // Remote servers have a listTools method
        const result = await registered.instance.listTools();
        if (!result || (typeof result === 'object' && 'error' in result)) {
          throw new Error('Health check failed: tools/list returned error');
        }
      } else if (registered.instance instanceof NpxMcpServer) {
        // NPX/Local servers: check if getTools works
        const tools = registered.instance.getTools();
        if (!Array.isArray(tools)) {
          throw new Error('Health check failed: getTools did not return array');
        }
      }

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
          state: toStorageState(registered.state),
          failureCount: registered.healthCheckFailures,
          lastFailureAt: new Date(),
          lastFailureReason: registered.lastHealthCheckError,
          discoveredTools: registered.tools?.map((t) => t.name),
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
        logger.warn(
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
    if (!registered.instance || registered.isRestarting) {
      return;
    }

    // Track auto-restart attempts to prevent infinite loops
    const maxAutoRestartAttempts = 3;
    const autoRestartAttempts = registered.autoRestartAttempts || 0;

    if (autoRestartAttempts >= maxAutoRestartAttempts) {
      logger.error(
        `Server ${registered.id} exceeded max auto-restart attempts (${maxAutoRestartAttempts})`,
      );
      registered.state = ServerState.CRASHED;
      return;
    }

    // Implement exponential backoff for restart attempts
    // First attempt: immediate, second: 5s, third: 15s
    const backoffMs =
      autoRestartAttempts === 0
        ? 0
        : Math.min(5000 * 2 ** (autoRestartAttempts - 1), 30000);

    if (backoffMs > 0) {
      logger.info(
        `Waiting ${backoffMs / 1000}s before restart attempt ${autoRestartAttempts + 1} for server ${registered.id}`,
      );
      await new Promise((resolve) => setTimeout(resolve, backoffMs));
    }

    try {
      // Set restarting flag to prevent health checks during restart
      registered.isRestarting = true;
      registered.lastRestartAt = new Date();

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

      // Clear restarting flag and reset counters after successful restart
      registered.isRestarting = false;
      registered.healthCheckFailures = 0;
      delete registered.lastHealthCheckError;
      delete registered.autoRestartAttempts;

      this.emit('server:auto-restart-success', {
        serverId: registered.id,
      });

      logger.info(`🏮 Server ${registered.id} auto-restarted successfully`);
    } catch (error) {
      // Clear restarting flag even on failure
      registered.isRestarting = false;
      this.emit('server:auto-restart-failed', {
        serverId: registered.id,
        error: error instanceof Error ? error.message : String(error),
        attempt: registered.autoRestartAttempts,
      });

      const safeError = String(error); // await sanitizeLog(String(error));
      logger.error(
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
      logger.warn(`Server ${serverId} not found for tool registration`);
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
      logger.warn(`Server ${serverId} not found for resource registration`);
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
      logger.warn(`Server ${serverId} not found for prompt registration`);
      return;
    }

    registered.prompts = prompts;
    this.emit('server:prompts-discovered', { serverId, prompts });
  }

  /**
   * Shutdown the registry
   */
  public async onShutdown(): Promise<void> {
    // Stop health check interval
    if (this.healthCheckInterval) {
      clearInterval(this.healthCheckInterval as NodeJS.Timeout);
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

    // EventEmitter cleanup
    this.removeAllListeners();

    // Close storage
    if (this.storage) {
      await this.storage.close();
    }
  }
}
