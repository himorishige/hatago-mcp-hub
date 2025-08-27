/**
 * Remote MCP Server Connection Management
 * Handles connection caching, transport detection, and connection lifecycle
 */

import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { SSEClientTransport } from '@modelcontextprotocol/sdk/client/sse.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';

// Transport is the common interface for SSEClientTransport and StreamableHTTPClientTransport
type Transport = SSEClientTransport | StreamableHTTPClientTransport;

import type { RemoteServerConfig } from '../config/types.js';
import { ErrorCode } from '../utils/error-codes.js';
import { HatagoError } from '../utils/errors.js';
import type { Logger } from '../utils/logger.js';

// Connection cache TTL in milliseconds (5 minutes)
const CACHE_TTL = 5 * 60 * 1000;

export interface RemoteConnection {
  client: Client;
  transport: Transport;
  protocol?: string;
  serverName?: string;
  serverVersion?: string;
}

interface CachedConnection {
  connection: RemoteConnection;
  timestamp: number;
  url: string;
  headers?: Record<string, string>;
}

// Connection cache to reuse existing connections
const connectionCache = new Map<string, CachedConnection>();

/**
 * Get cache key for connection
 */
function getCacheKey(url: string, headers?: Record<string, string>): string {
  const sortedHeaders = headers
    ? Object.entries(headers)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([k, v]) => `${k}:${v}`)
        .join(',')
    : '';
  return `${url}|${sortedHeaders}`;
}

/**
 * Get cached connection if valid
 */
function getCachedConnection(
  url: string,
  headers?: Record<string, string>,
): RemoteConnection | null {
  const key = getCacheKey(url, headers);
  const cached = connectionCache.get(key);

  if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
    return cached.connection;
  }

  // Remove expired entry
  if (cached) {
    connectionCache.delete(key);
  }

  return null;
}

/**
 * Store connection in cache
 */
function setCachedConnection(
  url: string,
  connection: RemoteConnection,
  headers?: Record<string, string>,
): void {
  const key = getCacheKey(url, headers);
  connectionCache.set(key, {
    connection,
    timestamp: Date.now(),
    url,
    headers,
  });
}

export class RemoteConnectionManager {
  private config: RemoteServerConfig;
  private logger: Logger;
  private connection: RemoteConnection | null = null;

  constructor(config: RemoteServerConfig, logger: Logger) {
    this.config = config;
    this.logger = logger;
  }

  /**
   * Detect transport type from URL
   */
  detectTransport(url: string): 'http' | 'sse' {
    // If transport is explicitly specified, use it
    if (this.config.transport) {
      // Map various transport types to supported ones
      if (this.config.transport === 'sse') return 'sse';
      if (this.config.transport === 'websocket') return 'http'; // websocket not yet supported, fallback to http
      if (this.config.transport === 'streamable-http') return 'http';
      return 'http'; // default to http for any other value
    }

    // Auto-detect based on URL path
    if (url.includes('/sse') || url.includes('/events')) {
      return 'sse';
    }

    return 'http';
  }

  /**
   * Validate URL format
   */
  validateUrl(url: string): void {
    try {
      const parsed = new URL(url);

      // Check protocol
      if (!['http:', 'https:'].includes(parsed.protocol)) {
        throw new HatagoError(
          ErrorCode.INVALID_CONFIG,
          `Invalid protocol: ${parsed.protocol}. Only HTTP/HTTPS are supported.`,
          {
            context: { url },
          },
        );
      }

      // Check for localhost/private IPs in production
      if (process.env.NODE_ENV === 'production') {
        const hostname = parsed.hostname.toLowerCase();
        if (
          hostname === 'localhost' ||
          hostname === '127.0.0.1' ||
          hostname.startsWith('192.168.') ||
          hostname.startsWith('10.') ||
          hostname.startsWith('172.')
        ) {
          this.logger.warn(
            `Warning: Using local/private address in production: ${hostname}`,
          );
        }
      }
    } catch (error) {
      if (error instanceof HatagoError) throw error;

      throw new HatagoError(
        ErrorCode.INVALID_CONFIG,
        `Invalid URL format: ${url}`,
        {
          context: { url, error },
        },
      );
    }
  }

