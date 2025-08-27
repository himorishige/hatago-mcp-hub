/**
 * NPX MCP Server implementation for dynamic package execution
 */

import { EventEmitter } from 'node:events';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import type {
  Prompt,
  ReadResourceResult,
  Resource,
  ResourceTemplate,
  Tool,
} from '@modelcontextprotocol/sdk/types.js';
import type { NpxServerConfig } from '../config/types.js';

import { ErrorHelpers } from '../utils/errors.js';
import { logger } from '../utils/logger.js';
import { CustomStdioTransport } from './custom-stdio-transport.js';

/**
 * Server state enum
 */
export enum ServerState {
  STOPPED = 'stopped',
  STARTING = 'starting',
  INITIALIZED = 'initialized',
  TOOLS_DISCOVERING = 'tools_discovering',
  TOOLS_READY = 'tools_ready',
  RUNNING = 'running',
  STOPPING = 'stopping',
  CRASHED = 'crashed',
}

/**
 * NPX MCP Server for spawning and managing MCP servers via npx
 */
export class NpxMcpServer extends EventEmitter {
  private config: NpxServerConfig;
  private client: Client | null = null;
  private transport: StdioClientTransport | CustomStdioTransport | null = null;
  private state: ServerState = ServerState.STOPPED;
  private restartCount = 0;
  private lastStartTime: Date | null = null;
  private shutdownRequested = false;

  private startPromise: Promise<void> | null = null;
  private tools: Tool[] = []; // Store discovered tools
  private resources: Resource[] = []; // Store discovered resources
  private prompts: Prompt[] = []; // Store discovered prompts
  private resourceTemplates: ResourceTemplate[] = []; // Store discovered resource templates

  // Default configuration with separated timeouts
  private readonly defaults = {
    restartDelayMs: 1000,
    maxRestarts: 3,
    // Separated timeouts for different phases
    installTimeoutMs: 120000, // 120s for first-time npm install
    processTimeoutMs: 30000, // 30s for process spawn
    initTimeoutMs: 30000, // 30s for MCP initialization
    // Legacy timeout for backward compatibility
    timeout: 30000,
  };

  constructor(config: NpxServerConfig) {
    super();
    this.config = {
      ...this.defaults,
      ...config,
    };
  }

  /**
   * Get server ID
   */
  getId(): string {
    return this.config.id;
  }

  /**
   * Get server state
   */
  getState(): ServerState {
    return this.state;
  }

  /**
   * Get discovered tools
   */
  getTools(): Tool[] {
    return this.tools;
  }

  /**
   * Get discovered resources
   */
  getResources(): Resource[] {
    return this.resources;
  }

  /**
   * Get discovered prompts
   */
  getPrompts(): Prompt[] {
    return this.prompts;
  }

  /**
   * Get discovered resource templates
   */
  getResourceTemplates(): ResourceTemplate[] {
    return this.resourceTemplates;
  }

  /**
   * Call a tool on the server
   */
  async callTool(
    name: string,
    args: unknown,
    progressToken?: string | number,
  ): Promise<unknown> {
    if (!this.client) {
      throw ErrorHelpers.serverNotConnected(this.config.id);
    }

    const params: any = { name, arguments: args as any };

    // Add progressToken to _meta if provided (for compatibility)
    if (progressToken !== undefined) {
      params._meta = { progressToken };
    }

    return await this.client.callTool(params);
  }

  /**
   * Get server configuration
   */
  getConfig(): NpxServerConfig {
    return this.config;
  }

  /**
   * Start the NPX server
   */
  async start(): Promise<void> {
    // Return existing start promise if already starting
    if (this.startPromise) {
      return this.startPromise;
    }

    // Check if already running
    if (this.state === ServerState.RUNNING) {
      return;
    }

    // Check if in invalid state
    if (
      this.state !== ServerState.STOPPED &&
      this.state !== ServerState.CRASHED
    ) {
      throw ErrorHelpers.stateInvalidTransition(
        this.state,
        'running',
        this.config.id,
      );
    }

    // Start the server with proper concurrency control
    this.startPromise = this.performStart();
    try {
      await this.startPromise;
    } finally {
      this.startPromise = null;
    }
  }

