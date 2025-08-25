/**
 * Remote MCP Server implementation for HTTP/SSE connections
 */

import { EventEmitter } from 'node:events';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { SSEClientTransport } from '@modelcontextprotocol/sdk/client/sse.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import type {
  CallToolResult,
  ReadResourceResult,
} from '@modelcontextprotocol/sdk/types.js';
import type { RemoteServerConfig } from '../config/types.js';
import { MCPClientFacade } from '../core/mcp-client-facade.js';
import type { NegotiatedProtocol } from '../core/protocol-negotiator.js';
import { getRuntime } from '../runtime/runtime-factory.js';
import { ErrorCode, ErrorHelpers, HatagoError } from '../utils/errors.js';
import { sanitizeLog } from '../utils/security.js';

/**
 * Known server quirks for specific MCP servers
 * These are applied automatically based on the server URL
 */
const KNOWN_SERVER_QUIRKS: Record<string, RemoteServerConfig['quirks']> = {
  'mcp.deepwiki.com': {
    useDirectClient: true,
    forceProtocolVersion: '2025-03-26',
    assumedCapabilities: {
      tools: true,
      resources: false,
      prompts: false,
    },
  },
  // Add more server quirks as discovered
};

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
  facade: MCPClientFacade;
  transport: StreamableHTTPClientTransport | SSEClientTransport;
  transportType?: 'streamable-http' | 'sse';
  protocol?: NegotiatedProtocol;
  capabilities?: {
    tools?: boolean;
    resources?: boolean;
    prompts?: boolean;
  };
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
    connectTimeoutMs: 60000, // Increased to 60 seconds for remote connections
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
        throw new HatagoError(
          ErrorCode.E_SECURITY_POLICY_DENIED,
          'HTTPS is required in production environment',
          { severity: 'critical', context: { url }, recoverable: false },
        );
      }

      // Only allow HTTP/HTTPS protocols
      if (!['http:', 'https:'].includes(parsed.protocol)) {
        throw ErrorHelpers.mcpProtocolError(
          'remote',
          `Unsupported protocol: ${parsed.protocol}`,
        );
      }
    } catch (error) {
      if (error instanceof TypeError) {
        throw ErrorHelpers.configInvalid('remote-server-url', [
          `Invalid URL format: ${url}`,
        ]);
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
      if (
        this.shouldAutoReconnect(error instanceof Error ? error : undefined)
      ) {
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
      // Transport type will be determined in connectWithTransport
      const connection = await this.connectWithTransport(baseUrl, headers);
      console.log(`🏮 Successfully connected to ${this.config.id}`);

      // Set up error handlers
      connection.client.onerror = (error) => {
        this.handleConnectionError(error).catch(console.error);
      };

      this.connection = connection;
    } catch (error) {
      const safeError = await sanitizeLog(String(error));
      console.log(`Failed to connect to ${this.config.id}: ${safeError}`);
      throw ErrorHelpers.mcpConnectionFailed(this.config.id, String(error));
    }
  }

  /**
   * Connect using Streamable HTTP transport with SSE fallback
   */
  private async connectWithTransport(
    baseUrl: URL,
    headers: Record<string, string>,
  ): Promise<RemoteConnection> {
    const _runtime = await this.runtime;

    // Apply known server quirks automatically
    const hostname = baseUrl.hostname;
    const knownQuirks = KNOWN_SERVER_QUIRKS[hostname];
    const quirks = {
      ...knownQuirks,
      ...this.config.quirks, // User config overrides known quirks
    };

    // Create client facade for protocol negotiation (unless quirks say otherwise)
    const facade = new MCPClientFacade({
      name: 'hatago-hub',
      version: '0.0.2',
      initializerOptions: {
        isFirstRun: false,
        timeouts: {
          normalMs: this.defaults.connectTimeoutMs,
        },
        debug: process.env.DEBUG === 'true',
      },
      debug: process.env.DEBUG === 'true',
    });

    // Choose transport based on configuration
    const transportType = this.config.transport || 'http';

    if (transportType === 'sse') {
      // Use SSE transport with direct Client (MCPClientFacade has issues with SSE)
      console.log(`Using SSE transport for ${this.config.id}`);
      const sseTransport = new SSEClientTransport(new URL(baseUrl), {
        headers: {
          ...headers,
          Accept: 'application/json, text/event-stream',
        },
      });

      // Create a direct client instead of using facade for SSE
      const client = new Client(
        {
          name: 'hatago-hub',
          version: '0.0.2',
        },
        {
          capabilities: {},
        },
      );

      await this.withTimeout(
        client.connect(sseTransport),
        this.defaults.connectTimeoutMs,
        'sse connection',
      );

      console.log(`🏮 Connected to ${this.config.id} using SSE transport`);

      return {
        client,
        facade: null as any, // SSE doesn't use facade
        transport: sseTransport,
        transportType: 'sse',
        protocol: {
          protocol: '0.1.0',
          capabilities: {},
          serverInfo: undefined,
        },
        capabilities: {
          tools: true, // Assume SSE servers support tools
          resources: true, // Assume SSE servers support resources
          prompts: true, // Assume SSE servers support prompts
        },
      };
    } else {
      // Try Streamable HTTP first, then fall back to SSE
      try {
        console.log(`Trying Streamable HTTP transport for ${this.config.id}`);

        // Check if we should use direct Client based on quirks
        if (quirks?.useDirectClient) {
          // Use direct Client to avoid sessionId issues
          const transport = new StreamableHTTPClientTransport(baseUrl, {
            headers: {
              ...headers,
              Accept: 'application/json',
            },
          });

          const client = new Client(
            {
              name: 'hatago-hub',
              version: '0.0.2',
            },
            {
              capabilities: {},
            },
          );

          await this.withTimeout(
            client.connect(transport),
            this.defaults.connectTimeoutMs,
            'direct-client-http connection',
          );

          console.log(
            `🏮 Connected to ${this.config.id} using direct Client (quirks mode)`,
          );

          // Use quirks-specified protocol version or default
          const protocolVersion = quirks?.forceProtocolVersion || '0.1.0';

          return {
            client,
            facade: null as any, // Direct client doesn't use facade
            transport,
            transportType: 'streamable-http',
            protocol: {
              protocol: protocolVersion,
              capabilities: {},
              serverInfo: undefined,
            },
            capabilities: quirks?.assumedCapabilities || {
              tools: true,
              resources: true,
              prompts: true,
            },
          };
        } else {
          // Normal flow for other servers
          const transport = new StreamableHTTPClientTransport(baseUrl, {
            headers: {
              ...headers,
              Accept: 'application/json',
            },
          });

          const protocol = await this.withTimeout(
            facade.connect(transport),
            this.defaults.connectTimeoutMs,
            'streamable-http connection',
          );

          console.log(
            `🏮 Connected to ${this.config.id} with protocol: ${protocol.protocol}`,
          );

          return {
            client: facade.getClient(),
            facade,
            transport,
            transportType: 'streamable-http',
            protocol,
            capabilities: {
              tools: !!protocol?.capabilities?.tools,
              resources: !!protocol?.capabilities?.resources,
              prompts: !!protocol?.capabilities?.prompts,
            },
          };
        }
      } catch (error) {
        // Check if it's a sessionId error and retry with direct client
        const errorMessage = String(error);
        if (
          !quirks?.useDirectClient &&
          (errorMessage.includes('-32600') ||
            errorMessage.includes('sessionId') ||
            errorMessage.includes('Invalid Request'))
        ) {
          console.log(
            `Session ID error detected for ${this.config.id}, retrying with direct client`,
          );

          // Retry with direct client
          const directTransport = new StreamableHTTPClientTransport(baseUrl, {
            headers: {
              ...headers,
              Accept: 'application/json',
            },
          });

          const directClient = new Client(
            {
              name: 'hatago-hub',
              version: '0.0.2',
            },
            {
              capabilities: {},
            },
          );

          try {
            await this.withTimeout(
              directClient.connect(directTransport),
              this.defaults.connectTimeoutMs,
              'fallback-direct-client connection',
            );

            console.log(
              `🏮 Connected to ${this.config.id} using direct Client (auto-fallback)`,
            );

            return {
              client: directClient,
              facade: null as any,
              transport: directTransport,
              transportType: 'streamable-http',
              protocol: {
                protocol: '0.1.0',
                capabilities: {},
                serverInfo: undefined,
              },
              capabilities: {
                tools: true,
                resources: true,
                prompts: true,
              },
            };
          } catch (fallbackError) {
            console.log(
              `Direct client fallback also failed for ${this.config.id}: ${fallbackError}`,
            );
            // Continue to SSE fallback
          }
        }

        // Fall back to SSE
        console.log(
          `Streamable HTTP failed for ${this.config.id}, trying SSE transport: ${error}`,
        );

        const sseFacade = new MCPClientFacade({
          name: 'hatago-hub',
          version: '0.0.2',
          initializerOptions: {
            isFirstRun: false,
            timeouts: {
              normalMs: this.defaults.connectTimeoutMs,
            },
            debug: process.env.DEBUG === 'true',
          },
          debug: process.env.DEBUG === 'true',
        });

        const sseTransport = new SSEClientTransport(new URL(baseUrl), {
          headers: {
            ...headers,
            Accept: 'application/json, text/event-stream',
          },
        });

        const protocol = await this.withTimeout(
          sseFacade.connect(sseTransport),
          this.defaults.connectTimeoutMs,
          'sse connection',
        );

        console.log(
          `🏮 Successfully connected to ${this.config.id} using SSE transport with protocol: ${protocol.protocol}`,
        );

        return {
          client: sseFacade.getClient(),
          facade: sseFacade,
          transport: sseTransport,
          transportType: 'sse',
          protocol,
          capabilities: {
            tools: !!protocol?.capabilities?.tools,
            resources: !!protocol?.capabilities?.resources,
            prompts: !!protocol?.capabilities?.prompts,
          },
        };
      }
    }
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
    // Skip if shutdown was requested or if it's an abort error
    if (this.shutdownRequested || error.message.includes('AbortError')) {
      return;
    }

    // Skip progress token errors - these are not connection errors
    if (error.message.includes('progress notification for an unknown token')) {
      console.debug(
        `Ignoring progress token error for ${this.config.id} - not a connection issue`,
      );
      return;
    }

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

    if (this.shouldAutoReconnect(error)) {
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

          // Use ping for health check (MCP protocol standard)
          // If ping is not supported, it will throw Method not found which we'll handle gracefully
          await Promise.race([
            this.connection.client
              .request({
                method: 'ping',
                params: {},
              })
              .catch((error: any) => {
                // If ping is not supported, consider it healthy (non-fatal)
                if (
                  error?.code === -32601 ||
                  error?.message?.includes('Method not found')
                ) {
                  console.debug(
                    `Server ${this.config.id} doesn't support ping, considering healthy`,
                  );
                  return; // Return normally, don't throw
                }
                throw error; // Re-throw other errors
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
  private shouldAutoReconnect(error?: Error): boolean {
    if (this.shutdownRequested) {
      return false;
    }

    // Don't retry on 4xx errors (authentication/authorization failures)
    if (error?.message.includes('401')) {
      console.error(
        `Authentication failed for ${this.config.id}, not retrying`,
      );
      return false;
    }
    if (error?.message.includes('403')) {
      console.error(`Authorization failed for ${this.config.id}, not retrying`);
      return false;
    }
    if (error?.message.includes('404')) {
      console.error(`Endpoint not found for ${this.config.id}, not retrying`);
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
        // Handle different transport types
        if (this.connection.transportType === 'sse') {
          // SSEClientTransport might not have a close method
          // Just clean up the connection
          this.connection = null;
        } else {
          // StreamableHTTPClientTransport has close method
          await (
            this.connection.transport as StreamableHTTPClientTransport
          ).close();
        }
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
  ): Promise<CallToolResult> {
    if (!this.connection || this.state !== ServerState.RUNNING) {
      throw ErrorHelpers.serverNotConnected(this.config.id);
    }

    try {
      const result = await this.connection.client.callTool({
        name,
        arguments: args,
      });

      // レスポンスが正しい形式かチェック
      if (!result || typeof result !== 'object') {
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(result),
            },
          ],
          isError: false,
        };
      }

      // CallToolResult形式で返す
      if ('content' in result) {
        return result as CallToolResult;
      }

      // 互換性のため、結果をテキストコンテンツとして返す
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(result),
          },
        ],
        isError: false,
      };
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
      throw ErrorHelpers.serverNotConnected(this.config.id);
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

  /**
   * List available resources
   */
  async listResources(): Promise<unknown> {
    if (!this.connection || this.state !== ServerState.RUNNING) {
      throw ErrorHelpers.serverNotConnected(this.config.id);
    }

    try {
      return await this.connection.client.listResources();
    } catch (error) {
      // Handle connection errors during resource listing
      if (
        error instanceof Error &&
        (error.message.includes('disconnected') ||
          error.message.includes('Connection closed'))
      ) {
        console.error(
          `Connection lost while listing resources for ${this.config.id}:`,
          error.message,
        );
        await this.handleDisconnection();
      }
      throw error;
    }
  }

  /**
   * Read a specific resource
   */
  async readResource(uri: string): Promise<ReadResourceResult> {
    if (!this.connection || this.state !== ServerState.RUNNING) {
      throw ErrorHelpers.serverNotConnected(this.config.id);
    }

    try {
      return await this.connection.client.readResource({ uri });
    } catch (error) {
      // Handle connection errors during resource reading
      if (
        error instanceof Error &&
        (error.message.includes('disconnected') ||
          error.message.includes('Connection closed'))
      ) {
        console.error(
          `Connection lost while reading resource for ${this.config.id}:`,
          error.message,
        );
        await this.handleDisconnection();
      }
      throw error;
    }
  }

  /**
   * Discover available resources from the remote server
   */
  async discoverResources(): Promise<unknown[]> {
    // Check if server supports resources based on capabilities
    if (!this.connection?.capabilities?.resources) {
      console.debug(
        `Server ${this.config.id} doesn't support resources (capability not declared)`,
      );
      return [];
    }

    try {
      const resourcesResponse = await this.listResources();

      // MCPのlistResourcesレスポンスからリソースを抽出
      if (
        resourcesResponse &&
        typeof resourcesResponse === 'object' &&
        'resources' in resourcesResponse
      ) {
        const resources = (resourcesResponse as { resources: unknown[] })
          .resources;
        if (Array.isArray(resources)) {
          return resources;
        }
      }
    } catch (error: any) {
      // Handle Method not found gracefully (non-fatal)
      if (
        error?.code === -32601 ||
        error?.message?.includes('Method not found')
      ) {
        console.warn(
          `Server ${this.config.id} doesn't support resources/list method`,
        );
        return [];
      }
      // Re-throw other errors
      throw error;
    }

    return [];
  }

  /**
   * Discover available tools from the remote server
   */
  async discoverTools(): Promise<any[]> {
    const toolsResponse = await this.listTools();

    // MCPのlistToolsレスポンスから完全なツール情報を返す
    if (
      toolsResponse &&
      typeof toolsResponse === 'object' &&
      'tools' in toolsResponse
    ) {
      const response = toolsResponse as { tools: unknown };
      if (Array.isArray(response.tools)) {
        return response.tools.filter(
          (tool) => tool && typeof tool === 'object' && 'name' in tool,
        );
      }
    }

    return [];
  }
}
