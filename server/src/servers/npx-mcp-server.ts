/**
 * NPX MCP Server implementation for dynamic package execution
 */

import { EventEmitter } from 'node:events';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import type {
  ReadResourceResult,
  Resource,
  Tool,
} from '@modelcontextprotocol/sdk/types.js';
import type { NpxServerConfig } from '../config/types.js';
import { getRuntime } from '../runtime/runtime-factory.js';

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
  private transport: StdioClientTransport | null = null;
  private state: ServerState = ServerState.STOPPED;
  private restartCount = 0;
  private lastStartTime: Date | null = null;
  private shutdownRequested = false;
  private runtime = getRuntime();
  private startPromise: Promise<void> | null = null;
  private stopPromise: Promise<void> | null = null;
  private tools: Tool[] = []; // Store discovered tools
  private resources: Resource[] = []; // Store discovered resources

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
   * Call a tool on the server
   */
  async callTool(name: string, args: unknown): Promise<unknown> {
    if (!this.client) {
      throw new Error('Client not connected');
    }
    return await this.client.callTool({ name, arguments: args });
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
      throw new Error(`Cannot start server in state: ${this.state}`);
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
      await this.connectToServer();

      // Discover tools
      await this.discoverTools();

      // Discover resources (optional, don't fail if not supported)
      await this.discoverResources();

      // Transition to RUNNING
      this.state = ServerState.RUNNING;
      this.emit('started', { serverId: this.config.id });
    } catch (error) {
      this.state = ServerState.CRASHED;
      this.emit('error', {
        serverId: this.config.id,
        error: error instanceof Error ? error.message : String(error),
      });

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
    const _runtime = await this.runtime;

    // Build the npx command
    const command = process.platform === 'win32' ? 'npx.cmd' : 'npx';
    const args: string[] = [];

    // Add flags for automatic and offline-preferred execution
    args.push('-y'); // auto-confirm package installation
    args.push('--prefer-offline'); // use cache when available

    // Add version specifier if provided
    if (this.config.version) {
      args.push(`${this.config.package}@${this.config.version}`);
    } else {
      args.push(this.config.package);
    }

    // Add additional arguments
    if (this.config.args && this.config.args.length > 0) {
      args.push(...this.config.args);
    } else if (this.requiresStdioArg()) {
      // Only add stdio argument for servers that need it
      args.push('stdio');
    }

    console.log(`🚀 Starting NPX server ${this.config.id}`);
    console.log(`  Command: ${command} ${args.join(' ')}`);

    // Create StdioClientTransport
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
    await this.client.connect(this.transport);
    console.log(`🏮 Server ${this.config.id} initialized successfully`);
  }

  /**
   * Discover available tools from the server
   */
  private async discoverTools(): Promise<void> {
    if (!this.client) {
      throw new Error('Client not connected');
    }

    try {
      console.log(`  🔍 Discovering tools for ${this.config.id}...`);
      const response = await this.client.listTools();
      this.tools = response.tools;
      console.log(
        `  ✅ Found ${this.tools.length} tools for ${this.config.id}`,
      );

      // Emit tools discovered event
      this.emit('tools-discovered', {
        serverId: this.config.id,
        tools: this.tools,
      });
    } catch (error) {
      console.error(`Failed to discover tools for ${this.config.id}:`, error);
      throw error;
    }
  }

  /**
   * Discover available resources from the server
   */
  private async discoverResources(): Promise<void> {
    if (!this.client) {
      throw new Error('Client not connected');
    }

    try {
      console.log(`  📚 Discovering resources for ${this.config.id}...`);
      const response = await this.client.listResources();
      this.resources = response.resources;
      console.log(
        `  ✅ Found ${this.resources.length} resources for ${this.config.id}`,
      );

      // Emit resources discovered event
      this.emit('resources-discovered', {
        serverId: this.config.id,
        resources: this.resources,
      });
    } catch (error) {
      console.error(
        `Failed to discover resources for ${this.config.id}:`,
        error,
      );
      // Don't throw - resources are optional
      this.resources = [];
    }
  }

  /**
   * Read a specific resource
   */
  async readResource(uri: string): Promise<ReadResourceResult> {
    if (!this.client) {
      throw new Error('Client not connected');
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
   * Check if this server requires stdio argument
   */
  private requiresStdioArg(): boolean {
    // Known servers that need explicit stdio argument
    const serversNeedingStdio = [
      '@modelcontextprotocol/server-everything',
      '@modelcontextprotocol/server-puppeteer',
      '@modelcontextprotocol/server-github',
    ];

    // Known servers that should NOT have stdio argument
    const serversNotNeedingStdio = ['@modelcontextprotocol/server-filesystem'];

    // Check if this server is in the NOT needing list
    if (
      serversNotNeedingStdio.some((pkg) => this.config.package.includes(pkg))
    ) {
      return false;
    }

    // Check if this server is in the needing list or default to true for unknown servers
    return (
      serversNeedingStdio.some((pkg) => this.config.package.includes(pkg)) ||
      !serversNotNeedingStdio.some((pkg) => this.config.package.includes(pkg))
    );
  }

  /**
   * Schedule a restart
   */
  private async scheduleRestart(): Promise<void> {
    const runtime = await this.runtime;
    const delay = this.config.restartDelayMs || this.defaults.restartDelayMs;

    this.restartCount++;
    console.log(
      `Scheduling restart ${this.restartCount} for server ${this.config.id} in ${delay}ms`,
    );

    // Prevent race condition with proper promise handling
    await new Promise<void>((resolve) => {
      runtime.setTimeout(async () => {
        // Double-check shutdown flag to avoid race condition
        if (!this.shutdownRequested) {
          try {
            await this.start();
            // Reset restart count on successful start
            this.restartCount = 0;
          } catch (error) {
            console.error(`Failed to restart server ${this.config.id}:`, error);
          }
        }
        resolve();
      }, delay);
    });
  }

  /**
   * Stop the server
   */
  async stop(): Promise<void> {
    // Return existing stop promise if already stopping
    if (this.stopPromise) {
      return this.stopPromise;
    }

    // Check if already stopped
    if (this.state === ServerState.STOPPED) {
      return;
    }

    // Stop the server with proper concurrency control
    this.stopPromise = this.performStop();
    try {
      await this.stopPromise;
    } finally {
      this.stopPromise = null;
    }
  }

  /**
   * Perform the actual stop operation
   */
  private async performStop(): Promise<void> {
    if (this.state === ServerState.STOPPING) {
      // Already stopping, wait for completion
      return new Promise((resolve) => {
        this.once('stopped', resolve);
      });
    }

    this.shutdownRequested = true;
    this.state = ServerState.STOPPING;
    this.emit('stopping', { serverId: this.config.id });

    // Close MCP client
    if (this.client) {
      try {
        await this.client.close();
      } catch (error) {
        console.error(
          `Failed to close MCP client for ${this.config.id}:`,
          error,
        );
      }
      this.client = null;
    }

    // Close transport
    if (this.transport) {
      try {
        await this.transport.close();
      } catch (error) {
        console.error(
          `Failed to close transport for ${this.config.id}:`,
          error,
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
    await this.stop();
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
