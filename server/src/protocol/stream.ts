/**
 * Hatago Stream Protocol
 *
 * Stream frame handling for WebSocket transport.
 */

import { HatagoProtocolError, RPC_ERRORS } from './errors.js';
import type { StreamFrame } from './types.js';

// Re-export StreamFrame for external use
export type { StreamFrame } from './types.js';

export interface StreamOptions {
  maxFrameSize?: number;
  heartbeatInterval?: number;
  idleTimeout?: number;
  windowSize?: number;
}

export class StreamFrameHandler {
  private readonly options: Required<StreamOptions>;
  private sequences = new Map<string, number>();
  private activeStreams = new Set<string>();
  private lastActivity = new Map<string, number>();
  private heartbeatTimer?: NodeJS.Timeout;
  private cleanupTimer?: NodeJS.Timeout;

  constructor(options: StreamOptions = {}) {
    this.options = {
      maxFrameSize: options.maxFrameSize ?? 1024 * 1024, // 1MB
      heartbeatInterval: options.heartbeatInterval ?? 30000, // 30s
      idleTimeout: options.idleTimeout ?? 300000, // 5 minutes
      windowSize: options.windowSize ?? 100,
      ...options,
    };

    this.startHeartbeat();
    this.startCleanup();
  }

  createFrame(
    type: StreamFrame['type'],
    id: string,
    payload?: any,
  ): StreamFrame {
    const seq = this.getNextSequence(id);
    const frame: StreamFrame = {
      type,
      id,
      seq,
      timestamp: Date.now(),
    };

    if (payload !== undefined) {
      frame.payload = payload;
    }

    // Validate frame size
    const frameSize = JSON.stringify(frame).length;
    if (frameSize > this.options.maxFrameSize) {
      throw HatagoProtocolError.systemError(
        `Frame size ${frameSize} exceeds maximum ${this.options.maxFrameSize}`,
        { code: RPC_ERRORS.STREAM_ERROR },
      );
    }

    // Track stream lifecycle
    this.updateActivity(id);
    if (type === 'data') {
      this.activeStreams.add(id);
    } else if (type === 'end' || type === 'cancel') {
      this.activeStreams.delete(id);
      this.sequences.delete(id);
      this.lastActivity.delete(id);
    }

    return frame;
  }

  validateFrame(frame: any): StreamFrame {
    if (!frame || typeof frame !== 'object') {
      throw HatagoProtocolError.userError('Invalid frame: must be object');
    }

    const { type, id, seq, timestamp, payload } = frame;

    if (!['data', 'error', 'end', 'heartbeat', 'cancel'].includes(type)) {
      throw HatagoProtocolError.userError(`Invalid frame type: ${type}`);
    }

    if (typeof id !== 'string' || id.length === 0) {
      throw HatagoProtocolError.userError(
        'Invalid frame id: must be non-empty string',
      );
    }

    if (typeof seq !== 'number' || seq < 0) {
      throw HatagoProtocolError.userError(
        'Invalid frame sequence: must be non-negative number',
      );
    }

    if (typeof timestamp !== 'number' || timestamp <= 0) {
      throw HatagoProtocolError.userError(
        'Invalid frame timestamp: must be positive number',
      );
    }

    return { type, id, seq, timestamp, payload };
  }

  isStreamActive(id: string): boolean {
    return this.activeStreams.has(id);
  }

  getActiveStreamCount(): number {
    return this.activeStreams.size;
  }

  endStream(id: string): StreamFrame {
    return this.createFrame('end', id);
  }

  cancelStream(id: string): StreamFrame {
    return this.createFrame('cancel', id);
  }

  createHeartbeat(): StreamFrame {
    return this.createFrame('heartbeat', 'system');
  }

  private getNextSequence(id: string): number {
    const current = this.sequences.get(id) ?? 0;
    const next = current + 1;
    this.sequences.set(id, next);
    return next;
  }

  private updateActivity(id: string): void {
    this.lastActivity.set(id, Date.now());
  }

  private startHeartbeat(): void {
    this.heartbeatTimer = setInterval(() => {
      // Heartbeat is handled by the transport layer
      // This just ensures we keep the timer running
    }, this.options.heartbeatInterval);
  }

  private startCleanup(): void {
    this.cleanupTimer = setInterval(() => {
      const now = Date.now();
      const timeout = this.options.idleTimeout;

      for (const [id, lastActivity] of this.lastActivity.entries()) {
        if (now - lastActivity > timeout) {
          // Clean up idle streams
          this.activeStreams.delete(id);
          this.sequences.delete(id);
          this.lastActivity.delete(id);
        }
      }
    }, this.options.idleTimeout / 2); // Check twice per timeout period
  }

  dispose(): void {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
    }
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
    }

    this.activeStreams.clear();
    this.sequences.clear();
    this.lastActivity.clear();
  }
}

// Stream utilities
export class StreamController {
  private readonly id: string;
  private readonly frameHandler: StreamFrameHandler;
  private readonly sendFrame: (frame: StreamFrame) => void;
  private isEnded = false;

  constructor(
    id: string,
    frameHandler: StreamFrameHandler,
    sendFrame: (frame: StreamFrame) => void,
  ) {
    this.id = id;
    this.frameHandler = frameHandler;
    this.sendFrame = sendFrame;
  }

  push(data: any): void {
    if (this.isEnded) {
      throw HatagoProtocolError.systemError('Cannot push to ended stream');
    }

    const frame = this.frameHandler.createFrame('data', this.id, data);
    this.sendFrame(frame);
  }

  error(error: any): void {
    if (this.isEnded) {
      return; // Already ended, ignore
    }

    const errorPayload =
      error instanceof Error
        ? {
            message: error.message,
            name: error.name,
            stack: error.stack,
          }
        : error;

    const frame = this.frameHandler.createFrame('error', this.id, errorPayload);
    this.sendFrame(frame);
    this.isEnded = true;
  }

  end(): void {
    if (this.isEnded) {
      return; // Already ended
    }

    const frame = this.frameHandler.createFrame('end', this.id);
    this.sendFrame(frame);
    this.isEnded = true;
  }

  cancel(): void {
    if (this.isEnded) {
      return; // Already ended
    }

    const frame = this.frameHandler.createFrame('cancel', this.id);
    this.sendFrame(frame);
    this.isEnded = true;
  }
}
