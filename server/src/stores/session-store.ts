import { getRuntime } from '../runtime/runtime-factory.js';
import { createKeyedMutex } from '../utils/mutex.js';

/**
 * ツール実行履歴
 */
export interface ToolCallHistory {
  id: string;
  timestamp: Date;
  clientId: string;
  tool: string;
  arguments: unknown;
  result?: unknown;
  error?: string;
}

/**
 * セッション状態
 */
export interface SessionState {
  id: string;
  createdAt: Date;
  lastAccessedAt: Date;
  ttlSeconds: number;
  generationId?: string; // 設定世代ID
  metadata: Record<string, unknown>;
}

/**
 * 共有セッション
 */
export interface SharedSession extends SessionState {
  sharedToken?: string; // 共有用トークン
  tokenExpiresAt?: Date; // トークン有効期限
  clients: Set<string>; // 接続中のクライアントID
  history: ToolCallHistory[]; // 実行履歴
  locks: Map<string, string>; // リソースロック (resource -> clientId)
  version: number; // 楽観的ロック用バージョン
}

/**
 * セッションストアのインターフェース
 */
export interface ISessionStore {
  // 基本操作
  create(session: SessionState): Promise<void>;
  get(id: string): Promise<SharedSession | null>;
  update(id: string, session: Partial<SharedSession>): Promise<void>;
  delete(id: string): Promise<void>;
  exists(id: string): Promise<boolean>;

  // 共有機能
  generateShareToken(sessionId: string, ttlSeconds: number): Promise<string>;
  getByShareToken(token: string): Promise<SharedSession | null>;
  addClient(sessionId: string, clientId: string): Promise<void>;
  removeClient(sessionId: string, clientId: string): Promise<void>;

  // 履歴管理
  addHistory(sessionId: string, history: ToolCallHistory): Promise<void>;
  getHistory(sessionId: string, limit?: number): Promise<ToolCallHistory[]>;

  // ロック管理
  acquireLock(
    sessionId: string,
    resource: string,
    clientId: string,
  ): Promise<boolean>;
  releaseLock(
    sessionId: string,
    resource: string,
    clientId: string,
  ): Promise<void>;

  // ユーティリティ
  cleanup(): Promise<void>;
  getActiveSessions(): Promise<SharedSession[]>;
}

/**
 * メモリベースのセッションストア（開発用）
 */
export class MemorySessionStore implements ISessionStore {
  private sessions = new Map<string, SharedSession>();
  private tokenToSession = new Map<string, string>();
  private maxHistoryPerSession = 1000;
  private sessionMutex = createKeyedMutex<string>();

  async create(session: SessionState): Promise<void> {
    return this.sessionMutex.runExclusive(session.id, () => {
      const sharedSession: SharedSession = {
        ...session,
        clients: new Set(),
        history: [],
        locks: new Map(),
        version: 1,
      };
      this.sessions.set(session.id, sharedSession);
    });
  }

  async get(id: string): Promise<SharedSession | null> {
    return this.sessionMutex.runExclusive(id, () => {
      const session = this.sessions.get(id);
      if (!session) {
        return null;
      }

      // TTLチェック
      if (this.isExpired(session)) {
        this.sessions.delete(id);
        return null;
      }

      // 最終アクセス時刻を更新
      session.lastAccessedAt = new Date();
      return session;
    });
  }

  async update(id: string, updates: Partial<SharedSession>): Promise<void> {
    return this.sessionMutex.runExclusive(id, async () => {
      const session = this.sessions.get(id);
      if (!session) {
        throw new Error(`Session ${id} not found`);
      }

      // バージョンチェック（楽観的ロック）
      if (updates.version && updates.version !== session.version) {
        throw new Error(`Version conflict for session ${id}`);
      }

      // 更新を適用
      Object.assign(session, updates);
      session.version++;
      session.lastAccessedAt = new Date();
    });
  }

  async delete(id: string): Promise<void> {
    return this.sessionMutex.runExclusive(id, () => {
      const session = this.sessions.get(id);
      if (session?.sharedToken) {
        this.tokenToSession.delete(session.sharedToken);
      }
      this.sessions.delete(id);
    });
  }

  async exists(id: string): Promise<boolean> {
    return this.sessions.has(id);
  }