  /**
   * Perform the actual start operation
   */
  private async performStart(): Promise<void> {
    this.shutdownRequested = false;
    this.state = ServerState.STARTING;
    this.lastStartTime = new Date();
    this.emit('starting', { serverId: this.config.id });

    try {
      // Check if package is cached and adjust timeout accordingly
      const isCached = false; // Simple cache check removed

      // Use shorter timeout for cached packages, longer for uncached
      const baseTimeout = this.config.initTimeoutMs || 30000;
      const initTimeoutMs = isCached
        ? Math.min(baseTimeout, 15000) // 15s max for cached packages
        : Math.max(baseTimeout, 60000); // 60s min for uncached packages

      if (!isCached) {
        this.emit('info', {
          serverId: this.config.id,
          message: `Package ${this.config.package || this.config.id} not cached, using extended timeout (${initTimeoutMs}ms)`,
        });
      }

      const timeoutPromise = new Promise<never>((_, reject) => {
        setTimeout(() => {
          reject(
            new Error(
              `NPX server ${this.config.id} initialization timeout after ${initTimeoutMs}ms`,
            ),
          );
        }, initTimeoutMs);
      });

      // Race between connection and timeout
      await Promise.race([this.connectToServer(), timeoutPromise]);

      // Discover tools
      await this.discoverTools();

      // Discover resources (optional, don't fail if not supported)
      await this.discoverResources();

      // Discover resource templates (optional)
      await this.discoverResourceTemplates();

      // Discover prompts (optional, don't fail if not supported)
      await this.discoverPrompts();

      // Transition to RUNNING
      this.state = ServerState.RUNNING;
      this.emit('started', { serverId: this.config.id });
    } catch (error) {
      this.state = ServerState.CRASHED;

      // Check if this was a cache miss error
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      const isCacheMissError =
        errorMessage.includes('npm ERR!') ||
        errorMessage.includes('network') ||
        errorMessage.includes('ENOTFOUND') ||
        errorMessage.includes('ETIMEDOUT');

      if (isCacheMissError) {
        // Try to refresh cache for future attempts
        const packageSpec = this.config.version
          ? `${this.config.package}@${this.config.version}`
          : this.config.package;

        this.emit('error', {
          serverId: this.config.id,
          error: `Cache miss or network error for ${packageSpec}: ${errorMessage}`,
        });
      } else {
        this.emit('error', {
          serverId: this.config.id,
          error: errorMessage,
        });
      }

      // Attempt auto-restart if configured
      if (this.shouldAutoRestart()) {
        await this.scheduleRestart();
      }

      throw error;
    }
  }

