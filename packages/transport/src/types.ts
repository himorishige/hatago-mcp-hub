/**
 * Transport layer types and interfaces
 */

/**
 * Base transport interface for MCP communication
 */
export type ITransport = {
  /**
   * Send a message through the transport
   */
  send(message: unknown): Promise<void>;

  /**
   * Register a message handler
   */
  onMessage(handler: (message: unknown) => void): void;

  /**
   * Register an error handler
   */
  onError(handler: (error: Error) => void): void;

  /**
   * Start the transport
   */
  start(): Promise<void>;

  /**
   * Close the transport
   */
  close(): Promise<void>;

  /**
   * Check if transport is ready
   */
  ready(): Promise<boolean>;
};

/**
 * Transport options
 */
export type TransportOptions = {
  timeout?: number;
  reconnect?: boolean;
  reconnectDelay?: number;
  maxReconnectAttempts?: number;
};

/**
 * Process transport options (Node.js)
 */
export type ProcessTransportOptions = TransportOptions & {
  command: string;
  args?: string[];
  env?: Record<string, string>;
  cwd?: string;
};

/**
 * HTTP transport options
 */
export type HttpTransportOptions = TransportOptions & {
  url: string;
  headers?: Record<string, string>;
  method?: 'GET' | 'POST';
};

/**
 * WebSocket transport options
 */
export type WebSocketTransportOptions = TransportOptions & {
  url: string;
  protocols?: string[];
  headers?: Record<string, string>;
};

/**
 * Transport factory for creating transports based on configuration
 */
export type ITransportFactory = {
  createTransport: (type: string, options: unknown) => ITransport;
};
