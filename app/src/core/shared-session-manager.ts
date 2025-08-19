import { EventEmitter } from 'node:events';
import type { SessionSharingConfig } from '../config/types.js';
import { getRuntime } from '../runtime/types.js';
import type {
  SharedSession,
  ToolCallHistory,
} from '../stores/session-store.js';

/**
 * クライアント情報
 */
export interface ClientInfo {
  id: string;
  sessionId: string;
  connectedAt: Date;
  lastActivityAt: Date;
  userAgent?: string;
  metadata?: Record<string, unknown>;
}

/**
 * セッション共有イベント
 */
export interface SessionEvent {
  type: 'client-joined' | 'client-left' | 'tool-executed' | 'state-changed';
  sessionId: string;
  clientId?: string;
  data?: unknown;
  timestamp: Date;
}

/**
 * 共有セッション管理クラス
 * 複数のクライアント間でセッションを共有し、状態を同期する
 */
export class SharedSessionManager extends EventEmitter {
  private store: SessionStore;
  private clients = new Map<string, ClientInfo>();
  private sessionToClients = new Map<string, Set<string>>();
  private config: SessionSharingConfig;
  private cleanupInterval: NodeJS.Timeout | null = null;
  private runtime = getRuntime();

  constructor(config: SessionSharingConfig, store?: SessionStore) {
    super();
    this.config = config;
    this.store = store || new InMemorySessionStore();

    // クリーンアップタスクを開始
    if (config.enabled) {
      this.startCleanup();
    }
  }

  /**
   * 新しいセッションを作成
   */
  async createSession(
    clientId: string,
    metadata?: Record<string, unknown>,
  ): Promise<SharedSession> {
    const runtime = await this.runtime;
    const sessionId = await runtime.idGenerator.generate();

    const session: SharedSession = {
      id: sessionId,
      createdAt: new Date(),
      lastAccessedAt: new Date(),
      state: {},
      clients: new Set([clientId]),
      history: [],
      locks: new Map(),
      version: 1,
    };

    await this.store.set(sessionId, session);

    // クライアント情報を登録
    await this.connectClient(sessionId, clientId, metadata);

    this.emitEvent({
      type: 'client-joined',
      sessionId,
      clientId,
      timestamp: new Date(),
    });

    return session;
  }

  /**
   * クライアントをセッションに接続
   */
  async connectClient(
    sessionId: string,
    clientId: string,
    metadata?: Record<string, unknown>,
  ): Promise<void> {
    const session = await this.store.get(sessionId);
    if (!session) {
      throw new Error(`Session ${sessionId} not found`);
    }

    // 最大クライアント数チェック
    if (session.clients.size >= this.config.maxClientsPerSession) {
      throw new Error(`Session ${sessionId} has reached maximum client limit`);
    }

    // クライアント情報を作成
    const clientInfo: ClientInfo = {
      id: clientId,
      sessionId,
      connectedAt: new Date(),
      lastActivityAt: new Date(),
      metadata,
    };

    this.clients.set(clientId, clientInfo);

    // セッションにクライアントを追加
    session.clients.add(clientId);
    session.version++;
    await this.store.set(sessionId, session);

    // マッピングを更新
    if (!this.sessionToClients.has(sessionId)) {
      this.sessionToClients.set(sessionId, new Set());
    }
    this.sessionToClients.get(sessionId)?.add(clientId);

    this.emitEvent({
      type: 'client-joined',
      sessionId,
      clientId,
      timestamp: new Date(),
    });
  }

  /**
   * クライアントをセッションから切断
   */
  async disconnectClient(clientId: string): Promise<void> {
    const clientInfo = this.clients.get(clientId);
    if (!clientInfo) {
      return;
    }

    const session = await this.store.get(clientInfo.sessionId);
    if (session) {
      session.clients.delete(clientId);
      session.version++;
      await this.store.set(clientInfo.sessionId, session);
    }

    // マッピングを更新
    this.sessionToClients.get(clientInfo.sessionId)?.delete(clientId);
    if (this.sessionToClients.get(clientInfo.sessionId)?.size === 0) {
      this.sessionToClients.delete(clientInfo.sessionId);
    }

    this.clients.delete(clientId);

    this.emitEvent({
      type: 'client-left',
      sessionId: clientInfo.sessionId,
      clientId,
      timestamp: new Date(),
    });
  }

  /**
   * セッション共有トークンを生成
   */
  async generateShareToken(
    sessionId: string,
    _clientId: string,
  ): Promise<string> {
    const session = await this.store.get(sessionId);
    if (!session) {
      throw new Error(`Session ${sessionId} not found`);
    }

    // トークンを生成（実際の実装では署名付きJWTなどを使用）
    const runtime = await this.runtime;
    const token = await runtime.idGenerator.generate(32);
    session.sharedToken = token;
    session.version++;
    await this.store.set(sessionId, session);

    return token;
  }

  /**
   * トークンを使ってセッションに参加
   */
  async joinSessionByToken(
    token: string,
    clientId: string,
    metadata?: Record<string, unknown>,
  ): Promise<SharedSession> {
    // トークンからセッションを検索（実際の実装では検証も行う）
    const sessions = await this.store.list();
    const session = sessions.find((s) => s.sharedToken === token);

    if (!session) {
      throw new Error('Invalid or expired token');
    }

    await this.connectClient(session.id, clientId, metadata);
    return session;
  }

