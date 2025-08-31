/**
 * Functional session operations
 * Pure functions for session management
 */

import type { Session } from '@himorishige/hatago-core';

/**
 * Immutable session store type
 */
export interface SessionState {
  readonly sessions: ReadonlyMap<string, Session>;
  readonly ttlSeconds: number;
}

/**
 * Create an empty session state
 */
export function createSessionState(ttlSeconds = 3600): SessionState {
  return {
    sessions: new Map(),
    ttlSeconds
  };
}

/**
 * Create or update a session
 */
export function createSession(
  state: SessionState,
  id: string,
  now: Date = new Date()
): SessionState {
  const existing = state.sessions.get(id);

  // If exists and not expired, update lastAccessedAt
  if (existing && !isExpired(existing, now)) {
    const updatedSession: Session = {
      ...existing,
      lastAccessedAt: now
    };

    const newSessions = new Map(state.sessions);
    newSessions.set(id, updatedSession);

    return {
      ...state,
      sessions: newSessions
    };
  }

  // Create new session
  const newSession: Session = {
    id,
    createdAt: now,
    lastAccessedAt: now,
    ttlSeconds: state.ttlSeconds
  };

  const newSessions = new Map(state.sessions);
  newSessions.set(id, newSession);

  return {
    ...state,
    sessions: newSessions
  };
}

/**
 * Get a session by ID
 */
export function getSession(
  state: SessionState,
  id: string,
  now: Date = new Date()
): Session | undefined {
  const session = state.sessions.get(id);

  if (!session) {
    return undefined;
  }

  // Check expiration
  if (isExpired(session, now)) {
    return undefined;
  }

  return session;
}

/**
 * Touch a session (update lastAccessedAt)
 */
export function touchSession(
  state: SessionState,
  id: string,
  now: Date = new Date()
): SessionState {
  const session = state.sessions.get(id);

  if (!session || isExpired(session, now)) {
    return state; // No change if session doesn't exist or is expired
  }

  const updatedSession: Session = {
    ...session,
    lastAccessedAt: now
  };

  const newSessions = new Map(state.sessions);
  newSessions.set(id, updatedSession);

  return {
    ...state,
    sessions: newSessions
  };
}

/**
 * Delete a session
 */
export function deleteSession(state: SessionState, id: string): SessionState {
  if (!state.sessions.has(id)) {
    return state; // No change if session doesn't exist
  }

  const newSessions = new Map(state.sessions);
  newSessions.delete(id);

  return {
    ...state,
    sessions: newSessions
  };
}

/**
 * Remove all expired sessions
 */
export function removeExpired(state: SessionState, now: Date = new Date()): SessionState {
  const activeSessions = new Map<string, Session>();

  for (const [id, session] of state.sessions) {
    if (!isExpired(session, now)) {
      activeSessions.set(id, session);
    }
  }

  // No change if no sessions were removed
  if (activeSessions.size === state.sessions.size) {
    return state;
  }

  return {
    ...state,
    sessions: activeSessions
  };
}

/**
 * Check if a session is expired
 */
export function isExpired(session: Session, now: Date = new Date()): boolean {
  const ttlMs = session.ttlSeconds * 1000;
  const expirationTime = session.lastAccessedAt.getTime() + ttlMs;
  return now.getTime() > expirationTime;
}

/**
 * Get all active sessions
 */
export function getActiveSessions(state: SessionState, now: Date = new Date()): Session[] {
  const active: Session[] = [];

  for (const session of state.sessions.values()) {
    if (!isExpired(session, now)) {
      active.push(session);
    }
  }

  return active;
}

/**
 * Get active session count
 */
export function getActiveSessionCount(state: SessionState, now: Date = new Date()): number {
  let count = 0;

  for (const session of state.sessions.values()) {
    if (!isExpired(session, now)) {
      count++;
    }
  }

  return count;
}

/**
 * Clear all sessions
 */
export function clearSessions(state: SessionState): SessionState {
  return {
    ...state,
    sessions: new Map()
  };
}

/**
 * Batch operations for efficiency
 */
export interface SessionOperation {
  type: 'create' | 'touch' | 'delete';
  sessionId: string;
}

/**
 * Apply multiple operations in a single pass
 */
export function applyOperations(
  state: SessionState,
  operations: SessionOperation[],
  now: Date = new Date()
): SessionState {
  let currentState = state;

  for (const op of operations) {
    switch (op.type) {
      case 'create':
        currentState = createSession(currentState, op.sessionId, now);
        break;
      case 'touch':
        currentState = touchSession(currentState, op.sessionId, now);
        break;
      case 'delete':
        currentState = deleteSession(currentState, op.sessionId);
        break;
    }
  }

  return currentState;
}

/**
 * Session statistics
 */
export interface SessionStats {
  total: number;
  active: number;
  expired: number;
  averageAgeSeconds: number;
}

/**
 * Get session statistics
 */
export function getStats(state: SessionState, now: Date = new Date()): SessionStats {
  let active = 0;
  let expired = 0;
  let totalAgeMs = 0;

  for (const session of state.sessions.values()) {
    if (isExpired(session, now)) {
      expired++;
    } else {
      active++;
      totalAgeMs += now.getTime() - session.createdAt.getTime();
    }
  }

  return {
    total: state.sessions.size,
    active,
    expired,
    averageAgeSeconds: active > 0 ? totalAgeMs / active / 1000 : 0
  };
}
