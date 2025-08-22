import { createKeyedMutex } from '../utils/mutex.js';

/**
 * セッション管理
 */
export interface Session {
  id: string;
  createdAt: Date;
  lastAccessedAt: Date;
  ttlSeconds: number;
}

export class SessionManager {
  private sessions = new Map<string, Session>();
  private cleanupInterval: NodeJS.Timeout | undefined;
  private sessionMutex = createKeyedMutex<string>();

  constructor(private ttlSeconds = 3600) {
    // 定期的にセッションをクリーンアップ
    this.startCleanup();
  }

  /**
   * セッションを作成
   */
  async createSession(id: string): Promise<Session> {
    return this.sessionMutex.runExclusive(id, () => {
      const session: Session = {
        id,
        createdAt: new Date(),
        lastAccessedAt: new Date(),
        ttlSeconds: this.ttlSeconds,
      };
      this.sessions.set(id, session);
      return session;
    });
  }

  /**
   * セッションを取得
   */
  async getSession(id: string): Promise<Session | undefined> {
    return this.sessionMutex.runExclusive(id, () => {
      const session = this.sessions.get(id);
      if (!session) {
        return undefined;
      }

      // セッションの有効期限をチェック
      if (this.isExpired(session)) {
        this.sessions.delete(id);
        return undefined;
      }

      // 最終アクセス時刻を更新
      session.lastAccessedAt = new Date();
      return session;
    });
  }

  /**
   * セッションを削除
   */
  async deleteSession(id: string): Promise<void> {
    return this.sessionMutex.runExclusive(id, () => {
      this.sessions.delete(id);
    });
  }

  /**
   * セッションが期限切れか確認
   */
  private isExpired(session: Session): boolean {
    const now = Date.now();
    const lastAccessed = session.lastAccessedAt.getTime();
    const ttlMs = session.ttlSeconds * 1000;
    return now - lastAccessed > ttlMs;
  }

  /**
   * 定期クリーンアップを開始
   */
  private startCleanup(): void {
    // 1分ごとに期限切れセッションをクリーンアップ
    this.cleanupInterval = setInterval(() => {
      this.cleanup();
    }, 60000);
  }

  /**
   * 期限切れセッションをクリーンアップ
   */
  private cleanup(): void {
    for (const [id, session] of this.sessions.entries()) {
      if (this.isExpired(session)) {
        this.sessions.delete(id);
      }
    }
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
   * Get active session count
   */
  getActiveSessionCount(): number {
    // Clean up expired sessions first
    this.cleanup();
    return this.sessions.size;
  }

  /**
   * Clear all sessions
   */
  clear(): void {
    this.sessions.clear();
  }
}