  async generateShareToken(
    sessionId: string,
    ttlSeconds: number,
  ): Promise<string> {
    const session = await this.get(sessionId);
    if (!session) {
      throw new Error(`Session ${sessionId} not found`);
    }

    // 既存のトークンを削除
    if (session.sharedToken) {
      this.tokenToSession.delete(session.sharedToken);
    }

    // 新しいトークンを生成
    const runtime = await getRuntime();
    const token = await runtime.idGenerator.generate();
    session.sharedToken = token;
    session.tokenExpiresAt = new Date(Date.now() + ttlSeconds * 1000);
    this.tokenToSession.set(token, sessionId);

    return token;
  }

  async getByShareToken(token: string): Promise<SharedSession | null> {
    const sessionId = this.tokenToSession.get(token);
    if (!sessionId) {
      return null;
    }

    const session = await this.get(sessionId);
    if (!session) {
      this.tokenToSession.delete(token);
      return null;
    }

    // トークン有効期限チェック
    if (
      session.tokenExpiresAt &&
      session.tokenExpiresAt.getTime() < Date.now()
    ) {
      this.tokenToSession.delete(token);
      session.sharedToken = undefined;
      session.tokenExpiresAt = undefined;
      return null;
    }

    return session;
  }

  async addClient(sessionId: string, clientId: string): Promise<void> {
    const session = await this.get(sessionId);
    if (!session) {
      throw new Error(`Session ${sessionId} not found`);
    }
    session.clients.add(clientId);
  }

  async removeClient(sessionId: string, clientId: string): Promise<void> {
    const session = await this.get(sessionId);
    if (!session) {
      return;
    }
    session.clients.delete(clientId);

    // クライアントが保持していたロックを解放
    for (const [resource, holder] of session.locks.entries()) {
      if (holder === clientId) {
        session.locks.delete(resource);
      }
    }
  }

  async addHistory(sessionId: string, history: ToolCallHistory): Promise<void> {
    const session = await this.get(sessionId);
    if (!session) {
      throw new Error(`Session ${sessionId} not found`);
    }

    session.history.push(history);

    // 履歴の最大数を制限
    if (session.history.length > this.maxHistoryPerSession) {
      session.history = session.history.slice(-this.maxHistoryPerSession);
    }
  }

  async getHistory(
    sessionId: string,
    limit?: number,
  ): Promise<ToolCallHistory[]> {
    const session = await this.get(sessionId);
    if (!session) {
      return [];
    }

    if (limit) {
      return session.history.slice(-limit);
    }
    return session.history;
  }

  async acquireLock(
    sessionId: string,
    resource: string,
    clientId: string,
  ): Promise<boolean> {
    const session = await this.get(sessionId);
    if (!session) {
      throw new Error(`Session ${sessionId} not found`);
    }

    // ロックが既に取得されている場合
    const currentHolder = session.locks.get(resource);
    if (currentHolder && currentHolder !== clientId) {
      return false;
    }

    session.locks.set(resource, clientId);
    return true;
  }

  async releaseLock(
    sessionId: string,
    resource: string,
    clientId: string,
  ): Promise<void> {
    const session = await this.get(sessionId);
    if (!session) {
      return;
    }

    const currentHolder = session.locks.get(resource);
    if (currentHolder === clientId) {
      session.locks.delete(resource);
    }
  }

  async cleanup(): Promise<void> {
    const now = Date.now();
    const sessionsToDelete: string[] = [];

    for (const [id, session] of this.sessions.entries()) {
      if (this.isExpired(session)) {
        sessionsToDelete.push(id);
      }

      // 期限切れトークンのクリーンアップ
      if (session.tokenExpiresAt && session.tokenExpiresAt.getTime() < now) {
        if (session.sharedToken) {
          this.tokenToSession.delete(session.sharedToken);
        }
        session.sharedToken = undefined;
        session.tokenExpiresAt = undefined;
      }
    }

    // 期限切れセッションを削除
    for (const id of sessionsToDelete) {
      await this.delete(id);
    }
  }

  async getActiveSessions(): Promise<SharedSession[]> {
    const active: SharedSession[] = [];
    for (const session of this.sessions.values()) {
      if (!this.isExpired(session)) {
        active.push(session);
      }
    }
    return active;
  }

  private isExpired(session: SessionState): boolean {
    const now = Date.now();
    const lastAccessed = session.lastAccessedAt.getTime();
    const ttlMs = session.ttlSeconds * 1000;
    return now - lastAccessed > ttlMs;
  }
}
