/**
 * Node.js EventBus implementation using EventEmitter
 */
import { EventEmitter } from 'node:events';
import type { EventBus } from '../types.js';

/**
 * EventEmitter-based EventBus for Node.js
 */
export class NodeEventBus implements EventBus {
  private emitter: EventEmitter;

  constructor(maxListeners = 100) {
    this.emitter = new EventEmitter();
    this.maxListeners = maxListeners;
    this.emitter.setMaxListeners(maxListeners);
  }

  on(event: string, handler: (payload: unknown) => void): () => void {
    this.emitter.on(event, handler);

    // Return unsubscribe function
    return () => {
      this.emitter.off(event, handler);
    };
  }

  emit(event: string, payload: unknown): void {
    // Use setImmediate to ensure async behavior
    setImmediate(() => {
      this.emitter.emit(event, payload);
    });
  }

  off(event: string): void {
    this.emitter.removeAllListeners(event);
  }

  /**
   * Get the underlying EventEmitter (for compatibility during migration)
   */
  get native(): EventEmitter {
    return this.emitter;
  }
}

/**
 * Lightweight EventBus implementation (no dependencies)
 */
export class LightEventBus implements EventBus {
  private handlers = new Map<string, Set<(payload: unknown) => void>>();

  on(event: string, handler: (payload: unknown) => void): () => void {
    if (!this.handlers.has(event)) {
      this.handlers.set(event, new Set());
    }

    this.handlers.get(event)?.add(handler);

    // Return unsubscribe function
    return () => {
      const handlers = this.handlers.get(event);
      if (handlers) {
        handlers.delete(handler);
        if (handlers.size === 0) {
          this.handlers.delete(event);
        }
      }
    };
  }

  emit(event: string, payload: unknown): void {
    const handlers = this.handlers.get(event);
    if (!handlers) return;

    // Clone handlers to avoid issues if handlers modify the set
    const handlersCopy = Array.from(handlers);

    // Use setImmediate for async behavior in Node.js
    setImmediate(() => {
      for (const handler of handlersCopy) {
        try {
          handler(payload);
        } catch (error) {
          console.error(`Error in event handler for '${event}':`, error);
        }
      }
    });
  }

  off(event: string): void {
    this.handlers.delete(event);
  }
}
