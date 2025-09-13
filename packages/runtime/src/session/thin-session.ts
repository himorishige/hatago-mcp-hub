/**
 * Thin session management - functional implementation
 *
 * Following Hatago philosophy: "Don't add, remove"
 * Simple Map-based session storage without complex state management
 */

import type { Session } from '@himorishige/hatago-core';

/**
 * Simple session store using Map
 * No complex state management, just a Map with TTL
 */
export type ThinSessionStore = {
  sessions: Map<string, Session>;
  ttlSeconds: number;
};

/**
 * Create a thin session store
 */
export function createThinSessionStore(ttlSeconds = 3600): ThinSessionStore {
  return {
    sessions: new Map(),
    ttlSeconds
  };
}

/**
 * Create or get a session (pure function)
 * Returns new store state and session
 */
export function createOrGetSession(
  store: ThinSessionStore,
  id: string
): { store: ThinSessionStore; session: Session } {
  const now = Date.now();

  // Check existing session
  const existing = store.sessions.get(id);
  if (existing) {
    const expiresAt = existing.lastAccessedAt.getTime() + existing.ttlSeconds * 1000;
    if (expiresAt > now) {
      // Touch existing session
      const updatedSession: Session = {
        ...existing,
        lastAccessedAt: new Date(now)
      };

      const newSessions = new Map(store.sessions);
      newSessions.set(id, updatedSession);

      return {
        store: { ...store, sessions: newSessions },
        session: updatedSession
      };
    }
  }

  // Create new session
  const newSession: Session = {
    id,
    createdAt: new Date(now),
    lastAccessedAt: new Date(now),
    ttlSeconds: store.ttlSeconds
  };

  const newSessions = new Map(store.sessions);
  newSessions.set(id, newSession);

  return {
    store: { ...store, sessions: newSessions },
    session: newSession
  };
}

/**
 * Get a session if it exists and is not expired
 */
export function getSession(store: ThinSessionStore, id: string): Session | undefined {
  const session = store.sessions.get(id);
  if (!session) return undefined;

  const now = Date.now();
  const expiresAt = session.lastAccessedAt.getTime() + session.ttlSeconds * 1000;
  if (expiresAt <= now) {
    return undefined;
  }

  return session;
}

/**
 * Delete a session
 */
export function deleteSession(store: ThinSessionStore, id: string): ThinSessionStore {
  if (!store.sessions.has(id)) {
    return store;
  }

  const newSessions = new Map(store.sessions);
  newSessions.delete(id);

  return { ...store, sessions: newSessions };
}

/**
 * Remove expired sessions
 */
export function removeExpiredSessions(store: ThinSessionStore): ThinSessionStore {
  const now = Date.now();
  const newSessions = new Map<string, Session>();

  for (const [id, session] of store.sessions) {
    const expiresAt = session.lastAccessedAt.getTime() + session.ttlSeconds * 1000;
    if (expiresAt > now) {
      newSessions.set(id, session);
    }
  }

  // Return same store if nothing changed
  if (newSessions.size === store.sessions.size) {
    return store;
  }

  return { ...store, sessions: newSessions };
}

/**
 * Get active session count
 */
export function getActiveSessionCount(store: ThinSessionStore): number {
  const now = Date.now();
  let count = 0;

  for (const session of store.sessions.values()) {
    const expiresAt = session.lastAccessedAt.getTime() + session.ttlSeconds * 1000;
    if (expiresAt > now) {
      count++;
    }
  }

  return count;
}

/**
 * List all active sessions
 */
export function listActiveSessions(store: ThinSessionStore): Session[] {
  const now = Date.now();
  const active: Session[] = [];

  for (const session of store.sessions.values()) {
    const expiresAt = session.lastAccessedAt.getTime() + session.ttlSeconds * 1000;
    if (expiresAt > now) {
      active.push(session);
    }
  }

  return active;
}

/**
 * Clear all sessions
 */
export function clearAllSessions(store: ThinSessionStore): ThinSessionStore {
  return { ...store, sessions: new Map() };
}

/**
 * Create a session manager wrapper for compatibility
 * This provides a mutable interface while using immutable functions internally
 */
export function createThinSessionManager(ttlSeconds = 3600): {
  create: (id: string) => Session;
  get: (id: string) => Session | undefined;
  delete: (id: string) => void;
  destroy: (id: string) => void; // Alias for delete (compatibility)
  list: () => Session[];
  count: () => number;
  clear: () => void;
  stop: () => void;
} {
  let store = createThinSessionStore(ttlSeconds);

  // Cleanup timer
  const cleanupInterval = setInterval(() => {
    store = removeExpiredSessions(store);
  }, 60000); // Every minute

  return {
    create: (id: string): Session => {
      const result = createOrGetSession(store, id);
      store = result.store;
      return result.session;
    },

    get: (id: string): Session | undefined => {
      return getSession(store, id);
    },

    delete: (id: string): void => {
      store = deleteSession(store, id);
    },

    destroy: (id: string): void => {
      store = deleteSession(store, id);
    },

    list: (): Session[] => {
      return listActiveSessions(store);
    },

    count: (): number => {
      return getActiveSessionCount(store);
    },

    clear: (): void => {
      store = clearAllSessions(store);
    },

    stop: (): void => {
      clearInterval(cleanupInterval);
    }
  };
}
