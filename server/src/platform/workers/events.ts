/**
 * Cloudflare Workers EventBus implementation
 */
import type { EventBus } from '../types.js';

/**
 * Simple event bus for Workers environment
 */
export class WorkersEventBus implements EventBus {
  private listeners = new Map<string, Set<(payload: unknown) => void>>();

  emit(event: string, payload: unknown): void {
    const handlers = this.listeners.get(event);
    if (handlers) {
      handlers.forEach((handler) => {
        try {
          handler(payload);
        } catch (error) {
          console.error(`Error in event handler for ${event}:`, error);
        }
      });
    }
  }

  on(event: string, handler: (payload: unknown) => void): () => void {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, new Set());
    }

    this.listeners.get(event)?.add(handler);

    // Return unsubscribe function
    return () => {
      const handlers = this.listeners.get(event);
      if (handlers) {
        handlers.delete(handler);
        if (handlers.size === 0) {
          this.listeners.delete(event);
        }
      }
    };
  }

  off(event: string, handler?: (payload: unknown) => void): void {
    if (!handler) {
      // Remove all handlers for this event
      this.listeners.delete(event);
    } else {
      // Remove specific handler
      const handlers = this.listeners.get(event);
      if (handlers) {
        handlers.delete(handler);
        if (handlers.size === 0) {
          this.listeners.delete(event);
        }
      }
    }
  }

  once(event: string, handler: (payload: unknown) => void): () => void {
    const wrappedHandler = (payload: unknown) => {
      handler(payload);
      this.off(event, wrappedHandler);
    };

    return this.on(event, wrappedHandler);
  }
}
