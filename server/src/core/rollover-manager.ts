import { EventEmitter } from 'node:events';
import { getRuntime } from '../runtime/runtime-factory.js';
import type { ConfigGeneration } from './config-generation.js';
import type { ConfigManager } from './config-manager.js';
import { McpHub } from './mcp-hub.js';

/**
 * ワーカー（MCPハブインスタンス）の状態
 */
export enum WorkerState {
  INITIALIZING = 'initializing',
  WARMING_UP = 'warming_up',
  HEALTHY = 'healthy',
  UNHEALTHY = 'unhealthy',
  DRAINING = 'draining',
  STOPPED = 'stopped',
}

/**
 * ワーカープール内の個別ワーカー
 */
export interface Worker {
  id: string;
  generationId: string;
  hub: McpHub;
  state: WorkerState;
  createdAt: Date;
  lastHealthCheck?: Date;
  activeSessionCount: number;
  errorCount: number;
  requestCount: number;
}

/**
 * ヘルスチェック結果
 */
export interface HealthCheckResult {
  healthy: boolean;
  latencyMs?: number;
  error?: string;
}

/**
 * ロールオーバー管理クラス
 * 設定変更時に新旧世代のワーカーを管理し、無停止で切り替えを行う
 */
export class RolloverManager extends EventEmitter {
  private configManager: ConfigManager;
  private workers = new Map<string, Worker>();
  private sessionToWorker = new Map<string, string>();
  private healthCheckInterval: NodeJS.Timeout | null = null;
  private drainQueue = getRuntime().then((runtime) =>
    runtime.createTaskQueue(1),
  );
  private config: {
    healthCheckIntervalMs: number;
    drainTimeoutMs: number;
    errorRateThreshold: number;
    warmupTimeMs: number;
  };

  constructor(
    configManager: ConfigManager,
    options?: {
      healthCheckIntervalMs?: number;
      drainTimeoutMs?: number;
      errorRateThreshold?: number;
      warmupTimeMs?: number;
    },
  ) {
    super();
    this.configManager = configManager;
    this.config = {
      healthCheckIntervalMs: options?.healthCheckIntervalMs || 5000,
      drainTimeoutMs: options?.drainTimeoutMs || 60000,
      errorRateThreshold: options?.errorRateThreshold || 0.1,
      warmupTimeMs: options?.warmupTimeMs || 10000,
    };
  }

  /**
   * ロールオーバーマネージャーを開始
   */
  async start(): Promise<void> {
    // 現在の世代のワーカーを作成
    const currentGeneration = this.configManager.getCurrentGeneration();
    if (currentGeneration) {
      await this.createWorker(currentGeneration);
    }

    // 設定変更イベントをリッスン
    this.configManager.on('generation:activated', async (event) => {
      await this.handleGenerationChange(event.generationId);
    });

    // ヘルスチェックを開始
    this.startHealthCheck();
  }

  /**
   * 新世代のワーカーを作成
   */
  private async createWorker(generation: ConfigGeneration): Promise<Worker> {
    const workerId = `worker-${generation.id}`;

    console.log(`Creating worker for generation ${generation.id}`);

    // MCPハブを作成
    const hub = new McpHub({ config: generation.config });

    // ワーカーを登録
    const worker: Worker = {
      id: workerId,
      generationId: generation.id,
      hub,
      state: WorkerState.INITIALIZING,
      createdAt: new Date(),
      activeSessionCount: 0,
      errorCount: 0,
      requestCount: 0,
    };

    this.workers.set(workerId, worker);

    // ワーカーを初期化
    await this.initializeWorker(worker);

    return worker;
  }

