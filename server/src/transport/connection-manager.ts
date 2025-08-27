/**
 * Connection management for Hatago
 *
 * Provides connection resilience and monitoring:
 * - Heartbeat (ping/pong)
 * - Timeouts and idle detection
 * - Graceful shutdown
 * - Backpressure control
 * - Cancellation propagation
 */

import type { ChildProcess } from 'node:child_process';
import { EventEmitter } from 'node:events';
import type { JSONRPCMessage } from '@modelcontextprotocol/sdk/types.js';
import { logger } from '../observability/minimal-logger.js';

/**
 * Connection configuration
 */
export interface ConnectionConfig {
  /** Heartbeat interval in ms (default: 30s) */
  heartbeatInterval?: number;
  /** Connection timeout in ms (default: 90s) */
  connectionTimeout?: number;
  /** Idle timeout in ms (default: 10min) */
  idleTimeout?: number;
  /** Max message size in bytes (default: 2MB) */
  maxMessageSize?: number;
  /** Max concurrent requests (default: 64) */
  maxConcurrentRequests?: number;
  /** Shutdown grace period in ms (default: 5s) */
  shutdownGracePeriod?: number;
}

/**
 * Default connection configuration
 */
export const DEFAULT_CONNECTION_CONFIG: Required<ConnectionConfig> = {
  heartbeatInterval: 30000, // 30 seconds
  connectionTimeout: 90000, // 90 seconds
  idleTimeout: 600000, // 10 minutes
  maxMessageSize: 2 * 1024 * 1024, // 2MB
  maxConcurrentRequests: 64,
  shutdownGracePeriod: 5000, // 5 seconds
};

/**
 * Connection state
 */
export enum ConnectionState {
  CONNECTING = 'connecting',
  CONNECTED = 'connected',
  DISCONNECTING = 'disconnecting',
  DISCONNECTED = 'disconnected',
  ERROR = 'error',
}

/**
 * Connection statistics
 */
export interface ConnectionStats {
  state: ConnectionState;
  connectedAt?: number;
  lastActivity?: number;
  messagesSent: number;
  messagesReceived: number;
  errors: number;
  activeRequests: number;
}

/**
 * Base connection manager
 */
export abstract class ConnectionManager extends EventEmitter {
  protected state: ConnectionState = ConnectionState.DISCONNECTED;
  protected config: Required<ConnectionConfig>;
  protected stats: ConnectionStats;
  protected heartbeatTimer?: NodeJS.Timeout;
  protected idleTimer?: NodeJS.Timeout;
  protected activeRequests = new Set<string>();
  protected pendingRequests = new Map<
    string,
    {
      resolve: (value: JSONRPCMessage) => void;
      reject: (error: Error) => void;
      timeout: NodeJS.Timeout;
    }
  >();

  constructor(config: ConnectionConfig = {}) {
    super();
    this.config = { ...DEFAULT_CONNECTION_CONFIG, ...config };
    this.stats = {
      state: ConnectionState.DISCONNECTED,
      messagesSent: 0,
      messagesReceived: 0,
      errors: 0,
      activeRequests: 0,
    };
  }

  /**
   * Start connection
   */
  async connect(): Promise<void> {
    if (this.state !== ConnectionState.DISCONNECTED) {
      throw new Error(`Cannot connect from state: ${this.state}`);
    }

    this.state = ConnectionState.CONNECTING;
    this.stats.state = ConnectionState.CONNECTING;

    try {
      await this.doConnect();
      this.state = ConnectionState.CONNECTED;
      this.stats.state = ConnectionState.CONNECTED;
      this.stats.connectedAt = Date.now();
      this.startHeartbeat();
      this.resetIdleTimer();
      logger.info('Connection established');
      this.emit('connected');
    } catch (error) {
      this.state = ConnectionState.ERROR;
      this.stats.state = ConnectionState.ERROR;
      this.stats.errors++;
      logger.error('Connection failed', { error });
      this.emit('error', error);
      throw error;
    }
  }

