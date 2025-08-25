/**
 * WebSocket Transport
 *
 * WebSocket-based transport with streaming support.
 */

import { EventEmitter } from 'node:events';
import { WebSocket } from 'ws';
import { HatagoProtocolError, RPC_ERRORS } from '../protocol/errors.js';
import type { Transport } from '../protocol/index.js';
import { type StreamFrame, StreamFrameHandler } from '../protocol/stream.js';

export interface WebSocketTransportOptions {
  url: string;
  headers?: Record<string, string>;
  heartbeatInterval?: number;
  reconnectDelay?: number;
  maxReconnectAttempts?: number;
  connectionTimeout?: number;
}

export class WebSocketTransport extends EventEmitter implements Transport {
  private readonly options: Required<WebSocketTransportOptions>;
  private ws?: WebSocket;
  private frameHandler: StreamFrameHandler;
  private heartbeatTimer?: NodeJS.Timeout;
  private reconnectTimer?: NodeJS.Timeout;
  private reconnectAttempts = 0;
  private isConnected = false;
  private isClosed = false;
  private messageHandlers = new Set<(message: any) => void>();
  private errorHandlers = new Set<(error: Error) => void>();
  private closeHandlers = new Set<() => void>();

  constructor(options: WebSocketTransportOptions) {
    super();

    this.options = {
      url: options.url,
      headers: options.headers ?? {},
      heartbeatInterval: options.heartbeatInterval ?? 30000,
      reconnectDelay: options.reconnectDelay ?? 5000,
      maxReconnectAttempts: options.maxReconnectAttempts ?? 5,
      connectionTimeout: options.connectionTimeout ?? 10000,
    };

    this.frameHandler = new StreamFrameHandler({
      heartbeatInterval: this.options.heartbeatInterval,
    });
  }

