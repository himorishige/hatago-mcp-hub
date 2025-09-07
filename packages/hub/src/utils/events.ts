import type { Logger } from '../logger.js';

export type EventEmitter<E extends string, D> = {
  on: (event: E, handler: (data: D) => void) => void;
  off: (event: E, handler: (data: D) => void) => void;
  emit: (event: E, data: D) => void;
};

export function createEventEmitter<E extends string, D = unknown>(
  logger?: Logger
): EventEmitter<E, D> {
  const handlers = new Map<E, Set<(data: D) => void>>();

  function on(event: E, handler: (data: D) => void): void {
    let set = handlers.get(event);
    if (!set) {
      set = new Set<(data: D) => void>();
      handlers.set(event, set);
    }
    set.add(handler);
  }

  function off(event: E, handler: (data: D) => void): void {
    handlers.get(event)?.delete(handler);
  }

  function emit(event: E, data: D): void {
    const set = handlers.get(event);
    if (!set) return;
    for (const h of set) {
      try {
        h(data);
      } catch (error) {
        logger?.error?.(`Error in event handler for ${String(event)}`, {
          error: error instanceof Error ? error.message : String(error)
        });
      }
    }
  }

  return { on, off, emit };
}