  /**
   * Connect to the MCP server using StdioClientTransport
   */
  private async connectToServer(): Promise<void> {
    let command: string;
    let args: string[] = [];

    // Check if this is a generic command (LocalServerConfig disguised as NpxServerConfig)
    // or an actual NPX server
    const isActualNpx =
      this.config.type === 'npx' &&
      ![
        'node',
        'python',
        'deno',
        'bun',
        'uvx',
        'pipx',
        'yarn',
        'pnpm',
      ].includes(this.config.package);

    if (isActualNpx) {
      // Build the npx command
      command = process.platform === 'win32' ? 'npx.cmd' : 'npx';

      // Add flags for automatic and offline-preferred execution
      args.push('-y'); // auto-confirm package installation
      args.push('--prefer-offline'); // use cache when available

      // Add version specifier if provided
      if (this.config.version) {
        args.push(`${this.config.package}@${this.config.version}`);
      } else {
        args.push(this.config.package);
      }

      // Add additional arguments if provided first
      // But handle filesystem server specially
      if (this.config.package.includes('filesystem')) {
        // Filesystem server needs directory paths BEFORE stdio argument
        const hasDirectoryArg = this.config.args?.some(
          (arg) =>
            arg &&
            (arg.startsWith('/') || arg.startsWith('.') || arg.startsWith('~')),
        );

        if (!hasDirectoryArg) {
          // Add default directory
          args.push(this.config.workDir || '/tmp');
        }

        // Add configured args (filesystem server doesn't use 'stdio' argument)
        if (this.config.args && this.config.args.length > 0) {
          args.push(...this.config.args);
        }
      } else {
        // For other servers, add args but filter out 'stdio' (it's not a server argument)
        if (this.config.args && this.config.args.length > 0) {
          const filteredArgs = this.config.args.filter(
            (arg) => arg !== 'stdio',
          );
          args.push(...filteredArgs);
        }
      }
    } else {
      // This is a generic command (e.g., node, python, etc.)
      command = this.config.package; // package field contains the actual command

      // Add arguments directly
      if (this.config.args && this.config.args.length > 0) {
        args = [...this.config.args];
      }
    }

    logger.debug(
      `🚀 Starting server ${this.config.id} (${isActualNpx ? 'NPX' : 'Local command'})`,
    );
    logger.debug(`  Command: ${command} ${args.join(' ')}`);
    logger.debug(
      `  Working directory: ${this.config.workDir || process.cwd()}`,
    );
    logger.debug(`  Timeout: ${this.config.initTimeoutMs || 30000}ms`);

    // Debug: Show the actual command that would be run
    if (!isActualNpx && args.length > 0) {
      logger.debug(
        `  Debug - Resolved command: cd "${this.config.workDir || process.cwd()}" && "${command}" ${args.map((a) => `"${a}"`).join(' ')}`,
      );
    }

    // Check if this is the first run (for extended timeout)
    const isFirstRun = !this.restartCount && !this.lastStartTime;

    // Use custom transport for better control over initialization
    const useCustomTransport =
      process.env.HATAGO_USE_CUSTOM_TRANSPORT !== 'false';

    if (useCustomTransport) {
      logger.debug(
        `  Using custom STDIO transport for better initialization control`,
      );
      this.transport = new CustomStdioTransport({
        command,
        args,
        cwd: this.config.workDir || process.cwd(),
        env: {
          ...this.config.env,
        },
        initTimeoutMs: this.config.initTimeoutMs || 30000,
        isFirstRun,
      });
    } else {
      // Fallback to SDK transport
      this.transport = new StdioClientTransport({
        command,
        args,
        cwd: this.config.workDir || process.cwd(),
        env: {
          ...process.env,
          ...this.config.env,
          // Suppress npm warnings and output
          NO_COLOR: '1',
          FORCE_COLOR: '0',
          npm_config_loglevel: 'silent',
          npm_config_progress: 'false',
          npm_config_update_notifier: 'false',
        },
      });
    }

    // Handle transport errors (CustomStdioTransport has event emitter)
    if (this.transport && 'on' in this.transport) {
      (this.transport as any).on('error', (error: any) => {
        logger.error(
          `❌ Transport error for ${this.config.id}: ${error.message}`,
          `Package: ${this.config.package}`,
        );
      });
    }

    // Create MCP client
    this.client = new Client(
      {
        name: `hatago-hub-${this.config.id}`,
        version: '0.0.2',
      },
      {
        capabilities: {
          tools: {},
          prompts: {},
          resources: {},
        },
      },
    );

    // Connect to the server
    try {
      logger.debug(`🔄 Connecting to ${this.config.id}...`);
      await this.client.connect(this.transport as any);
      logger.debug(`🏢 Server ${this.config.id} initialized successfully`);
    } catch (error) {
      logger.error(
        `❌ Failed to connect to ${this.config.id}`,
        `Package: ${this.config.package}, Error: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );

      // Provide helpful error messages based on the error type
      if (error instanceof Error) {
        if (error.message.includes('spawn npx ENOENT')) {
          logger.debug(`💡 Possible solutions:
  - Add required arguments: --args "stdio"
  - Check if the package name is correct
  - Ensure the package is available on npm`);
        } else if (error.message.includes('timeout')) {
          logger.debug(`💡 Possible solutions:
  - Increase timeout: --init-timeout 60000
  - Check network connectivity`);
        } else if (error.message.includes('Cannot find module')) {
          logger.debug(`💡 Possible solutions:
  - Verify package name: ${this.config.package}
  - Try with explicit version: --version latest`);
        }

        if (process.env.DEBUG === 'true') {
          logger.debug(`Stack trace:`, error.stack);
        }
      }

      throw error;
    }
  }

  /**
   * Discover available tools from the server
   */
  private async discoverTools(): Promise<void> {
    if (!this.client) {
      throw ErrorHelpers.serverNotConnected(this.config.id);
    }

    try {
      logger.debug(`  🔍 Discovering tools for ${this.config.id}...`);
      const response = await this.client.listTools();
      this.tools = response.tools;
      logger.debug(
        `  ✅ Found ${this.tools.length} tools for ${this.config.id}`,
      );

      // Emit tools discovered event
      this.emit('tools-discovered', {
        serverId: this.config.id,
        tools: this.tools,
      });
    } catch (error) {
      logger.debug(
        `Failed to discover tools for ${this.config.id}:`,
        error instanceof Error ? error.message : String(error),
      );
      throw error;
    }
  }

  /**
   * Discover available resources from the server
   */
  private async discoverResources(): Promise<void> {
    if (!this.client) {
      throw ErrorHelpers.serverNotConnected(this.config.id);
    }

    try {
      logger.debug(`  📚 Discovering resources for ${this.config.id}...`);
      const response = await this.client.listResources();
      this.resources = response.resources;
      logger.debug(
        `  ✅ Found ${this.resources.length} resources for ${this.config.id}`,
      );

      // Emit resources discovered event
      this.emit('resources-discovered', {
        serverId: this.config.id,
        resources: this.resources,
      });
    } catch (error) {
      // Resources are optional, log as debug
      logger.debug(
        `Server ${this.config.id} doesn't implement method:`,
        error instanceof Error ? error.message : String(error),
      );
      // Don't throw - resources are optional
      this.resources = [];
    }
  }

