/**
 * Remote MCP Server implementation for HTTP/SSE connections
 */

import { EventEmitter } from 'node:events';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import type { RemoteServerConfig } from '../config/types.js';
import { getRuntime } from '../runtime/types.js';
import { sanitizeLog } from '../utils/security.js';

/**
 * Server state enum (reuse from npx-mcp-server)
 */
export enum ServerState {
  STOPPED = 'stopped',
  STARTING = 'starting',
  RUNNING = 'running',
  STOPPING = 'stopping',
  CRASHED = 'crashed',
}

/**
 * Connection information
 */
export interface RemoteConnection {
  client: Client;
  transport: StreamableHTTPClientTransport;
}

/**
 * Remote MCP Server for connecting to HTTP servers via Streamable HTTP transport
 */
export class RemoteMcpServer extends EventEmitter {
  private config: RemoteServerConfig;
  private connection: RemoteConnection | null = null;
  private state: ServerState = ServerState.STOPPED;
  private reconnectCount = 0;
  private firstReconnectAttempt: Date | null = null;
  private lastConnectTime: Date | null = null;
  private shutdownRequested = false;
  private runtime = getRuntime();
  private startPromise: Promise<void> | null = null;
  private stopPromise: Promise<void> | null = null;
  private healthCheckInterval: NodeJS.Timeout | number | null = null;

  // Recursion depth tracking
  private reconnectDepth = 0;
  private reconnectSteps = 0;
  private readonly MAX_RECONNECT_DEPTH = Number(
    process.env.HATAGO_MAX_RECONNECT_DEPTH || 32,
  );
  private readonly MAX_RECONNECT_STEPS = Number(
    process.env.HATAGO_MAX_RECONNECT_STEPS || 10000,
  );

  // Default configuration
  private readonly defaults = {
    reconnectDelayMs: 1000,
    maxReconnects: 5,
    maxReconnectDurationMs: 300000, // 5 minutes max reconnect duration
    connectTimeoutMs: 30000,
    healthCheckIntervalMs: 0, // Disabled by default (0 = no health check)
    healthCheckTimeoutMs: Number(process.env.HATAGO_HEALTH_TIMEOUT_MS || 5000), // 5 seconds health check timeout (if enabled)
  };

  constructor(config: RemoteServerConfig) {
    super();
    this.config = config;

    // Override defaults with health check config if provided
    if (config.healthCheck) {
      this.defaults.healthCheckIntervalMs = config.healthCheck.intervalMs || 0;
      this.defaults.healthCheckTimeoutMs = config.healthCheck.timeoutMs || 5000;
    }

    // Validate URL on construction
    this.validateUrl(this.config.url);
  }

