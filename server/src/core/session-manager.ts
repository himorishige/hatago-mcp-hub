import { createKeyedMutex } from '../utils/mutex.js';
import {
  clearSessions,
  createSession,
  createSessionState,
  deleteSession,
  getActiveSessionCount,
  getSession,
  removeExpired,
  type SessionState,
  touchSession,
} from './session-operations.js';
import type { Session } from './types.js';

/**
 * Session management
 */

export class SessionManager {
  private state: SessionState;
  private cleanupInterval: NodeJS.Timeout | undefined;
  private sessionMutex = createKeyedMutex<string>();

  constructor(ttlSeconds = 3600) {
    this.state = createSessionState(ttlSeconds);
    // Periodically cleanup sessions
    this.startCleanup();
  }

  /**
   * Create a session
   */
  async createSession(id: string): Promise<Session> {
    return this.sessionMutex.runExclusive(id, () => {
      const oldState = this.state;
      this.state = createSession(this.state, id);

      // Get the session from the new state
      const session = this.state.sessions.get(id);
      if (!session) {
        // Fallback to old behavior if something went wrong
        this.state = oldState;
        throw new Error('Failed to create session');
      }

      return session;
    });
  }

  /**
   * セッションを取得
   */
  async getSession(id: string): Promise<Session | undefined> {
    return this.sessionMutex.runExclusive(id, () => {
      const session = getSession(this.state, id);

      // Touch the session if it exists
      if (session) {
        this.state = touchSession(this.state, id);
      }

      return session;
    });
  }

  /**
   * セッションを削除
   */
  async deleteSession(id: string): Promise<void> {
    return this.sessionMutex.runExclusive(id, () => {
      this.state = deleteSession(this.state, id);
    });
  }

  /**
   * 定期クリーンアップを開始
   */
  private startCleanup(): void {
    this.cleanupInterval = setInterval(() => {
      this.cleanup();
    }, 60000); // 1分ごと
  }

  /**
   * 期限切れセッションをクリーンアップ
   */
  private cleanup(): void {
    this.state = removeExpired(this.state);
  }

  /**
   * アクティブなセッション数を取得
   */
  getActiveSessionCount(): number {
    return getActiveSessionCount(this.state);
  }

  /**
   * クリーンアップを停止
   */
  stop(): void {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = undefined;
    }
  }

  /**
   * すべてのセッションをクリア
   */
  clear(): void {
    this.state = clearSessions(this.state);
  }
}
