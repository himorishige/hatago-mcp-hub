/**
 * Tests for SessionManager
 */

import { SessionManager } from '@hatago/runtime';
import { beforeEach, describe, expect, it } from 'vitest';

describe('SessionManager', () => {
  let sessionManager: SessionManager;

  beforeEach(() => {
    sessionManager = new SessionManager(3600);
  });

  it('should create a session', async () => {
    const session = await sessionManager.createSession('test-1');
    expect(session).toBeDefined();
    expect(session.id).toBe('test-1');
  });

  it('should get an existing session', async () => {
    const created = await sessionManager.createSession('test-2');
    const retrieved = await sessionManager.getSession('test-2');
    expect(retrieved).toBeDefined();
    expect(retrieved?.id).toBe(created.id);
  });

  it('should return undefined for non-existent session', async () => {
    const session = await sessionManager.getSession('non-existent');
    expect(session).toBeUndefined();
  });

  it('should delete a session', async () => {
    await sessionManager.createSession('test-3');
    await sessionManager.deleteSession('test-3');
    const retrieved = await sessionManager.getSession('test-3');
    expect(retrieved).toBeUndefined();
  });

  it('should return existing session when creating duplicate', async () => {
    const first = await sessionManager.createSession('test-4');
    const second = await sessionManager.createSession('test-4');

    // Should return the same session
    expect(second.id).toBe(first.id);
    expect(second.createdAt).toEqual(first.createdAt);
  });

  it('should handle sequential operations', async () => {
    const sessionId = 'test-5';

    await sessionManager.createSession(sessionId);
    const session1 = await sessionManager.getSession(sessionId);
    expect(session1).toBeDefined();

    await sessionManager.deleteSession(sessionId);
    const session2 = await sessionManager.getSession(sessionId);
    expect(session2).toBeUndefined();

    await sessionManager.createSession(sessionId);
    const session3 = await sessionManager.getSession(sessionId);
    expect(session3).toBeDefined();
  });
});
