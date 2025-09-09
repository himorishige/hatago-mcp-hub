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

// New typed emitter (per-event payload typing) — internal type only [SF][DM]
export type TypedEmitter<TEvents extends Record<string, unknown>> = {
  on<K extends keyof TEvents & string>(event: K, handler: (data: TEvents[K]) => void): void;
  off<K extends keyof TEvents & string>(event: K, handler: (data: TEvents[K]) => void): void;
  emit<K extends keyof TEvents & string>(event: K, data: TEvents[K]): void;
};

export function createTypedEmitter<TEvents extends Record<string, unknown>>(
  logger?: Logger
): TypedEmitter<TEvents> {
  // Reuse the simple implementation; typing is enforced at the boundary only. [CA]
  const handlers = new Map<string, Set<(data: unknown) => void>>();

  function on(event: string, handler: (data: unknown) => void): void {
    let set = handlers.get(event);
    if (!set) {
      set = new Set<(data: unknown) => void>();
      handlers.set(event, set);
    }
    set.add(handler);
  }

  function off(event: string, handler: (data: unknown) => void): void {
    handlers.get(event)?.delete(handler);
  }

  function emit(event: string, data: unknown): void {
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

  return {
    on: on as TypedEmitter<TEvents>['on'],
    off: off as TypedEmitter<TEvents>['off'],
    emit: emit as TypedEmitter<TEvents>['emit']
  };
}
