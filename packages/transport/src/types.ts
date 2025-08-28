/**
 * Transport layer types and interfaces
 */

/**
 * Base transport interface for MCP communication
 */
export interface ITransport {
  /**
   * Send a message through the transport
   */
  send(message: any): Promise<void>;
  
  /**
   * Register a message handler
   */
  onMessage(handler: (message: any) => void): void;
  
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
}

/**
 * Transport options
 */
export interface TransportOptions {
  timeout?: number;
  reconnect?: boolean;
  reconnectDelay?: number;
  maxReconnectAttempts?: number;
}

/**
 * Process transport options (Node.js)
 */
export interface ProcessTransportOptions extends TransportOptions {
  command: string;
  args?: string[];
  env?: Record<string, string>;
  cwd?: string;
}

/**
 * HTTP transport options
 */
export interface HttpTransportOptions extends TransportOptions {
  url: string;
  headers?: Record<string, string>;
  method?: 'GET' | 'POST';
}

/**
 * WebSocket transport options
 */
export interface WebSocketTransportOptions extends TransportOptions {
  url: string;
  protocols?: string[];
  headers?: Record<string, string>;
}

/**
 * Transport factory for creating transports based on configuration
 */
export interface ITransportFactory {
  createTransport(type: string, options: any): ITransport;
}