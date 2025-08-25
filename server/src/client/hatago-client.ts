/**
 * Hatago Client
 *
 * Unified client for interacting with Hatago MCP Hub.
 */

import type {
  JsonRpcRequest,
  JsonRpcResponse,
  StreamFrame,
  Transport,
} from '../protocol/index.js';
import {
  HatagoProtocolError,
  shouldRetryAfterDelay,
} from '../protocol/index.js';

export interface HatagoClientOptions {
  transport: Transport;
  timeout?: number;
  maxRetries?: number;
  retryDelay?: number;
}

export interface CallOptions {
  timeout?: number;
  retries?: number;
  requestId?: string | number;
}

export interface StreamOptions {
  timeout?: number;
  bufferSize?: number;
}

export class HatagoClient {
  private readonly transport: Transport;
  private readonly options: Required<Omit<HatagoClientOptions, 'transport'>>;
  private requestId = 0;
  private pendingRequests = new Map<string | number, PendingRequest>();
  private activeStreams = new Map<string, StreamController>();
  private isConnected = false;

  constructor(options: HatagoClientOptions) {
    this.transport = options.transport;
    this.options = {
      timeout: options.timeout ?? 30000,
      maxRetries: options.maxRetries ?? 3,
      retryDelay: options.retryDelay ?? 1000,
    };

    this.setupTransportHandlers();
  }

  /**
   * Connect to the server
   */
  async connect(): Promise<void> {
    if (this.isConnected) {
      return;
    }

    await this.transport.connect();
    this.isConnected = true;
  }

  /**
   * Disconnect from the server
   */
  async disconnect(): Promise<void> {
    if (!this.isConnected) {
      return;
    }

    // Cancel all pending requests
    for (const [id, pending] of this.pendingRequests) {
      pending.reject(new Error('Client disconnected'));
      this.pendingRequests.delete(id);
    }

    // End all active streams
    for (const [id, stream] of this.activeStreams) {
      stream.end();
      this.activeStreams.delete(id);
    }

    await this.transport.disconnect();
    this.isConnected = false;
  }

  /**
   * Make a JSON-RPC call
   */
  async call<T = unknown>(
    method: string,
    params?: unknown,
    options: CallOptions = {},
  ): Promise<T> {
    if (!this.isConnected) {
      throw new Error('Client is not connected');
    }

    const requestId = options.requestId ?? this.generateRequestId();
    const timeout = options.timeout ?? this.options.timeout;
    const maxRetries = options.retries ?? this.options.maxRetries;

    const request: JsonRpcRequest = {
      jsonrpc: '2.0',
      id: requestId,
      method,
      params,
    };

    return this.executeWithRetry(
      () => this.sendRequest<T>(request, timeout),
      maxRetries,
    );
  }

  /**
   * Create a streaming call
   */
  async *stream<T = unknown>(
    method: string,
    params?: unknown,
    options: StreamOptions = {},
  ): AsyncIterator<T> {
    if (!this.isConnected) {
      throw new Error('Client is not connected');
    }

    const streamId = `stream_${this.generateRequestId()}`;
    const timeout = options.timeout ?? this.options.timeout;
    const bufferSize = options.bufferSize ?? 100;

    // Start the stream
    await this.call(
      `${method}_stream_start`,
      { streamId, ...params },
      { timeout },
    );

    // Create stream controller
    const controller = new StreamController<T>(streamId, bufferSize);
    this.activeStreams.set(streamId, controller);

    try {
      yield* controller.iterator();
    } finally {
      // Cleanup
      this.activeStreams.delete(streamId);

      // End stream on server
      try {
        await this.call(
          `${method}_stream_end`,
          { streamId },
          { timeout: 5000 },
        );
      } catch {
        // Ignore errors during cleanup
      }
    }
  }

  /**
   * Cancel a pending request or stream
   */
  async cancel(id: string | number): Promise<void> {
    // Cancel pending request
    const pending = this.pendingRequests.get(id);
    if (pending) {
      pending.reject(new Error('Request cancelled'));
      this.pendingRequests.delete(id);
    }

    // Cancel active stream
    const stream = this.activeStreams.get(String(id));
    if (stream) {
      stream.cancel();
      this.activeStreams.delete(String(id));
    }

    // Send cancellation to server
    if (this.isConnected) {
      try {
        await this.transport.send({
          jsonrpc: '2.0',
          method: 'cancel',
          params: { id },
        });
      } catch {
        // Ignore errors during cancellation
      }
    }
  }

  /**
   * List available tools
   */
  async listTools(): Promise<string[]> {
    return this.call('tools/list');
  }

  /**
   * Get server status
   */
  async getStatus(): Promise<unknown> {
    return this.call('server/status');
  }

  private async sendRequest<T>(
    request: JsonRpcRequest,
    timeout: number,
  ): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      const timer = setTimeout(() => {
        if (request.id) this.pendingRequests.delete(request.id);
        reject(new Error(`Request timeout after ${timeout}ms`));
      }, timeout);

      const pending: PendingRequest = {
        resolve: (result: T) => {
          clearTimeout(timer);
          resolve(result);
        },
        reject: (error: Error) => {
          clearTimeout(timer);
          reject(error);
        },
      };

      if (request.id) this.pendingRequests.set(request.id, pending);

