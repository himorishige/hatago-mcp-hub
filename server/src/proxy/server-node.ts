/**
 * Server Node
 *
 * Represents a single MCP server in the capability graph.
 */

import type { Capabilities, ServerInfo, Transport } from '../protocol/index.js';
import {
  CircuitBreaker,
  type CircuitBreakerOptions,
} from './circuit-breaker.js';

export interface IsolationOptions {
  timeoutMs?: number;
  maxConcurrent?: number;
  circuitBreaker?: CircuitBreakerOptions;
}

export interface ServerNodeOptions {
  name: string;
  transport: Transport;
  capabilities?: Capabilities;
  isolation?: IsolationOptions;
  metadata?: Record<string, any>;
}

export enum ServerNodeState {
  Disconnected = 'disconnected',
  Connecting = 'connecting',
  Connected = 'connected',
  Failed = 'failed',
  CircuitOpen = 'circuit-open',
}

export class ServerNode {
  public readonly name: string;
  public readonly transport: Transport;
  public readonly isolation: Required<IsolationOptions>;
  public readonly metadata: Record<string, any>;

  private _capabilities?: Capabilities;
  private _state: ServerNodeState = ServerNodeState.Disconnected;
  private _lastError?: Error;
  private _connectionAttempts = 0;
  private _activeCalls = 0;
  private _circuitBreaker: CircuitBreaker;

  constructor(options: ServerNodeOptions) {
    this.name = options.name;
    this.transport = options.transport;
    this.metadata = options.metadata ?? {};

    // Set up isolation defaults
    this.isolation = {
      timeoutMs: options.isolation?.timeoutMs ?? 30000,
      maxConcurrent: options.isolation?.maxConcurrent ?? 10,
      circuitBreaker: {
        failureThreshold:
          options.isolation?.circuitBreaker?.failureThreshold ?? 5,
        resetTimeoutMs:
          options.isolation?.circuitBreaker?.resetTimeoutMs ?? 60000,
        ...options.isolation?.circuitBreaker,
      },
    };

    this._capabilities = options.capabilities;
    this._circuitBreaker = new CircuitBreaker(
      this.name,
      this.isolation.circuitBreaker,
    );

    this.setupTransportHandlers();
  }

  get capabilities(): Capabilities {
    return this._capabilities ?? {};
  }

  get state(): ServerNodeState {
    if (this._circuitBreaker.isOpen()) {
      return ServerNodeState.CircuitOpen;
    }
    return this._state;
  }

  get isConnected(): boolean {
    return this.state === ServerNodeState.Connected;
  }

  get isAvailable(): boolean {
    return this.isConnected && !this._circuitBreaker.isOpen();
  }

  get lastError(): Error | undefined {
    return this._lastError;
  }

  get activeCalls(): number {
    return this._activeCalls;
  }

  get connectionAttempts(): number {
    return this._connectionAttempts;
  }

  async connect(): Promise<void> {
    if (this._state === ServerNodeState.Connecting) {
      throw new Error(`Server ${this.name} is already connecting`);
    }

    this._state = ServerNodeState.Connecting;
    this._connectionAttempts++;

    try {
      await this.transport.connect();
      this._state = ServerNodeState.Connected;
      this._lastError = undefined;
    } catch (error) {
      this._state = ServerNodeState.Failed;
      this._lastError =
        error instanceof Error ? error : new Error(String(error));
      throw error;
    }
  }

  async disconnect(): Promise<void> {
    try {
      await this.transport.disconnect();
    } finally {
      this._state = ServerNodeState.Disconnected;
      this._activeCalls = 0;
    }
  }

  async call<T = any>(method: string, params?: any): Promise<T> {
    if (!this.isAvailable) {
      throw new Error(
        `Server ${this.name} is not available (state: ${this.state})`,
      );
    }

    if (this._activeCalls >= this.isolation.maxConcurrent) {
      throw new Error(
        `Server ${this.name} has reached maximum concurrent calls (${this.isolation.maxConcurrent})`,
      );
    }

    this._activeCalls++;

    try {
      const result = await this._circuitBreaker.execute(async () => {
        return await this.executeWithTimeout(method, params);
      });
      return result;
    } finally {
      this._activeCalls--;
    }
  }

  updateCapabilities(capabilities: Capabilities): void {
    this._capabilities = capabilities;
  }

  getServerInfo(): ServerInfo {
    return {
      name: this.name,
      capabilities: this.capabilities,
      metadata: this.metadata,
    };
  }

  private async executeWithTimeout(method: string, params?: any): Promise<any> {
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(
          new Error(
            `Call to ${this.name}.${method} timed out after ${this.isolation.timeoutMs}ms`,
          ),
        );
      }, this.isolation.timeoutMs);

      // This would be replaced with actual transport call
      // For now, just simulate the call
      setTimeout(() => {
        clearTimeout(timeout);
        resolve({ method, params, server: this.name });
      }, 100);
    });
  }

  private setupTransportHandlers(): void {
    this.transport.onError((error) => {
      this._lastError = error;
      if (this._state === ServerNodeState.Connected) {
        this._state = ServerNodeState.Failed;
      }
    });

    this.transport.onClose(() => {
      this._state = ServerNodeState.Disconnected;
      this._activeCalls = 0;
    });
  }
}