  async connect(): Promise<void> {
    if (this.isConnected) {
      return;
    }

    if (this.isClosed) {
      throw new Error('Transport is closed');
    }

    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(
          new Error(
            `Connection timeout after ${this.options.connectionTimeout}ms`,
          ),
        );
      }, this.options.connectionTimeout);

      try {
        this.ws = new WebSocket(this.options.url, {
          headers: this.options.headers,
        });

        this.ws.on('open', () => {
          clearTimeout(timeout);
          this.isConnected = true;
          this.reconnectAttempts = 0;
          this.startHeartbeat();
          this.emit('connected');
          resolve();
        });

        this.ws.on('message', (data) => {
          try {
            const message = JSON.parse(data.toString());

            // Handle stream frames
            if (this.isStreamFrame(message)) {
              this.handleStreamFrame(message);
            } else {
              // Regular JSON-RPC message
              this.messageHandlers.forEach((handler) => {
                try {
                  handler(message);
                } catch (error) {
                  this.emit('error', error);
                }
              });
            }
          } catch (error) {
            this.emit('error', new Error(`Failed to parse message: ${error}`));
          }
        });

        this.ws.on('error', (error) => {
          clearTimeout(timeout);
          this.emit('error', error);
          this.errorHandlers.forEach((handler) => {
            try {
              handler(error);
            } catch (handlerError) {
              // Prevent infinite error loops
              console.error('Error in error handler:', handlerError);
            }
          });
        });

        this.ws.on('close', (code, _reason) => {
          clearTimeout(timeout);
          this.cleanup();

          if (!this.isClosed && this.shouldReconnect(code)) {
            this.scheduleReconnect();
          } else {
            this.closeHandlers.forEach((handler) => {
              try {
                handler();
              } catch (error) {
                this.emit('error', error);
              }
            });
          }
        });

        this.ws.on('ping', () => {
          this.ws?.pong();
        });
      } catch (error) {
        clearTimeout(timeout);
        reject(error);
      }
    });
  }

  async disconnect(): Promise<void> {
    this.isClosed = true;
    this.cleanup();

    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      return new Promise((resolve) => {
        this.ws?.once('close', resolve);
        this.ws?.close(1000, 'Normal closure');
      });
    }
  }

  async send(message: any): Promise<void> {
    if (!this.isConnected || !this.ws) {
      throw HatagoProtocolError.systemError('Transport is not connected', {
        code: RPC_ERRORS.NETWORK_ERROR,
      });
    }

    try {
      const data = JSON.stringify(message);

      return new Promise((resolve, reject) => {
        this.ws?.send(data, (error) => {
          if (error) {
            reject(
              HatagoProtocolError.fromError(error, {
                code: RPC_ERRORS.NETWORK_ERROR,
              }),
            );
          } else {
            resolve();
          }
        });
      });
    } catch (error) {
      throw HatagoProtocolError.fromError(error, {
        code: RPC_ERRORS.NETWORK_ERROR,
      });
    }
  }

  onMessage(handler: (message: any) => void): void {
    this.messageHandlers.add(handler);
  }

  onError(handler: (error: Error) => void): void {
    this.errorHandlers.add(handler);
  }

  onClose(handler: () => void): void {
    this.closeHandlers.add(handler);
  }

  isConnected(): boolean {
    return this.isConnected && this.ws?.readyState === WebSocket.OPEN;
  }

  // Stream methods
  async sendStreamFrame(frame: StreamFrame): Promise<void> {
    await this.send(frame);
  }

  createStreamFrame(
    type: StreamFrame['type'],
    id: string,
    payload?: any,
  ): StreamFrame {
    return this.frameHandler.createFrame(type, id, payload);
  }

  private isStreamFrame(message: any): message is StreamFrame {
    return (
      message &&
      typeof message === 'object' &&
      typeof message.type === 'string' &&
      ['data', 'error', 'end', 'heartbeat', 'cancel'].includes(message.type) &&
      typeof message.id === 'string' &&
      typeof message.seq === 'number' &&
      typeof message.timestamp === 'number'
    );
  }

  private handleStreamFrame(frame: StreamFrame): void {
    try {
      const validFrame = this.frameHandler.validateFrame(frame);

      if (validFrame.type === 'heartbeat') {
        // Respond to heartbeat
        const response = this.frameHandler.createFrame('heartbeat', 'system');
        this.sendStreamFrame(response).catch((error) => {
          this.emit('error', error);
        });
      } else {
        // Emit stream frame event for higher level handling
        this.emit('streamFrame', validFrame);
      }
    } catch (error) {
      this.emit('error', error);
    }
  }

  private startHeartbeat(): void {
    this.stopHeartbeat();

    this.heartbeatTimer = setInterval(() => {
      if (this.isConnected()) {
        const heartbeat = this.frameHandler.createHeartbeat();
        this.sendStreamFrame(heartbeat).catch((error) => {
          this.emit('error', error);
        });
      }
    }, this.options.heartbeatInterval);
  }

  private stopHeartbeat(): void {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = undefined;
    }
  }

  private cleanup(): void {
    this.isConnected = false;
    this.stopHeartbeat();

    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = undefined;
    }
  }

  private shouldReconnect(code: number): boolean {
    // Don't reconnect on normal closure or policy violations
    if (code === 1000 || code === 1008 || code === 1011) {
      return false;
    }

    return this.reconnectAttempts < this.options.maxReconnectAttempts;
  }

  private scheduleReconnect(): void {
    if (this.reconnectTimer) {
      return;
    }

    const delay = this.options.reconnectDelay * 2 ** this.reconnectAttempts;
    const jitter = Math.random() * 0.1 * delay;

    this.reconnectTimer = setTimeout(() => {
      this.reconnectAttempts++;
      this.reconnectTimer = undefined;

      this.connect().catch((error) => {
        this.emit('error', error);

        if (this.reconnectAttempts < this.options.maxReconnectAttempts) {
          this.scheduleReconnect();
        }
      });
    }, delay + jitter);
  }

  dispose(): void {
    this.frameHandler.dispose();
    this.disconnect().catch(() => {
      // Ignore errors during disposal
    });
  }
}