      this.transport.send(request).catch((error) => {
        if (request.id) this.pendingRequests.delete(request.id);
        clearTimeout(timer);
        reject(error);
      });
    });
  }

  private async executeWithRetry<T>(
    operation: () => Promise<T>,
    maxRetries: number,
  ): Promise<T> {
    let lastError: Error | undefined;

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        return await operation();
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));

        if (attempt === maxRetries) {
          break;
        }

        const delay = shouldRetryAfterDelay(lastError, attempt, maxRetries);
        if (delay === null) {
          break;
        }

        await new Promise((resolve) => setTimeout(resolve, delay));
      }
    }

    throw lastError;
  }

  private setupTransportHandlers(): void {
    this.transport.onMessage((message) => {
      if (this.isJsonRpcResponse(message)) {
        this.handleJsonRpcResponse(message);
      } else if (this.isStreamFrame(message)) {
        this.handleStreamFrame(message);
      }
    });

    this.transport.onError((error) => {
      // Handle transport errors
      for (const pending of this.pendingRequests.values()) {
        pending.reject(error);
      }
      this.pendingRequests.clear();

      // Notify active streams
      for (const stream of this.activeStreams.values()) {
        stream.error(error);
      }
    });

    this.transport.onClose(() => {
      this.isConnected = false;

      // Clean up pending requests
      const closeError = new Error('Connection closed');
      for (const pending of this.pendingRequests.values()) {
        pending.reject(closeError);
      }
      this.pendingRequests.clear();

      // End active streams
      for (const stream of this.activeStreams.values()) {
        stream.end();
      }
      this.activeStreams.clear();
    });
  }

  private handleJsonRpcResponse(response: JsonRpcResponse): void {
    if (response.id === null || response.id === undefined) {
      return; // Notification, ignore
    }

    const pending = this.pendingRequests.get(response.id);
    if (!pending) {
      return; // No matching request
    }

    this.pendingRequests.delete(response.id);

    if (response.error) {
      const error = HatagoProtocolError.fromError(
        new Error(response.error.message),
        {
          code: response.error.code,
          id: response.id,
        },
      );
      pending.reject(error);
    } else {
      pending.resolve(response.result);
    }
  }

  private handleStreamFrame(frame: StreamFrame): void {
    const stream = this.activeStreams.get(frame.id);
    if (!stream) {
      return;
    }

    switch (frame.type) {
      case 'data':
        stream.push(frame.payload);
        break;
      case 'error':
        stream.error(new Error(frame.payload?.message || 'Stream error'));
        break;
      case 'end':
        stream.end();
        break;
      case 'cancel':
        stream.cancel();
        break;
    }
  }

  private isJsonRpcResponse(message: unknown): message is JsonRpcResponse {
    return (
      message &&
      message.jsonrpc === '2.0' &&
      (message.result !== undefined || message.error !== undefined)
    );
  }

  private isStreamFrame(message: unknown): message is StreamFrame {
    return (
      message &&
      typeof message === 'object' &&
      typeof message.type === 'string' &&
      ['data', 'error', 'end', 'cancel'].includes(message.type) &&
      typeof message.id === 'string'
    );
  }

  private generateRequestId(): number {
    return ++this.requestId;
  }
}

interface PendingRequest {
  resolve: (result: unknown) => void;
  reject: (error: Error) => void;
}

class StreamController<T = unknown> {
  private buffer: T[] = [];
  private resolvers: Array<{
    resolve: (value: IteratorResult<T>) => void;
    reject: (error: Error) => void;
  }> = [];
  private isEnded = false;
  private error?: Error;

  constructor(
    public readonly id: string,
    private readonly maxBuffer: number = 100,
  ) {}

  push(data: T): void {
    if (this.isEnded) {
      return;
    }

    if (this.resolvers.length > 0) {
      // Someone is waiting for data
      const resolver = this.resolvers.shift();
      if (resolver) {
        resolver.resolve({ value: data, done: false });
      }
    } else {
      // Buffer the data
      if (this.buffer.length >= this.maxBuffer) {
        // Drop oldest data to prevent memory bloat
        this.buffer.shift();
      }
      this.buffer.push(data);
    }
  }

  setError(err: Error): void {
    this.error = err;
    this.end();
  }

  end(): void {
    this.isEnded = true;

    // Resolve all pending resolvers
    for (const resolver of this.resolvers) {
      if (this.error) {
        resolver.reject(this.error);
      } else {
        resolver.resolve({ value: undefined as T, done: true });
      }
    }
    this.resolvers.length = 0;
  }

  cancel(): void {
    this.isEnded = true;
    const cancelError = new Error('Stream cancelled');

    for (const resolver of this.resolvers) {
      resolver.reject(cancelError);
    }
    this.resolvers.length = 0;
  }

  async *iterator(): AsyncIterator<T> {
    while (!this.isEnded || this.buffer.length > 0) {
      if (this.buffer.length > 0) {
        const item = this.buffer.shift();
        if (item !== undefined) {
          yield item;
      } else if (this.isEnded) {
        break;
      } else {
        // Wait for data
        const result = await new Promise<IteratorResult<T>>(
          (resolve, reject) => {
            this.resolvers.push({ resolve, reject });
          },
        );

        if (result.done) {
          break;
        } else {
          yield result.value;
        }
      }
    }

    if (this.error) {
      throw this.error;
    }
  }
}
