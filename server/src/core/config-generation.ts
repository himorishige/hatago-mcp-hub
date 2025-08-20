import type { HatagoConfig } from '../config/types.js';
import { getRuntime } from '../runtime/runtime-factory.js';

/**
 * 設定の世代を表すクラス
 * 不変オブジェクトとして扱い、設定変更時は新しい世代を作成する
 */
export class ConfigGeneration {
  public readonly id: string;
  public readonly config: Readonly<HatagoConfig>;
  public readonly createdAt: Date;
  private referenceCount = 0;
  private disposed = false;
  private static runtime = getRuntime();

  private constructor(config: HatagoConfig, id: string) {
    this.id = id;
    this.config = Object.freeze(structuredClone(config));
    this.createdAt = new Date();
  }

  /**
   * 新しい世代を作成（非同期ファクトリーメソッド）
   */
  static async create(
    config: HatagoConfig,
    id?: string,
  ): Promise<ConfigGeneration> {
    const runtime = await ConfigGeneration.runtime;
    const generationId = id || (await runtime.idGenerator.generate());
    return new ConfigGeneration(config, generationId);
  }

  /**
   * 参照カウントを増やす
   */
  addReference(): void {
    if (this.disposed) {
      throw new Error(`Generation ${this.id} is already disposed`);
    }
    this.referenceCount++;
  }

  /**
   * 参照カウントを減らす
   */
  removeReference(): void {
    if (this.referenceCount > 0) {
      this.referenceCount--;
    }
  }

  /**
   * 参照カウントを取得
   */
  getReferenceCount(): number {
    return this.referenceCount;
  }

  /**
   * この世代が使用可能かチェック
   */
  isActive(): boolean {
    return !this.disposed && this.referenceCount > 0;
  }

  /**
   * この世代を破棄可能かチェック
   */
  canDispose(): boolean {
    return this.referenceCount === 0;
  }

  /**
   * この世代を破棄
   */
  dispose(): void {
    if (this.referenceCount > 0) {
      throw new Error(
        `Cannot dispose generation ${this.id} with ${this.referenceCount} active references`,
      );
    }
    this.disposed = true;
  }

  /**
   * 世代の情報を取得
   */
  getInfo(): {
    id: string;
    createdAt: Date;
    referenceCount: number;
    disposed: boolean;
  } {
    return {
      id: this.id,
      createdAt: this.createdAt,
      referenceCount: this.referenceCount,
      disposed: this.disposed,
    };
  }

  /**
   * 設定の差分を計算
   */
  static calculateDiff(
    oldGen: ConfigGeneration,
    newGen: ConfigGeneration,
  ): ConfigDiff {
    const diff: ConfigDiff = {
      added: [],
      removed: [],
      changed: [],
    };

    // サーバー設定の差分を計算
    const oldServerIds = new Set(oldGen.config.servers.map((s) => s.id));
    const newServerIds = new Set(newGen.config.servers.map((s) => s.id));

    // 追加されたサーバー
    for (const id of newServerIds) {
      if (!oldServerIds.has(id)) {
        diff.added.push({ type: 'server', id });
      }
    }

    // 削除されたサーバー
    for (const id of oldServerIds) {
      if (!newServerIds.has(id)) {
        diff.removed.push({ type: 'server', id });
      }
    }

    // 変更されたサーバー
    for (const id of oldServerIds) {
      if (newServerIds.has(id)) {
        const oldServer = oldGen.config.servers.find((s) => s.id === id);
        const newServer = newGen.config.servers.find((s) => s.id === id);
        if (JSON.stringify(oldServer) !== JSON.stringify(newServer)) {
          diff.changed.push({ type: 'server', id });
        }
      }
    }

    // ポリシー設定の変更
    if (
      JSON.stringify(oldGen.config.policy) !==
      JSON.stringify(newGen.config.policy)
    ) {
      diff.changed.push({ type: 'policy', id: 'global' });
    }

    // セッション設定の変更
    if (
      JSON.stringify(oldGen.config.session) !==
      JSON.stringify(newGen.config.session)
    ) {
      diff.changed.push({ type: 'session', id: 'global' });
    }

    return diff;
  }
}

/**
 * 設定の差分
 */
export interface ConfigDiff {
  added: Array<{ type: string; id: string }>;
  removed: Array<{ type: string; id: string }>;
  changed: Array<{ type: string; id: string }>;
}

/**
 * 世代のトランジション状態
 */
export enum GenerationTransition {
  LOADING = 'loading',
  VALIDATING = 'validating',
  WARMING_UP = 'warming_up',
  ACTIVE = 'active',
  DRAINING = 'draining',
  DISPOSED = 'disposed',
}

/**
 * 世代のライフサイクルイベント
 */
export interface GenerationEvent {
  generationId: string;
  type: 'created' | 'activated' | 'draining' | 'disposed';
  timestamp: Date;
  metadata?: Record<string, unknown>;
}
