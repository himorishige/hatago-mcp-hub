/**
 * Remote MCP Server implementation for HTTP/SSE connections
 */

import { EventEmitter } from "node:events";

// RequestOptions is not directly exported, define our own
type RequestOptions = {
  timeout?: number;
  maxTotalTimeout?: number;
  resetTimeoutOnProgress?: boolean;
};

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { SSEClientTransport } from "@modelcontextprotocol/sdk/client/sse.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import type {
  CallToolResult,
  ReadResourceResult,
  Resource,
  ResourceTemplate,
  Tool,
} from "@modelcontextprotocol/sdk/types.js";
import type { RemoteServerConfig } from "../config/types.js";
import { APP_NAME, APP_VERSION } from "../constants.js";

import type { NegotiatedProtocol } from "../core/types.js";
import { logger } from "../observability/minimal-logger.js";

import {
  ErrorCode,
  ErrorHelpers,
  ErrorSeverity,
  HatagoError,
} from "../utils/errors.js";

// import { sanitizeLog } from '../utils/security.js';

/**
 * Default timeout values for remote servers
 */
const DEFAULT_REMOTE_TIMEOUT = 30000; // 30 seconds
const DEFAULT_MAX_TIMEOUT = 300000; // 5 minutes
const DEFAULT_RESET_ON_PROGRESS = true;

/**
 * Error patterns for automatic issue detection
 */
const ERROR_PATTERNS = {
  SESSION_REJECTED:
    /unknown field.*sessionId|unsupported parameter.*sessionId/i,
  VERSION_MISMATCH: /unknown version|upgrade required|426/i,
  METHOD_NOT_FOUND: /method not found|501|405/i,
  TRANSPORT_ERROR: /connection refused|ECONNREFUSED|timeout/i,
};

/**
 * Connection cache for successful connections (TTL: 24 hours)
 */
interface CachedConnection {
  origin: string;
  transport: "sse" | "http" | "streamable-http";
  supportsSessionId: boolean;
  protocolVersion?: string;
  lastSuccess: Date;
}

const connectionCache = new Map<string, CachedConnection>();
const CACHE_TTL = 24 * 60 * 60 * 1000; // 24 hours

function getCacheKey(url: URL): string {
  return `${url.protocol}//${url.host}`;
}

function getCachedConnection(url: URL): CachedConnection | null {
  const key = getCacheKey(url);
  const cached = connectionCache.get(key);

  if (!cached) return null;

  // Check TTL
  if (Date.now() - cached.lastSuccess.getTime() > CACHE_TTL) {
    connectionCache.delete(key);
    return null;
  }

  return cached;
}

function setCachedConnection(
  url: URL,
  transport: "sse" | "http" | "streamable-http",
  supportsSessionId: boolean,
  protocolVersion?: string
): void {
  const key = getCacheKey(url);
  connectionCache.set(key, {
    origin: key,
    transport,
    supportsSessionId,
    protocolVersion,
    lastSuccess: new Date(),
  });
}

/**
 * Detect issue from error message or code
 */
function detectIssue(error: any): string | null {
  const message = error?.message || error?.toString() || "";
  const code = error?.code;

  if (ERROR_PATTERNS.SESSION_REJECTED.test(message)) {
    return "no-session";
  }
  if (ERROR_PATTERNS.VERSION_MISMATCH.test(message) || code === 426) {
    return "legacy-protocol";
  }
  if (ERROR_PATTERNS.METHOD_NOT_FOUND.test(message)) {
    return "method-not-found";
  }
  if (ERROR_PATTERNS.TRANSPORT_ERROR.test(message)) {
    return "transport-error";
  }

  return null;
}

/**
 * Server state enum (reuse from npx-mcp-server)
 */
export enum ServerState {
  STOPPED = "stopped",
  STARTING = "starting",
  RUNNING = "running",
  STOPPING = "stopping",
  CRASHED = "crashed",
}

/**
 * Connection information
 */
export interface RemoteConnection {
  client: Client;
  facade?: Client;
  transport: StreamableHTTPClientTransport | SSEClientTransport;
  transportType?: "streamable-http" | "sse";
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
  private logger = logger;
  private connection: RemoteConnection | null = null;
  private state: ServerState = ServerState.STOPPED;
  private reconnectCount = 0;
  private firstReconnectAttempt: Date | null = null;
  private lastConnectTime: Date | null = null;
  private shutdownRequested = false;

