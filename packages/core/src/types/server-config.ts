/**
 * Server configuration types for Hatago
 * Unified configuration schema with activation policies
 */

/**
 * Server activation policy
 * Determines how and when a server is started
 */
export type ActivationPolicy =
  | 'always' // Start on Hatago startup, never auto-stop
  | 'onDemand' // Start when needed, stop when idle
  | 'manual'; // Only start via explicit user action

/**
 * Activity reset timing for idle detection
 */
export type ActivityReset = 'onCallStart' | 'onCallEnd';

/**
 * Server state in the state machine
 */
export enum ServerState {
  MANUAL = 'manual', // Manual management (cannot auto-start)
  INACTIVE = 'inactive', // Not running (can be activated)
  ACTIVATING = 'activating', // Starting up
  ACTIVE = 'active', // Running and ready
  IDLING = 'idling', // Running but will stop soon
  STOPPING = 'stopping', // Shutting down
  ERROR = 'error', // Error state
  COOLDOWN = 'cooldown' // Waiting before retry
}

/**
 * Idle policy configuration
 */
export interface IdlePolicy {
  /** Time in ms before stopping idle server (default: 300000 = 5min) */
  idleTimeoutMs?: number;

  /** Minimum time in ms to keep server running (default: 30000 = 30s) */
  minLingerMs?: number;

  /** When to reset activity counter */
  activityReset?: ActivityReset;
}

/**
 * Timeout configuration for server operations
 */
export interface ServerTimeouts {
  /** Process spawn/connection timeout in ms (default: 20000) */
  spawnTimeout?: number;

  /** MCP handshake timeout in ms (default: 10000) */
  handshakeTimeout?: number;

  /** Ready state timeout in ms (default: 20000) */
  readyTimeout?: number;
}

/**
 * Security configuration
 */
export interface ServerSecurity {
  /** Require authentication for this server */
  requireAuth?: boolean;

  /** List of allowed users */
  allowedUsers?: string[];

  /** Pin to specific version */
  pinVersion?: string;

  /** Checksum for integrity verification */
  checksum?: string;
}

/**
 * Server metadata (auto-generated, not user-editable)
 */
export interface ServerMetadata {
  /** Server identifier */
  serverId: string;

  /** Server type */
  serverType: 'local' | 'npx' | 'http' | 'sse' | 'ws';

  /** Last successful connection timestamp */
  lastConnected?: string;

  /** Last disconnection timestamp */
  lastDisconnected?: string;

  /** Capabilities discovered from server */
  capabilities?: {
    tools: boolean;
    resources: boolean;
    prompts: boolean;
  };

  /** Cached tool definitions */
  tools?: Array<{
    name: string;
    description: string;
    inputSchema: any;
  }>;

  /** Cached resource definitions */
  resources?: Array<{
    uri: string;
    name: string;
    mimeType?: string;
  }>;

  /** Cached prompt definitions */
  prompts?: Array<{
    name: string;
    description: string;
    arguments?: any[];
  }>;

  /** Usage statistics */
  statistics?: {
    totalCalls: number;
    lastUsed?: string;
    totalErrors: number;
    averageResponseTime?: number;
  };

  /** Connection info for remote servers */
  connectionInfo?: {
    url?: string;
    headers?: Record<string, string>;
    lastSuccessfulPing?: string;
  };
}

/**
 * Complete server configuration
 */
export interface ServerConfigInterface {
  // === Connection Configuration ===

  /** Local server command */
  command?: string;

  /** Command arguments */
  args?: string[];

  /** Environment variables */
  env?: Record<string, string>;

  /** Working directory */
  cwd?: string;

  /** Remote server URL */
  url?: string;

  /** Transport type for remote servers */
  type?: 'stdio' | 'http' | 'sse' | 'ws';

  /** HTTP headers for remote servers */
  headers?: Record<string, string>;

  // === Activation Configuration ===

  /** Server activation policy (default: 'manual') */
  activationPolicy?: ActivationPolicy;

  /** Idle management policy */
  idlePolicy?: IdlePolicy;

  /** Operation timeouts */
  timeouts?: ServerTimeouts;

  /** Security settings */
  security?: ServerSecurity;

  // === Runtime State (not user-editable) ===

  /** Current server state */
  _state?: ServerState;

  /** Cached metadata */
  _metadata?: ServerMetadata;

  /** Last error information */
  _lastError?: {
    message: string;
    code?: string;
    timestamp: string;
    retryAfterMs?: number;
  };
}

/**
 * Hatago configuration with servers
 */
export interface ServerHatagoConfig {
  /** MCP servers configuration */
  mcpServers?: Record<string, ServerConfigInterface>;

  /** VS Code compatibility: alternative key for servers */
  servers?: Record<string, ServerConfigInterface>;

  /** Notification settings */
  notifications?: {
    enabled?: boolean;
    rateLimitSec?: number;
    severity?: string[];
  };

  /** Global defaults for servers */
  defaults?: {
    activationPolicy?: ActivationPolicy;
    idlePolicy?: IdlePolicy;
    timeouts?: ServerTimeouts;
  };

  /** Admin mode for showing manual servers */
  adminMode?: boolean;
}