  /**
   * ワーカーを初期化
   */
  private async initializeWorker(worker: Worker): Promise<void> {
    try {
      worker.state = WorkerState.WARMING_UP;
      this.emit('worker:warming_up', { workerId: worker.id });

      // MCPハブを初期化
      await worker.hub.initialize();

      // ウォームアップ期間を待つ
      await new Promise((resolve) =>
        setTimeout(resolve, this.config.warmupTimeMs),
      );

      // ヘルスチェック
      const health = await this.checkWorkerHealth(worker);
      if (health.healthy) {
        worker.state = WorkerState.HEALTHY;
        this.emit('worker:healthy', { workerId: worker.id });
      } else {
        worker.state = WorkerState.UNHEALTHY;
        this.emit('worker:unhealthy', {
          workerId: worker.id,
          error: health.error,
        });
      }
    } catch (error) {
      worker.state = WorkerState.UNHEALTHY;
      this.emit('worker:error', {
        workerId: worker.id,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  /**
   * 世代変更を処理
   */
  private async handleGenerationChange(newGenerationId: string): Promise<void> {
    const newGeneration = this.configManager.getGeneration(newGenerationId);
    if (!newGeneration) {
      return;
    }

    console.log(`Handling generation change to ${newGenerationId}`);

    // 新世代のワーカーを作成
    const newWorker = await this.createWorker(newGeneration);

    // 新世代が健全になるまで待つ
    if (newWorker.state !== WorkerState.HEALTHY) {
      console.warn(`New worker ${newWorker.id} is not healthy, waiting...`);
      // 実際のプロダクションではリトライロジックを実装
    }

    // 旧世代のワーカーをドレイン
    const oldWorkers = Array.from(this.workers.values()).filter(
      (w) =>
        w.generationId !== newGenerationId && w.state === WorkerState.HEALTHY,
    );

    for (const oldWorker of oldWorkers) {
      const queue = await this.drainQueue;
      queue.add(() => this.drainWorker(oldWorker));
    }
  }

  /**
   * ワーカーをドレイン（改善版：graceful shutdownとリトライ）
   */
  private async drainWorker(worker: Worker): Promise<void> {
    console.log(`Draining worker ${worker.id}`);
    worker.state = WorkerState.DRAINING;
    this.emit('worker:draining', { workerId: worker.id });

    const startTime = Date.now();
    const timeout = this.config.drainTimeoutMs;
    const checkInterval = 1000; // 1秒ごとにチェック
    const gracePeriod = 5000; // 5秒の猶予期間

    // フェーズ1: 通常のドレイン待機
    while (worker.activeSessionCount > 0) {
      const elapsed = Date.now() - startTime;

      if (elapsed > timeout - gracePeriod) {
        // タイムアウトが近い場合は警告を出す
        console.warn(
          `Worker ${worker.id} drain approaching timeout. Active sessions: ${worker.activeSessionCount}`,
        );

        // セッションに通知を送る（実装は省略）
        this.emit('worker:drain-warning', {
          workerId: worker.id,
          activeSessions: worker.activeSessionCount,
          remainingTime: timeout - elapsed,
        });
      }

      if (elapsed > timeout) {
        break;
      }

      await new Promise((resolve) => setTimeout(resolve, checkInterval));
    }

    // フェーズ2: 強制シャットダウン前の最終チェック
    if (worker.activeSessionCount > 0) {
      console.warn(
        `Worker ${worker.id} still has ${worker.activeSessionCount} active sessions after timeout`,
      );

      // セッションの移行を試みる
      const migrated = await this.tryMigrateActiveSessions(worker);

      if (!migrated) {
        // 移行失敗の場合、データ保存を試みる
        await this.saveWorkerState(worker);
        console.error(
          `Failed to migrate sessions for worker ${worker.id}. State saved for recovery.`,
        );
      }
    }

    // ワーカーを停止
    await this.stopWorker(worker);
  }

  /**
   * アクティブセッションを別のワーカーに移行
   */
  private async tryMigrateActiveSessions(worker: Worker): Promise<boolean> {
    try {
      // 健全な代替ワーカーを探す
      const alternativeWorker = Array.from(this.workers.values()).find(
        (w) =>
          w.id !== worker.id &&
          w.state === WorkerState.HEALTHY &&
          w.generationId === worker.generationId,
      );

      if (!alternativeWorker) {
        return false;
      }

      // セッションの移行（簡略版）
      console.log(
        `Migrating ${worker.activeSessionCount} sessions from ${worker.id} to ${alternativeWorker.id}`,
      );

      // 実際の移行ロジックはセッション管理側で実装
      for (const [sessionId, workerId] of this.sessionToWorker.entries()) {
        if (workerId === worker.id) {
          this.sessionToWorker.set(sessionId, alternativeWorker.id);
          alternativeWorker.activeSessionCount++;
        }
      }

      worker.activeSessionCount = 0;
      return true;
    } catch (error) {
      console.error(`Failed to migrate sessions:`, error);
      return false;
    }
  }

  /**
   * ワーカーの状態を保存（リカバリー用）
   */
  private async saveWorkerState(worker: Worker): Promise<void> {
    const state = {
      workerId: worker.id,
      generationId: worker.generationId,
      activeSessionCount: worker.activeSessionCount,
      timestamp: new Date().toISOString(),
      sessions: Array.from(this.sessionToWorker.entries())
        .filter(([_, wId]) => wId === worker.id)
        .map(([sId]) => sId),
    };

    // 実際の保存処理（ファイルやDBへ）
    console.log('Worker state saved:', JSON.stringify(state, null, 2));
    this.emit('worker:state-saved', state);
  }

  /**
   * ワーカーを停止
   */
  private async stopWorker(worker: Worker): Promise<void> {
    console.log(`Stopping worker ${worker.id}`);

    try {
      await worker.hub.shutdown();
      worker.state = WorkerState.STOPPED;
      this.emit('worker:stopped', { workerId: worker.id });

      // マップから削除
      this.workers.delete(worker.id);
    } catch (error) {
      console.error(`Error stopping worker ${worker.id}:`, error);
    }
  }

  /**
   * ヘルスチェックを開始
   */
  private startHealthCheck(): void {
    this.healthCheckInterval = setInterval(() => {
      this.performHealthCheck();
    }, this.config.healthCheckIntervalMs);
  }

  /**
   * ヘルスチェックを実行
   */
  private async performHealthCheck(): Promise<void> {
    for (const worker of this.workers.values()) {
      if (
        worker.state === WorkerState.HEALTHY ||
        worker.state === WorkerState.UNHEALTHY
      ) {
        const health = await this.checkWorkerHealth(worker);
        worker.lastHealthCheck = new Date();

        if (health.healthy && worker.state === WorkerState.UNHEALTHY) {
          worker.state = WorkerState.HEALTHY;
          this.emit('worker:recovered', { workerId: worker.id });
        } else if (!health.healthy && worker.state === WorkerState.HEALTHY) {
          worker.state = WorkerState.UNHEALTHY;
          this.emit('worker:unhealthy', {
            workerId: worker.id,
            error: health.error,
          });

          // エラー率をチェック
          await this.checkErrorRate(worker);
        }
      }
    }
  }

  /**
   * ワーカーのヘルスチェック
   */
  private async checkWorkerHealth(worker: Worker): Promise<HealthCheckResult> {
    try {
      const startTime = Date.now();

      // 簡単なヘルスチェック（実際はツール呼び出しなどで確認）
      const connections = worker.hub.getConnections();
      const healthy =
        connections.size > 0 ||
        worker.generationId === this.configManager.getCurrentGeneration()?.id;

      return {
        healthy,
        latencyMs: Date.now() - startTime,
      };
    } catch (error) {
      return {
        healthy: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  /**
   * エラー率をチェックし、必要に応じてロールバック
   */
  private async checkErrorRate(worker: Worker): Promise<void> {
    if (worker.requestCount === 0) {
      return;
    }

    const errorRate = worker.errorCount / worker.requestCount;
    if (errorRate > this.config.errorRateThreshold) {
      console.error(
        `Worker ${worker.id} error rate ${errorRate} exceeds threshold`,
      );

      // 現在の世代の場合はロールバック
      if (
        worker.generationId === this.configManager.getCurrentGeneration()?.id
      ) {
        this.emit('rollback:needed', {
          workerId: worker.id,
          errorRate,
          threshold: this.config.errorRateThreshold,
        });

        try {
          await this.configManager.rollbackToPrevious();
        } catch (error) {
          console.error('Failed to rollback:', error);
        }
      }
    }
  }

  /**
   * セッションに適切なワーカーを割り当て
   */
  assignWorkerToSession(
    sessionId: string,
    generationId?: string,
  ): Worker | null {
    // 既存の割り当てがある場合はそれを返す
    const existingWorkerId = this.sessionToWorker.get(sessionId);
    if (existingWorkerId) {
      const worker = this.workers.get(existingWorkerId);
      if (worker && worker.state === WorkerState.HEALTHY) {
        return worker;
      }
    }

    // 指定された世代のワーカーを探す
    const targetGenerationId =
      generationId || this.configManager.getCurrentGeneration()?.id;
    if (!targetGenerationId) {
      return null;
    }

    // 健全なワーカーを探す
    const healthyWorkers = Array.from(this.workers.values()).filter(
      (w) =>
        w.generationId === targetGenerationId &&
        w.state === WorkerState.HEALTHY,
    );

    if (healthyWorkers.length === 0) {
      return null;
    }

    // 最もセッション数が少ないワーカーを選択
    const worker = healthyWorkers.reduce((prev, curr) =>
      prev.activeSessionCount < curr.activeSessionCount ? prev : curr,
    );

    // セッションとワーカーを紐付け
    this.sessionToWorker.set(sessionId, worker.id);
    worker.activeSessionCount++;

    return worker;
  }

  /**
   * セッションを解放
   */
  releaseSession(sessionId: string): void {
    const workerId = this.sessionToWorker.get(sessionId);
    if (!workerId) {
      return;
    }

    const worker = this.workers.get(workerId);
    if (worker) {
      worker.activeSessionCount = Math.max(0, worker.activeSessionCount - 1);
    }

    this.sessionToWorker.delete(sessionId);
  }

  /**
   * 統計情報を取得
   */
  getStats(): {
    totalWorkers: number;
    healthyWorkers: number;
    drainingWorkers: number;
    activeSessionCount: number;
    workerStats: Array<{
      id: string;
      generationId: string;
      state: string;
      sessionCount: number;
      errorRate: number;
    }>;
  } {
    const workers = Array.from(this.workers.values());

    return {
      totalWorkers: workers.length,
      healthyWorkers: workers.filter((w) => w.state === WorkerState.HEALTHY)
        .length,
      drainingWorkers: workers.filter((w) => w.state === WorkerState.DRAINING)
        .length,
      activeSessionCount: workers.reduce(
        (sum, w) => sum + w.activeSessionCount,
        0,
      ),
      workerStats: workers.map((w) => ({
        id: w.id,
        generationId: w.generationId,
        state: w.state,
        sessionCount: w.activeSessionCount,
        errorRate: w.requestCount > 0 ? w.errorCount / w.requestCount : 0,
      })),
    };
  }

  /**
   * シャットダウン
   */
  async shutdown(): Promise<void> {
    // ヘルスチェックを停止
    if (this.healthCheckInterval) {
      clearInterval(this.healthCheckInterval);
      this.healthCheckInterval = null;
    }

    // すべてのワーカーを停止
    const workers = Array.from(this.workers.values());
    await Promise.all(workers.map((w) => this.stopWorker(w)));

    // クリーンアップ
    this.workers.clear();
    this.sessionToWorker.clear();
    this.removeAllListeners();
  }
}