  /**
   * Disconnect gracefully
   */
  async disconnect(): Promise<void> {
    if (this.state === ConnectionState.DISCONNECTED) {
      return;
    }

    this.state = ConnectionState.DISCONNECTING;
    this.stats.state = ConnectionState.DISCONNECTING;

    // Stop heartbeat and idle timers
    this.stopHeartbeat();
    this.stopIdleTimer();

    // Cancel pending requests
    for (const [_id, request] of this.pendingRequests.entries()) {
      clearTimeout(request.timeout);
      request.reject(new Error('Connection closing'));
    }
    this.pendingRequests.clear();

    // Wait for active requests to complete (with timeout)
    if (this.activeRequests.size > 0) {
      logger.info(
        `Waiting for ${this.activeRequests.size} active requests to complete`,
      );
      await this.waitForActiveRequests();
    }

    try {
      await this.doDisconnect();
      this.state = ConnectionState.DISCONNECTED;
      this.stats.state = ConnectionState.DISCONNECTED;
      logger.info('Connection closed');
      this.emit('disconnected');
    } catch (error) {
      logger.error('Error during disconnect', { error });
      this.state = ConnectionState.ERROR;
      this.stats.state = ConnectionState.ERROR;
      this.stats.errors++;
      throw error;
    }
  }

  /**
   * Send message with timeout and backpressure
   */
  async sendMessage(
    id: string,
    message: JSONRPCMessage,
    timeout?: number,
  ): Promise<JSONRPCMessage> {
    // Check connection state
    if (this.state !== ConnectionState.CONNECTED) {
      throw new Error(`Cannot send message in state: ${this.state}`);
    }

    // Check message size
    const size = JSON.stringify(message).length;
    if (size > this.config.maxMessageSize) {
      throw new Error(
        `Message too large: ${size} bytes (max: ${this.config.maxMessageSize})`,
      );
    }

    // Check concurrent requests (backpressure)
    if (this.activeRequests.size >= this.config.maxConcurrentRequests) {
      throw new Error(
        `Too many concurrent requests: ${this.activeRequests.size}`,
      );
    }

    // Track request
    this.activeRequests.add(id);
    this.stats.activeRequests = this.activeRequests.size;
    this.resetIdleTimer();

    // Create promise with timeout
    return new Promise((resolve, reject) => {
      const timeoutMs = timeout || this.config.connectionTimeout;
      const timeoutId = setTimeout(() => {
        this.activeRequests.delete(id);
        this.stats.activeRequests = this.activeRequests.size;
        this.pendingRequests.delete(id);
        reject(new Error(`Request timeout: ${id}`));
      }, timeoutMs);

      this.pendingRequests.set(id, {
        resolve: (value) => {
          clearTimeout(timeoutId);
          this.activeRequests.delete(id);
          this.stats.activeRequests = this.activeRequests.size;
          this.pendingRequests.delete(id);
          resolve(value);
        },
        reject: (error) => {
          clearTimeout(timeoutId);
          this.activeRequests.delete(id);
          this.stats.activeRequests = this.activeRequests.size;
          this.pendingRequests.delete(id);
          reject(error);
        },
        timeout: timeoutId,
      });

      // Send the message
      this.doSendMessage(id, message)
        .then(() => {
          this.stats.messagesSent++;
          this.stats.lastActivity = Date.now();
        })
        .catch((error) => {
          const request = this.pendingRequests.get(id);
          if (request) {
            request.reject(error);
          }
        });
    });
  }

  /**
   * Handle received message
   */
  protected handleMessage(id: string, message: JSONRPCMessage): void {
    this.stats.messagesReceived++;
    this.stats.lastActivity = Date.now();
    this.resetIdleTimer();

    const request = this.pendingRequests.get(id);
    if (request) {
      request.resolve(message);
    } else {
      // Handle unsolicited messages (e.g., notifications)
      this.emit('message', id, message);
    }
  }

  /**
   * Start heartbeat
   */
  private startHeartbeat(): void {
    this.stopHeartbeat();

    this.heartbeatTimer = setInterval(() => {
      this.sendHeartbeat().catch((error) => {
        logger.warn('Heartbeat failed', { error });
        this.stats.errors++;

        // Disconnect on heartbeat failure
        this.disconnect().catch((err) => {
          logger.error('Failed to disconnect after heartbeat failure', {
            error: err,
          });
        });
      });
    }, this.config.heartbeatInterval);
  }