  /**
   * Discover available prompts from the server
   */
  private async discoverPrompts(): Promise<void> {
    if (!this.client) {
      throw ErrorHelpers.serverNotConnected(this.config.id);
    }

    try {
      logger.debug(`  💡 Discovering prompts for ${this.config.id}...`);
      const response = await this.client.listPrompts();
      this.prompts = response.prompts;
      logger.debug(
        `  ✅ Found ${this.prompts.length} prompts for ${this.config.id}`,
      );

      // Emit prompts discovered event
      this.emit('prompts-discovered', {
        serverId: this.config.id,
        prompts: this.prompts,
      });
    } catch (error) {
      // Prompts are optional, log as debug
      logger.debug(
        `Server ${this.config.id} doesn't implement method:`,
        error instanceof Error ? error.message : String(error),
      );
      // Don't throw - prompts are optional
      this.prompts = [];
    }
  }

  /**
   * Discover resource templates from the server
   */
  private async discoverResourceTemplates(): Promise<void> {
    if (!this.client) {
      throw ErrorHelpers.serverNotConnected(this.config.id);
    }

    try {
      const result = await this.client.listResourceTemplates();
      this.resourceTemplates = result?.resourceTemplates || [];
      logger.info(
        `Discovered ${this.resourceTemplates.length} resource templates for server ${this.config.id}`,
      );
    } catch (error) {
      // Resource templates are optional, log as debug
      logger.debug(
        `Server ${this.config.id} doesn't implement resources/templates/list:`,
        error instanceof Error ? error.message : String(error),
      );
      // Don't throw - resource templates are optional
      this.resourceTemplates = [];
    }
  }

  /**
   * Get a specific prompt with arguments
   */
  async getPrompt(
    name: string,
    args?: Record<string, unknown>,
  ): Promise<unknown> {
    if (!this.client) {
      throw ErrorHelpers.serverNotConnected(this.config.id);
    }
    return await this.client.getPrompt({ name, arguments: args as any });
  }

  /**
   * Read a specific resource
   */
  async readResource(uri: string): Promise<ReadResourceResult> {
    if (!this.client) {
      throw ErrorHelpers.serverNotConnected(this.config.id);
    }
    return await this.client.readResource({ uri });
  }

  /**
   * Check if server should auto-restart
   */
  private shouldAutoRestart(): boolean {
    if (this.shutdownRequested) {
      return false;
    }

    if (!this.config.autoRestart) {
      return false;
    }

    const maxRestarts = this.config.maxRestarts || this.defaults.maxRestarts;
    return this.restartCount < maxRestarts;
  }

  /**
   * Schedule a restart
   */
  private async scheduleRestart(): Promise<void> {
    const delay = this.config.restartDelayMs || this.defaults.restartDelayMs;

    this.restartCount++;
    logger.debug(
      `Scheduling restart ${this.restartCount} for server ${this.config.id} in ${delay}ms`,
    );

    // Prevent race condition with proper promise handling
    await new Promise<void>((resolve) => {
      setTimeout(async () => {
        // Double-check shutdown flag to avoid race condition
        if (!this.shutdownRequested) {
          try {
            await this.start();
            // Reset restart count on successful start
            this.restartCount = 0;
          } catch (error) {
            logger.error(
              `Failed to restart server ${this.config.id}:`,
              error instanceof Error ? error.message : String(error),
            );
          }
        }
        resolve();
      }, delay);
    });

    // Close transport
    if (this.transport) {
      try {
        await this.transport.close();
      } catch (error) {
        logger.debug(
          `Failed to close transport for ${this.config.id}:`,
          error instanceof Error ? error.message : String(error),
        );
      }
      this.transport = null;
    }

    this.state = ServerState.STOPPED;
    this.emit('stopped', { serverId: this.config.id });
  }

  /**
   * Restart the server
   */
  /**
   * Disconnect from server
   */
  async disconnect(): Promise<void> {
    this.shutdownRequested = true;

    if (this.client) {
      await this.client.close();
      this.client = null;
    }

    if (this.transport) {
      try {
        await this.transport.close();
      } catch (error) {
        logger.debug(
          `Failed to close transport for ${this.config.id}:`,
          error instanceof Error ? error.message : String(error),
        );
      }
      this.transport = null;
    }

    this.state = ServerState.STOPPED;
    this.emit('stopped', { serverId: this.config.id });
  }

  /**
   * Restart the server
   */
  async restart(): Promise<void> {
    // Stop the server first
    await this.disconnect();
    this.restartCount = 0; // Reset restart count for manual restart
    await this.start();
  }

  /**
   * Get server statistics
   */
  getStats(): {
    id: string;
    state: ServerState;
    restartCount: number;
    uptime?: number;
    toolsCount: number;
  } {
    return {
      id: this.config.id,
      state: this.state,
      restartCount: this.restartCount,
      uptime: this.lastStartTime
        ? Date.now() - this.lastStartTime.getTime()
        : undefined,
      toolsCount: this.tools.length,
    };
  }
}