  private startPromise: Promise<void> | null = null;
  private stopPromise: Promise<void> | null = null;
  private healthCheckInterval: NodeJS.Timeout | null = null;

  // Recursion depth tracking
  private reconnectDepth = 0;
  private reconnectSteps = 0;
  private readonly MAX_RECONNECT_DEPTH = Number(
    process.env.HATAGO_MAX_RECONNECT_DEPTH || 32
  );
  private readonly MAX_RECONNECT_STEPS = Number(
    process.env.HATAGO_MAX_RECONNECT_STEPS || 10000
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
        process.env.NODE_ENV === "production" &&
        parsed.protocol !== "https:"
      ) {
        throw new HatagoError(
          ErrorCode.E_SECURITY_POLICY_DENIED,
          "HTTPS is required in production environment",
          {
            severity: ErrorSeverity.CRITICAL,
            context: { url },
            recoverable: false,
          }
        );
      }

      // Only allow HTTP/HTTPS protocols
      if (!["http:", "https:"].includes(parsed.protocol)) {
        throw ErrorHelpers.mcpProtocolError(
          "remote",
          `Unsupported protocol: ${parsed.protocol}`
        );
      }
    } catch (error) {
      if (error instanceof TypeError) {
        throw ErrorHelpers.configInvalid("remote-server-url", [
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
        "running",
        this.config.id
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
    this.emit("starting", { serverId: this.config.id });

    try {
      await this.connect();
      this.state = ServerState.RUNNING;
      this.emit("started", { serverId: this.config.id });

      // Start health check if configured
      if (this.defaults.healthCheckIntervalMs > 0) {
        this.startHealthCheck();
      }
    } catch (error) {
      this.state = ServerState.CRASHED;
      this.emit("error", {
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
    logger.info(
      `Connecting to remote server ${this.config.id} at ${this.config.url}`
    );

    // Prepare headers
    const headers: Record<string, string> = {};
    if (this.config.auth?.type === "bearer" && this.config.auth.token) {
      headers.Authorization = `Bearer ${this.config.auth.token}`;
    } else if (this.config.auth?.type === "basic" && this.config.auth.token) {
      headers.Authorization = `Basic ${this.config.auth.token}`;
    }

    const baseUrl = new URL(this.config.url);

    try {
      // Transport type will be determined in connectWithTransport
      const connection = await this.connectWithTransport(baseUrl, headers);
      logger.info(`🏮 Successfully connected to ${this.config.id}`);

      // Set up error handlers
      connection.client.onerror = (error) => {
        this.handleConnectionError(error).catch(logger.error);
      };

      this.connection = connection;
    } catch (error) {
      const safeError = String(error); // await sanitizeLog(String(error));
      logger.info(`Failed to connect to ${this.config.id}: ${safeError}`);
      throw ErrorHelpers.mcpConnectionFailed(this.config.id, String(error));
    }
  }

  /**
   * Connect using Streamable HTTP transport with SSE fallback
   */
  private async connectWithTransport(
    baseUrl: URL,
    headers: Record<string, string>
  ): Promise<RemoteConnection> {
    // Check connection cache
    const cached = getCachedConnection(baseUrl);

    // First pass: Try with cached settings or defaults
    try {
      const connection = await this.attemptConnection(
        baseUrl,
        headers,
        cached?.supportsSessionId ?? true, // Default to sessionId
        (cached?.transport ||
          this.config.transport ||
          this.detectTransport(baseUrl)) as "sse" | "http" | "streamable-http"
      );

      // Cache successful connection
      setCachedConnection(
        baseUrl,
        connection.transportType === "sse"
          ? "sse"
          : connection.transportType === "streamable-http"
            ? "streamable-http"
            : "http",
        true, // sessionId worked
        connection.protocol?.protocol
      );

      return connection;
    } catch (firstError: any) {
      logger.debug(`First connection attempt failed: ${firstError.message}`);

      // Second pass: Try alternative based on error
      const issue = detectIssue(firstError);

      if (issue === "no-session") {
        logger.info("Retrying without sessionId...");
        try {
          const connection = await this.attemptConnection(
            baseUrl,
            headers,
            false, // No sessionId
            (cached?.transport ||
              this.config.transport ||
              this.detectTransport(baseUrl)) as
              | "sse"
              | "http"
              | "streamable-http"
          );

          // Cache successful connection
          setCachedConnection(
            baseUrl,
            connection.transportType === "sse"
              ? "sse"
              : connection.transportType === "streamable-http"
                ? "streamable-http"
                : "http",
            false, // sessionId not supported
            connection.protocol?.protocol
          );

          return connection;
        } catch (secondError) {
          // Log second error but throw first for better diagnostics
          logger.debug(
            `Second attempt also failed: ${(secondError as Error).message}`
          );
          throw firstError;
        }
      }

      // Try switching transport if it was a transport error
      if (issue === "transport-error" && this.config.transport !== "sse") {
        logger.info("Retrying with SSE transport...");
        try {
          const connection = await this.attemptConnection(
            baseUrl,
            headers,
            cached?.supportsSessionId ?? true,
            "sse"
          );

          // Cache successful connection
          setCachedConnection(
            baseUrl,
            "sse",
            cached?.supportsSessionId ?? true,
            connection.protocol?.protocol
          );

          return connection;
        } catch (secondError) {
          logger.debug(
            `SSE attempt also failed: ${(secondError as Error).message}`
          );
          throw firstError;
        }
      }

      // If no specific issue detected or second attempt also failed, throw original error
      throw firstError;
    }
  }

  private detectTransport(url: URL): "sse" | "http" | "streamable-http" {
    // Check config first
    if (this.config.transport === "streamable-http") {
      return "streamable-http";
    }
    if (this.config.transport === "sse") {
      return "sse";
    }
    if (this.config.transport === "http") {
      return "http";
    }

    // Auto-detect from path
    const path = url.pathname.toLowerCase();
    if (
      path.endsWith("/sse") ||
      path.includes("/events") ||
      path.includes("/stream")
    ) {
      return "sse";
    }
    if (path.endsWith("/mcp")) {
      return "streamable-http";
    }
    return "http";
  }

  private async attemptConnection(
    baseUrl: URL,
    headers: Record<string, string>,
    useSessionId: boolean,
    transportType: "sse" | "http" | "streamable-http"
  ): Promise<RemoteConnection> {
    // Create client
    const client = new Client(
      {
        name: APP_NAME,
        version: APP_VERSION,
      },
      {
        capabilities: {},
      }
    );

    if (transportType === "sse") {
      logger.info(`Using SSE transport for ${this.config.id}`);
      const sseTransport = new SSEClientTransport(new URL(baseUrl), {
        headers: {
          ...headers,
          Accept: "application/json, text/event-stream",
        },
      } as any);

      await this.withTimeout(
        client.connect(sseTransport),
        this.defaults.connectTimeoutMs,
        "sse connection"
      );

      logger.info(`🏮 Connected to ${this.config.id} using SSE transport`);

      return {
        client,
        facade: null as any,
        transport: sseTransport,
        transportType: "sse",
        protocol: {
          protocol: "0.1.0",
          capabilities: {},
          serverInfo: undefined,
          features: {
            notifications: true,
            resources: true,
            prompts: true,
            tools: true,
          },
        },
        capabilities: {
          tools: true,
          resources: true,
          prompts: true,
        },
      };
    } else if (
      transportType === "http" ||
      transportType === "streamable-http"
    ) {
      // Try Streamable HTTP
      logger.info(`Trying Streamable HTTP transport for ${this.config.id}`);

      const transport = new StreamableHTTPClientTransport(baseUrl, {
        headers: {
          ...headers,
          Accept: "application/json",
          // Don't send sessionId if not supported
          ...(useSessionId ? {} : { "X-No-Session": "true" }),
        },
      } as any);

      await this.withTimeout(
        client.connect(transport),
        this.defaults.connectTimeoutMs,
        "http connection"
      );

      logger.info(`🏮 Connected to ${this.config.id} using HTTP transport`);

      return {
        client,
        facade: null as any,
        transport,
        transportType: "streamable-http",
        protocol: {
          protocol: "0.1.0",
          capabilities: {},
          serverInfo: undefined,
          features: {
            notifications: true,
            resources: true,
            prompts: true,
            tools: true,
          },
        },
        capabilities: {
          tools: true,
          resources: true,
          prompts: true,
        },
      };
    }
  }

  /**
   * Execute promise with timeout and cleanup
   */
  private async withTimeout<T>(
    promise: Promise<T>,
    timeoutMs: number,
    operation: string
  ): Promise<T> {
    let timeoutId: NodeJS.Timeout | null = null;

    const timeoutPromise = new Promise<never>((_, reject) => {
      timeoutId = setTimeout(() => {
        reject(new Error(`${operation} timeout after ${timeoutMs}ms`));
      }, timeoutMs);
    });

    try {
      return await Promise.race([promise, timeoutPromise]);
    } finally {
      if (timeoutId !== null) {
        clearTimeout(timeoutId);
      }
    }
  }

  /**
   * Handle connection error
   */
  private async handleConnectionError(error: Error): Promise<void> {
    // Skip if shutdown was requested or if it's an abort error
    if (this.shutdownRequested || error.message.includes("AbortError")) {
      return;
    }

    // Skip progress token errors - these are not connection errors
    if (error.message.includes("progress notification for an unknown token")) {
      console.debug(
        `Ignoring progress token error for ${this.config.id} - not a connection issue`
      );
      return;
    }

    // Check recursion depth limits
    if (this.reconnectDepth >= this.MAX_RECONNECT_DEPTH) {
      logger.error(
        `Max reconnect depth (${this.MAX_RECONNECT_DEPTH}) reached for ${this.config.id}`
      );
      this.state = ServerState.CRASHED;
      return;
    }

    if (this.reconnectSteps >= this.MAX_RECONNECT_STEPS) {
      logger.error(
        `Max reconnect steps (${this.MAX_RECONNECT_STEPS}) reached for ${this.config.id}`
      );
      this.state = ServerState.CRASHED;
      return;
    }

    // Increment counters
    this.reconnectDepth++;
    this.reconnectSteps++;

    const safeError = String(error); // await sanitizeLog(error.message);
    logger.error(
      `Remote server ${this.config.id} connection error:`,
      safeError
    );
    this.state = ServerState.CRASHED;
    this.emit("error", {
      serverId: this.config.id,
      error: error.message,
    });

    if (this.shouldAutoReconnect(error)) {
      // Use setImmediate to avoid synchronous recursion and reset depth
      setImmediate(() => {
        this.reconnectDepth = 0; // Reset depth for async continuation
        this.scheduleReconnect().catch((err) => {
          Promise.resolve(String(err)).then((safeErr) =>
            logger.error(
              `Failed to schedule reconnect for ${this.config.id}:`,
              safeErr
            )
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
      this.connection.client.onerror = undefined;
    }
  }

  /**
   * Start health check interval
   */
  private async startHealthCheck(): Promise<void> {
    // Skip if health check is disabled (interval <= 0)
    if (this.defaults.healthCheckIntervalMs <= 0) {
      logger.info(`Health check disabled for ${this.config.id}`);
      return;
    }

    const healthCheckInterval = setInterval(async () => {
      if (this.state === ServerState.RUNNING && this.connection) {
        try {
          // Create a timeout promise
          const timeoutPromise = new Promise<never>((_, reject) => {
            setTimeout(() => {
              reject(new Error("Health check timeout"));
            }, this.defaults.healthCheckTimeoutMs);
          });

          // Use ping for health check (MCP protocol standard)
          // If ping is not supported, it will throw Method not found which we'll handle gracefully
          await Promise.race([
            this.connection.client
              .request(
                {
                  method: "ping",
                  params: {},
                },
                {} as any
              )
              .catch((error: any) => {
                // If ping is not supported, consider it healthy (non-fatal)
                if (
                  error?.code === -32601 ||
                  error?.message?.includes("Method not found")
                ) {
                  console.debug(
                    `Server ${this.config.id} doesn't support ping, considering healthy`
                  );
                  return; // Return normally, don't throw
                }
                throw error; // Re-throw other errors
              }),
            timeoutPromise,
          ]);
        } catch (error) {
          const _errorMessage =
            error instanceof Error && error.message === "Health check timeout"
              ? `Health check timeout (${this.defaults.healthCheckTimeoutMs}ms)`
              : String(error);
          const safeError = String(error); // await sanitizeLog(errorMessage);
          logger.warn(`Health check failed for ${this.config.id}:`, safeError);

          // Only handle connection error if not a timeout
          if (
            !(
              error instanceof Error && error.message === "Health check timeout"
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
    if (error?.message.includes("401")) {
      logger.error(`Authentication failed for ${this.config.id}, not retrying`);
      return false;
    }
    if (error?.message.includes("403")) {
      logger.error(`Authorization failed for ${this.config.id}, not retrying`);
      return false;
    }
    if (error?.message.includes("404")) {
      logger.error(`Endpoint not found for ${this.config.id}, not retrying`);
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
        logger.warn(
          `Server ${this.config.id} exceeded max reconnect duration (${this.defaults.maxReconnectDurationMs}ms)`
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
    // Set first reconnect attempt time
    if (!this.firstReconnectAttempt) {
      this.firstReconnectAttempt = new Date();
    }

    const delay = Math.min(
      this.defaults.reconnectDelayMs * 2 ** this.reconnectCount,
      30000 // Max 30 seconds
    );

    this.reconnectCount++;
    logger.info(
      `Scheduling reconnect ${this.reconnectCount} for server ${this.config.id} in ${delay}ms`
    );

    setTimeout(async () => {
      if (!this.shutdownRequested && this.shouldAutoReconnect()) {
        try {
          await this.start();
          // Reset counters on successful connection
          this.reconnectCount = 0;
          this.firstReconnectAttempt = null;
        } catch (error) {
          const safeError = String(error); // await sanitizeLog(String(error));
          logger.error(
            `Failed to reconnect server ${this.config.id}:`,
            safeError
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
        this.once("stopped", resolve);
      });
    }

    this.shutdownRequested = true;
    this.state = ServerState.STOPPING;
    this.emit("stopping", { serverId: this.config.id });

    // Clear health check interval
    if (this.healthCheckInterval !== null) {
      clearInterval(this.healthCheckInterval);
      this.healthCheckInterval = null;
    }

    if (this.connection) {
      try {
        // Handle different transport types
        if (this.connection.transportType === "sse") {
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
        const safeError = String(error); // await sanitizeLog(String(error));
        logger.warn(
          `Error closing transport for ${this.config.id}:`,
          safeError
        );
      }
      this.connection = null;
    }

    // Clean up event listeners
    this.cleanup();

    this.state = ServerState.STOPPED;
    this.emit("stopped", { serverId: this.config.id });
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
    progressToken?: string | number
  ): Promise<CallToolResult> {
    if (!this.connection || this.state !== ServerState.RUNNING) {
      throw ErrorHelpers.serverNotConnected(this.config.id);
    }

    try {
      // Configure RequestOptions correctly (prioritize user settings)
      const requestOptions: RequestOptions = {
        // Timeout settings (user settings > default values)
        timeout: this.config.timeouts?.timeout ?? DEFAULT_REMOTE_TIMEOUT,
        // Reset timeout on progress notification (user settings > default values)
        resetTimeoutOnProgress:
          this.config.timeouts?.resetTimeoutOnProgress ??
          DEFAULT_RESET_ON_PROGRESS,
        // Maximum total time (user settings > default values)
        maxTotalTimeout:
          this.config.timeouts?.maxTotalTimeout ?? DEFAULT_MAX_TIMEOUT,
      };

      // Set _meta if progressToken exists (for compatibility)
      if (progressToken) {
        (requestOptions as any).meta = { progressToken };
      }

      const result = await this.connection.client.callTool(
        {
          name,
          arguments: args,
        },
        undefined, // Use default resultSchema
        requestOptions
      );

      // Check if response is in correct format
      if (!result || typeof result !== "object") {
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(result),
            },
          ],
          isError: false,
        };
      }

      // Return in CallToolResult format
      if ("content" in result) {
        return result as CallToolResult;
      }

      // For compatibility, return result as text content
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(result),
          },
        ],
        isError: false,
      };
    } catch (error) {
      // Handle connection errors during tool calls
      if (
        error instanceof Error &&
        (error.message.includes("disconnected") ||
          error.message.includes("closed") ||
          error.message.includes("ENOTFOUND"))
      ) {
        await this.handleConnectionError(error);
      }
      throw error;
    }
  }

  /**
   * List available tools
   */
  async listTools(): Promise<Tool[]> {
    if (!this.connection || this.state !== ServerState.RUNNING) {
      throw ErrorHelpers.serverNotConnected(this.config.id);
    }

    try {
      this.logger.info(`Calling listTools for ${this.config.id}...`);
      const result = await this.connection.client.listTools();
      this.logger.info(`listTools response for ${this.config.id}:`, result);
      return result?.tools || [];
    } catch (error) {
      // Handle connection errors during tool listing
      if (
        error instanceof Error &&
        (error.message.includes("disconnected") ||
          error.message.includes("closed") ||
          error.message.includes("ENOTFOUND"))
      ) {
        await this.handleConnectionError(error);
      }
      throw error;
    }
  }

  /**
   * List available prompts
   */
  async listPrompts(): Promise<any[]> {
    if (!this.connection || this.state !== ServerState.RUNNING) {
      throw ErrorHelpers.serverNotConnected(this.config.id);
    }

    try {
      const result = await this.connection.client.listPrompts();
      return result?.prompts || [];
    } catch (error) {
      // Handle connection errors during prompt listing
      if (
        error instanceof Error &&
        (error.message.includes("disconnected") ||
          error.message.includes("closed") ||
          error.message.includes("ENOTFOUND"))
      ) {
        await this.handleConnectionError(error);
      }
      throw error;
    }
  }

  /**
   * List available resources
   */
  async listResources(): Promise<Resource[]> {
    if (!this.connection || this.state !== ServerState.RUNNING) {
      throw ErrorHelpers.serverNotConnected(this.config.id);
    }

    try {
      const result = await this.connection.client.listResources();
      return result?.resources || [];
    } catch (error) {
      // Handle connection errors during resource listing
      if (
        error instanceof Error &&
        (error.message.includes("disconnected") ||
          error.message.includes("Connection closed"))
      ) {
        logger.error(
          `Connection lost while listing resources for ${this.config.id}:`,
          error.message
        );
        await this.handleConnectionError(error as Error);
      }
      throw error;
    }
  }

  /**
   * List available resource templates
   */
  async listResourceTemplates(): Promise<ResourceTemplate[]> {
    if (!this.connection || this.state !== ServerState.RUNNING) {
      throw ErrorHelpers.serverNotConnected(this.config.id);
    }

    try {
      const result = await this.connection.client.listResourceTemplates();
      return result?.resourceTemplates || [];
    } catch (error) {
      // Resource templates are optional
      logger.debug(
        `Server ${this.config.id} doesn't support resource templates:`,
        error instanceof Error ? error.message : String(error)
      );
      return [];
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
        (error.message.includes("disconnected") ||
          error.message.includes("Connection closed"))
      ) {
        logger.error(
          `Connection lost while reading resource for ${this.config.id}:`,
          error.message
        );
        await this.handleConnectionError(error as Error);
      }
      throw error;
    }
  }

  /**
   * Get a prompt from the remote server
   */
  async getPrompt(
    name: string,
    args?: Record<string, string>
  ): Promise<unknown> {
    if (!this.connection || this.state !== ServerState.RUNNING) {
      throw ErrorHelpers.serverNotConnected(this.config.id);
    }

    try {
      return await this.connection.client.getPrompt({
        name,
        arguments: args,
      });
    } catch (error) {
      // Handle connection errors during prompt retrieval
      if (
        error instanceof Error &&
        (error.message.includes("disconnected") ||
          error.message.includes("Connection closed"))
      ) {
        logger.error(
          `Connection lost while getting prompt for ${this.config.id}:`,
          error.message
        );
        await this.handleConnectionError(error as Error);
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
        `Server ${this.config.id} doesn't support resources (capability not declared)`
      );
      return [];
    }

    try {
      const resourcesResponse = await this.listResources();

      // Extract resources from MCP listResources response
      if (
        resourcesResponse &&
        typeof resourcesResponse === "object" &&
        "resources" in resourcesResponse
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
        error?.message?.includes("Method not found")
      ) {
        logger.warn(
          `Server ${this.config.id} doesn't support resources/list method`
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

    // listTools already returns the tools array
    if (Array.isArray(toolsResponse)) {
      return toolsResponse.filter(
        (tool) => tool && typeof tool === "object" && "name" in tool
      );
    }

    return [];
  }
}