  /**
   * Validate URL for security
   */
  private validateUrl(url: string): void {
    try {
      const parsed = new URL(url);

      // Enforce HTTPS in production
      if (
        process.env.NODE_ENV === 'production' &&
        parsed.protocol !== 'https:'
      ) {
        throw new Error('HTTPS is required in production environment');
      }

      // Only allow HTTP/HTTPS protocols
      if (!['http:', 'https:'].includes(parsed.protocol)) {
        throw new Error(`Unsupported protocol: ${parsed.protocol}`);
      }
    } catch (error) {
      if (error instanceof TypeError) {
        throw new Error(`Invalid URL format: ${url}`);
      }
      throw error;
    }
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
   * Get server configuration
   */
  getConfig(): RemoteServerConfig {
    return this.config;
  }

  /**
   * Get connection info
   */
  getConnection(): RemoteConnection | null {
    return this.connection;
  }

  /**
   * Start the remote server connection
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
    this.lastConnectTime = new Date();
    this.emit('starting', { serverId: this.config.id });

    try {
      await this.connect();
      this.state = ServerState.RUNNING;
      this.emit('started', { serverId: this.config.id });

      // Start health check if configured
      if (this.defaults.healthCheckIntervalMs > 0) {
        this.startHealthCheck();
      }
    } catch (error) {
      this.state = ServerState.CRASHED;
      this.emit('error', {
        serverId: this.config.id,
        error: error instanceof Error ? error.message : String(error),
      });

      // Attempt auto-reconnect if configured
      if (this.shouldAutoReconnect()) {
        await this.scheduleReconnect();
      }

      throw error;
    }
  }

  /**
   * Connect to remote server using Streamable HTTP transport
   */
  private async connect(): Promise<void> {
    const _runtime = await this.runtime;

    console.log(
      `Connecting to remote server ${this.config.id} at ${this.config.url}`,
    );

    // Prepare headers
    const headers: Record<string, string> = {};
    if (this.config.auth?.type === 'bearer' && this.config.auth.token) {
      headers.Authorization = `Bearer ${this.config.auth.token}`;
    } else if (this.config.auth?.type === 'basic' && this.config.auth.token) {
      headers.Authorization = `Basic ${this.config.auth.token}`;
    }

    const baseUrl = new URL(this.config.url);

    try {
      console.log(
        `Connecting to ${this.config.id} using streamable-http transport`,
      );
      const connection = await this.connectWithTransport(baseUrl, headers);
      console.log(`Successfully connected to ${this.config.id}`);

      // Set up error handlers
      connection.client.onerror = (error) => {
        this.handleConnectionError(error).catch(console.error);
      };

      this.connection = connection;
    } catch (error) {
      const safeError = await sanitizeLog(String(error));
      console.log(`Failed to connect to ${this.config.id}: ${safeError}`);
      throw new Error(`Failed to connect to remote server: ${error}`);
    }
  }

  /**
   * Connect using Streamable HTTP transport
   */
  private async connectWithTransport(
    baseUrl: URL,
    headers: Record<string, string>,
  ): Promise<RemoteConnection> {
    const _runtime = await this.runtime;
    const client = new Client({
      name: 'hatago-hub',
      version: '0.0.1',
    });

    const transport = new StreamableHTTPClientTransport(baseUrl, { headers });

    // Connect with timeout
    await this.withTimeout(
      client.connect(transport),
      this.defaults.connectTimeoutMs,
      'streamable-http connection',
    );

    return {
      client,
      transport,
    };
  }

  /**
   * Execute promise with timeout and cleanup
   */
  private async withTimeout<T>(
    promise: Promise<T>,
    timeoutMs: number,
    operation: string,
  ): Promise<T> {
    const runtime = await this.runtime;
    let timeoutId: NodeJS.Timeout | number | null = null;

    const timeoutPromise = new Promise<never>((_, reject) => {
      timeoutId = runtime.setTimeout(() => {
        reject(new Error(`${operation} timeout after ${timeoutMs}ms`));
      }, timeoutMs);
    });

    try {
      return await Promise.race([promise, timeoutPromise]);
    } finally {
      if (timeoutId !== null) {
        runtime.clearTimeout(timeoutId);
      }
    }
  }

  /**
   * Handle connection error
   */
  private async handleConnectionError(error: Error): Promise<void> {
    // Check recursion depth limits
    if (this.reconnectDepth >= this.MAX_RECONNECT_DEPTH) {
      console.error(
        `Max reconnect depth (${this.MAX_RECONNECT_DEPTH}) reached for ${this.config.id}`,
      );
      this.state = ServerState.CRASHED;
      return;
    }

    if (this.reconnectSteps >= this.MAX_RECONNECT_STEPS) {
      console.error(
        `Max reconnect steps (${this.MAX_RECONNECT_STEPS}) reached for ${this.config.id}`,
      );
      this.state = ServerState.CRASHED;
      return;
    }

    // Increment counters
    this.reconnectDepth++;
    this.reconnectSteps++;

    const safeError = await sanitizeLog(error.message);
    console.error(
      `Remote server ${this.config.id} connection error:`,
      safeError,
    );
    this.state = ServerState.CRASHED;
    this.emit('error', {
      serverId: this.config.id,
      error: error.message,
    });

    if (this.shouldAutoReconnect()) {
      // Use setImmediate to avoid synchronous recursion and reset depth
      setImmediate(() => {
        this.reconnectDepth = 0; // Reset depth for async continuation
        this.scheduleReconnect().catch((err) => {
          sanitizeLog(String(err)).then((safeErr) =>
            console.error(
              `Failed to schedule reconnect for ${this.config.id}:`,
              safeErr,
            ),
          );
        });
      });
    }
  }

  /**
   * Clean up event listeners to prevent memory leaks
   */
  private cleanup(): void {
    // Remove all listeners to prevent memory leaks
    this.removeAllListeners();

    // Clear connection error handler
    if (this.connection?.client) {
      this.connection.client.onerror = null;
    }
  }

  /**
   * Start health check interval
   */
  private async startHealthCheck(): Promise<void> {
    // Skip if health check is disabled (interval <= 0)
    if (this.defaults.healthCheckIntervalMs <= 0) {
      console.log(`Health check disabled for ${this.config.id}`);
      return;
    }

    const runtime = await this.runtime;

    const healthCheckInterval = runtime.setInterval(async () => {
      if (this.state === ServerState.RUNNING && this.connection) {
        try {
          // Create a timeout promise
          const timeoutPromise = new Promise<never>((_, reject) => {
            runtime.setTimeout(() => {
              reject(new Error('Health check timeout'));
            }, this.defaults.healthCheckTimeoutMs);
          });

          // Race between health check and timeout
          await Promise.race([
            this.connection.client.request({
              method: 'tools/list',
              params: {},
            }),
            timeoutPromise,
          ]);
        } catch (error) {
          const errorMessage =
            error instanceof Error && error.message === 'Health check timeout'
              ? `Health check timeout (${this.defaults.healthCheckTimeoutMs}ms)`
              : String(error);
          const safeError = await sanitizeLog(errorMessage);
          console.warn(`Health check failed for ${this.config.id}:`, safeError);

          // Only handle connection error if not a timeout
          if (
            !(
              error instanceof Error && error.message === 'Health check timeout'
            )
          ) {
            await this.handleConnectionError(error as Error);
          }
        }
      }
    }, this.defaults.healthCheckIntervalMs);

    // Store interval for cleanup
    this.healthCheckInterval = healthCheckInterval;
  }

  /**
   * Check if server should auto-reconnect
   */
  private shouldAutoReconnect(): boolean {
    if (this.shutdownRequested) {
      return false;
    }

    // Check reconnect count
    const maxReconnects = this.defaults.maxReconnects;
    if (this.reconnectCount >= maxReconnects) {
      return false;
    }

    // Check time limit
    if (this.firstReconnectAttempt) {
      const elapsedMs = Date.now() - this.firstReconnectAttempt.getTime();
      if (elapsedMs > this.defaults.maxReconnectDurationMs) {
        console.warn(
          `Server ${this.config.id} exceeded max reconnect duration (${this.defaults.maxReconnectDurationMs}ms)`,
        );
        return false;
      }
    }

    return true;
  }

  /**
   * Schedule a reconnection
   */
  private async scheduleReconnect(): Promise<void> {
    const runtime = await this.runtime;

    // Set first reconnect attempt time
    if (!this.firstReconnectAttempt) {
      this.firstReconnectAttempt = new Date();
    }

    const delay = Math.min(
      this.defaults.reconnectDelayMs * 2 ** this.reconnectCount,
      30000, // Max 30 seconds
    );

    this.reconnectCount++;
    console.log(
      `Scheduling reconnect ${this.reconnectCount} for server ${this.config.id} in ${delay}ms`,
    );

    runtime.setTimeout(async () => {
      if (!this.shutdownRequested && this.shouldAutoReconnect()) {
        try {
          await this.start();
          // Reset counters on successful connection
          this.reconnectCount = 0;
          this.firstReconnectAttempt = null;
        } catch (error) {
          const safeError = await sanitizeLog(String(error));
          console.error(
            `Failed to reconnect server ${this.config.id}:`,
            safeError,
          );
        }
      }
    }, delay);
  }

  /**
   * Stop the server connection
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

    // Clear health check interval
    const runtime = await this.runtime;
    if (this.healthCheckInterval !== null) {
      runtime.clearInterval(this.healthCheckInterval);
      this.healthCheckInterval = null;
    }

    if (this.connection) {
      try {
        await this.connection.transport.close();
      } catch (error) {
        const safeError = await sanitizeLog(String(error));
        console.warn(
          `Error closing transport for ${this.config.id}:`,
          safeError,
        );
      }
      this.connection = null;
    }

    // Clean up event listeners
    this.cleanup();

    this.state = ServerState.STOPPED;
    this.emit('stopped', { serverId: this.config.id });
  }

  /**
   * Restart the server connection
   */
  async restart(): Promise<void> {
    await this.stop();
    this.reconnectCount = 0; // Reset reconnect count for manual restart
    await this.start();
  }

  /**
   * Get server statistics
   */
  getStats(): {
    id: string;
    state: ServerState;
    reconnectCount: number;
    uptime?: number;
    url: string;
  } {
    return {
      id: this.config.id,
      state: this.state,
      reconnectCount: this.reconnectCount,
      uptime: this.lastConnectTime
        ? Date.now() - this.lastConnectTime.getTime()
        : undefined,
      url: this.config.url,
    };
  }

  /**
   * Call a tool on the remote server
   */
  async callTool(
    name: string,
    args: Record<string, unknown>,
  ): Promise<unknown> {
    if (!this.connection || this.state !== ServerState.RUNNING) {
      throw new Error(`Server ${this.config.id} is not connected`);
    }

    try {
      return await this.connection.client.callTool({ name, arguments: args });
    } catch (error) {
      // Handle connection errors during tool calls
      if (
        error instanceof Error &&
        (error.message.includes('disconnected') ||
          error.message.includes('closed') ||
          error.message.includes('ENOTFOUND'))
      ) {
        await this.handleConnectionError(error);
      }
      throw error;
    }
  }

  /**
   * List available tools
   */
  async listTools(): Promise<unknown> {
    if (!this.connection || this.state !== ServerState.RUNNING) {
      throw new Error(`Server ${this.config.id} is not connected`);
    }

    try {
      return await this.connection.client.listTools();
    } catch (error) {
      // Handle connection errors during tool listing
      if (
        error instanceof Error &&
        (error.message.includes('disconnected') ||
          error.message.includes('closed') ||
          error.message.includes('ENOTFOUND'))
      ) {
        await this.handleConnectionError(error);
      }
      throw error;
    }
  }
}