  /**
   * Create transport based on type
   */
  async createTransport(
    transportType: 'http' | 'sse',
    url: string,
    headers: Record<string, string>,
  ): Promise<Transport> {
    this.logger.info(
      `Using ${transportType.toUpperCase()} transport for ${this.config.id}`,
    );

    if (transportType === 'sse') {
      // SSEClientTransport requires headers in requestInit
      const sseTransport = new SSEClientTransport(new URL(url), {
        requestInit: { headers },
      });
      return sseTransport;
    } else {
      // StreamableHTTPClientTransport requires headers in requestInit
      const httpTransport = new StreamableHTTPClientTransport(new URL(url), {
        requestInit: { headers },
      });
      return httpTransport;
    }
  }

  /**
   * Connect to remote server with specific transport
   */
  async connectWithTransport(
    url: string,
    transportType: 'http' | 'sse',
  ): Promise<RemoteConnection> {
    this.logger.info(
      `Attempting ${transportType.toUpperCase()} connection to ${url}`,
    );

    // Parse and prepare headers
    const headers: Record<string, string> = this.config.auth?.token
      ? { Authorization: `Bearer ${this.config.auth.token}` }
      : {};

    // Check cache first
    const cached = getCachedConnection(url, headers);
    if (cached) {
      this.logger.info(`Using cached connection for ${url}`);
      this.connection = cached;
      return cached;
    }

    try {
      // Create transport
      const transport = await this.createTransport(transportType, url, headers);

      // Create client with extended timeout for remote connections
      const client = new Client(
        {
          name: `hatago-hub-${this.config.id}`,
          version: '0.2.0',
        },
        {
          capabilities: {
            tools: {},
            resources: {},
            prompts: {},
          },
        },
      );

      // Connect to server and get initialization result
      const initResult: any = await client.connect(transport);

      // Get server info from initialization result
      const serverInfo = initResult?.serverInfo;
      const protocol = initResult?.protocolVersion || 'unknown';
      const serverName = serverInfo?.name || 'unknown';
      const serverVersion = serverInfo?.version || 'unknown';

      this.logger.info(
        `Connected to ${serverName} v${serverVersion} (protocol: ${protocol})`,
      );

      const connection: RemoteConnection = {
        client,
        transport,
        protocol,
        serverName,
        serverVersion,
      };

      // Cache successful connection
      setCachedConnection(url, connection, headers);
      this.connection = connection;

      return connection;
    } catch (error) {
      this.logger.error({ error }, `Failed to connect with ${transportType}`);
      throw error;
    }
  }

  /**
   * Attempt connection with auto-detection
   */
  async attemptConnection(): Promise<RemoteConnection> {
    const { url } = this.config;
    this.validateUrl(url);

    // Detect transport type
    const transportType = this.detectTransport(url);

    try {
      // Try detected transport first
      return await this.connectWithTransport(url, transportType);
    } catch (firstError) {
      this.logger.warn(
        { error: firstError },
        `Failed with ${transportType}, trying alternative transport`,
      );

      // Try alternative transport
      const altTransport = transportType === 'sse' ? 'http' : 'sse';
      try {
        return await this.connectWithTransport(url, altTransport);
      } catch (secondError) {
        // Both transports failed
        throw new HatagoError(
          ErrorCode.TRANSPORT_ERROR,
          `Failed to connect with both ${transportType} and ${altTransport} transports`,
          {
            context: {
              url,
              firstError,
              secondError,
            },
          },
        );
      }
    }
  }

  /**
   * Get current connection
   */
  getConnection(): RemoteConnection | null {
    return this.connection;
  }

  /**
   * Close connection and cleanup
   */
  async cleanup(): Promise<void> {
    if (this.connection) {
      try {
        await this.connection.client.close();
      } catch (error) {
        this.logger.warn({ error }, 'Error closing connection');
      }
      this.connection = null;
    }
  }
}