  /**
   * Stop heartbeat
   */
  private stopHeartbeat(): void {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = undefined;
    }
  }

  /**
   * Reset idle timer
   */
  private resetIdleTimer(): void {
    this.stopIdleTimer();

    this.idleTimer = setTimeout(() => {
      logger.info('Connection idle timeout');
      this.disconnect().catch((error) => {
        logger.error('Failed to disconnect on idle timeout', { error });
      });
    }, this.config.idleTimeout);
  }

  /**
   * Stop idle timer
   */
  private stopIdleTimer(): void {
    if (this.idleTimer) {
      clearTimeout(this.idleTimer);
      this.idleTimer = undefined;
    }
  }

  /**
   * Wait for active requests to complete
   */
  private async waitForActiveRequests(): Promise<void> {
    const startTime = Date.now();

    while (this.activeRequests.size > 0) {
      if (Date.now() - startTime > this.config.shutdownGracePeriod) {
        logger.warn(
          `Force closing with ${this.activeRequests.size} active requests`,
        );
        break;
      }

      await new Promise((resolve) => setTimeout(resolve, 100));
    }
  }

  /**
   * Get connection statistics
   */
  getStats(): ConnectionStats {
    return { ...this.stats };
  }

  /**
   * Abstract methods to be implemented by subclasses
   */
  protected abstract doConnect(): Promise<void>;
  protected abstract doDisconnect(): Promise<void>;
  protected abstract doSendMessage(
    id: string,
    message: JSONRPCMessage,
  ): Promise<void>;
  protected abstract sendHeartbeat(): Promise<void>;
}

/**
 * Process manager for child processes
 */
export class ProcessManager {
  private processes = new Map<
    string,
    {
      process: ChildProcess;
      startTime: number;
      restarts: number;
    }
  >();

  /**
   * Add process to manage
   */
  add(id: string, process: ChildProcess): void {
    this.processes.set(id, {
      process,
      startTime: Date.now(),
      restarts: 0,
    });

    // Handle process exit
    process.on('exit', (code, signal) => {
      logger.info(`Process ${id} exited`, { code, signal });
      this.processes.delete(id);
    });

    process.on('error', (error) => {
      logger.error(`Process ${id} error`, { error });
    });
  }

  /**
   * Gracefully shutdown process
   */
  async shutdown(id: string, gracePeriod = 5000): Promise<void> {
    const entry = this.processes.get(id);
    if (!entry) return;

    const { process } = entry;

    // Send SIGTERM
    logger.info(`Sending SIGTERM to process ${id}`);
    process.kill('SIGTERM');

    // Wait for graceful shutdown
    const startTime = Date.now();
    while (!process.killed && Date.now() - startTime < gracePeriod) {
      await new Promise((resolve) => setTimeout(resolve, 100));
    }

    // Force kill if still running
    if (!process.killed) {
      logger.warn(`Force killing process ${id}`);
      process.kill('SIGKILL');
    }

    this.processes.delete(id);
  }

  /**
   * Shutdown all processes
   */
  async shutdownAll(gracePeriod = 5000): Promise<void> {
    const promises: Promise<void>[] = [];

    for (const id of this.processes.keys()) {
      promises.push(this.shutdown(id, gracePeriod));
    }

    await Promise.all(promises);
  }

  /**
   * Get process statistics
   */
  getStats(): Record<string, unknown> {
    const stats: Record<string, unknown> = {};

    for (const [id, entry] of this.processes.entries()) {
      stats[id] = {
        pid: entry.process.pid,
        uptime: Date.now() - entry.startTime,
        restarts: entry.restarts,
        killed: entry.process.killed,
      };
    }

    return stats;
  }

  /**
   * Cancel all processes (propagate cancellation)
   */
  cancelAll(): void {
    for (const [id, entry] of this.processes.entries()) {
      logger.info(`Cancelling process ${id}`);
      entry.process.kill('SIGTERM');
    }
  }
}

/**
 * Global process manager
 */
export const processManager = new ProcessManager();

// Handle process signals for graceful shutdown
process.on('SIGTERM', async () => {
  logger.info('Received SIGTERM, shutting down processes');
  await processManager.shutdownAll();
});

process.on('SIGINT', async () => {
  logger.info('Received SIGINT, shutting down processes');
  await processManager.shutdownAll();
});