  /**
   * ツール実行を記録
   */
  async recordToolExecution(
    sessionId: string,
    clientId: string,
    tool: string,
    args: unknown,
    result?: unknown,
    error?: string,
  ): Promise<void> {
    const session = await this.store.get(sessionId);
    if (!session) {
      throw new Error(`Session ${sessionId} not found`);
    }

    const runtime = await this.runtime;
    const id = await runtime.idGenerator.generate();

    const entry: ToolCallHistory = {
      id,
      timestamp: new Date(),
      clientId,
      tool,
      args,
      result,
      error,
    };

    session.history.push(entry);
    session.version++;
    await this.store.set(sessionId, session);

    // クライアントのアクティビティを更新
    const clientInfo = this.clients.get(clientId);
    if (clientInfo) {
      clientInfo.lastActivityAt = new Date();
    }

    this.emitEvent({
      type: 'tool-executed',
      sessionId,
      clientId,
      data: { tool, args },
      timestamp: new Date(),
    });
  }

  /**
   * 排他制御用のロックを取得
   */
  async acquireLock(
    sessionId: string,
    clientId: string,
    resourceId: string,
    ttlMs = 30000,
  ): Promise<boolean> {
    const session = await this.store.get(sessionId);
    if (!session) {
      throw new Error(`Session ${sessionId} not found`);
    }

    const existingLock = session.locks.get(resourceId);
    if (existingLock && existingLock !== clientId) {
      return false; // 他のクライアントがロック中
    }

    session.locks.set(resourceId, clientId);
    session.version++;
    await this.store.set(sessionId, session);

    // TTL後に自動解放
    const runtime = await this.runtime;
    runtime.setTimeout(() => {
      this.releaseLock(sessionId, clientId, resourceId);
    }, ttlMs);

    return true;
  }

  /**
   * ロックを解放
   */
  async releaseLock(
    sessionId: string,
    clientId: string,
    resourceId: string,
  ): Promise<void> {
    const session = await this.store.get(sessionId);
    if (!session) {
      return;
    }

    if (session.locks.get(resourceId) === clientId) {
      session.locks.delete(resourceId);
      session.version++;
      await this.store.set(sessionId, session);
    }
  }

  /**
   * セッションを取得
   */
  async getSession(sessionId: string): Promise<SharedSession | null> {
    return this.store.get(sessionId);
  }

  /**
   * セッション履歴を取得
   */
  async getSessionHistory(
    sessionId: string,
    limit = 100,
  ): Promise<ToolCallHistory[]> {
    const session = await this.store.get(sessionId);
    return session?.history.slice(-limit) || [];
  }

  /**
   * セッションのクライアント一覧を取得
   */
  getSessionClients(sessionId: string): ClientInfo[] {
    const clientIds = this.sessionToClients.get(sessionId);
    if (!clientIds) {
      return [];
    }

    const clients: ClientInfo[] = [];
    for (const clientId of clientIds) {
      const info = this.clients.get(clientId);
      if (info) {
        clients.push(info);
      }
    }
    return clients;
  }

  /**
   * アクティブなセッション一覧を取得
   */
  async getActiveSessions(): Promise<
    Array<{ session: SharedSession; clients: ClientInfo[] }>
  > {
    const sessions = await this.store.list();
    const active = [];

    for (const session of sessions) {
      const clients = this.getSessionClients(session.id);
      if (clients.length > 0) {
        active.push({ session, clients });
      }
    }

    return active;
  }

  /**
   * 統計情報を取得
   */
  getStats(): {
    totalSessions: number;
    totalClients: number;
    sharedSessions: number;
    averageClientsPerSession: number;
  } {
    const totalClients = this.clients.size;
    const sessionCount = this.sessionToClients.size;
    const sharedSessions = Array.from(this.sessionToClients.values()).filter(
      (clients) => clients.size > 1,
    ).length;

    return {
      totalSessions: sessionCount,
      totalClients,
      sharedSessions,
      averageClientsPerSession:
        sessionCount > 0 ? totalClients / sessionCount : 0,
    };
  }

  /**
   * イベントを発行
   */
  private emitEvent(event: SessionEvent): void {
    this.emit('session:event', event);
    this.emit(`session:${event.type}`, event);
  }

  /**
   * クリーンアップタスクを開始
   */
  private startCleanup(): void {
    const _runtime = this.runtime.then((r) => {
      this.cleanupInterval = r.setInterval(() => {
        this.cleanup();
      }, 60000) as NodeJS.Timeout; // 1分ごと
    });
  }

  /**
   * 期限切れセッションをクリーンアップ
   */
  private async cleanup(): Promise<void> {
    const sessions = await this.store.list();
    const now = Date.now();

    for (const session of sessions) {
      const age = now - session.lastAccessedAt.getTime();
      if (age > this.config.tokenTtlSeconds * 1000) {
        // セッションを削除
        await this.store.delete(session.id);

        // 関連するクライアントを切断
        for (const clientId of session.clients) {
          await this.disconnectClient(clientId);
        }
      }
    }
  }

  /**
   * シャットダウン
   */
  async shutdown(): Promise<void> {
    if (this.cleanupInterval) {
      const runtime = await this.runtime;
      runtime.clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
    }

    // すべてのクライアントを切断
    for (const clientId of this.clients.keys()) {
      await this.disconnectClient(clientId);
    }

    // ストアをクリア
    await this.store.clear();

    this.removeAllListeners();
  }
}
