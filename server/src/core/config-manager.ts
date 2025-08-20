import { EventEmitter } from 'node:events';
import type { HatagoConfig } from '../config/types.js';
import { validateConfig } from '../config/types.js';
import {
  type ConfigDiff,
  ConfigGeneration,
  type GenerationEvent,
  GenerationTransition,
} from './config-generation.js';

/**
 * 設定の世代管理を行うマネージャー
 * 複数世代の設定を保持し、アトミックな切り替えとライフサイクル管理を提供
 */
export class ConfigManager extends EventEmitter {
  private currentGeneration: ConfigGeneration | null = null;
  private generations = new Map<string, ConfigGeneration>();
  private transitions = new Map<string, GenerationTransition>();
  private maxGenerations: number;
  private gracePeriodMs: number;
  private switchLock = false; // アトミック切り替えのためのロック

  constructor(options?: { maxGenerations?: number; gracePeriodMs?: number }) {
    super();
    this.maxGenerations = options?.maxGenerations || 3;
    this.gracePeriodMs = options?.gracePeriodMs || 30000;
  }

  /**
   * 現在の世代を取得
   */
  getCurrentGeneration(): ConfigGeneration | null {
    return this.currentGeneration;
  }

  /**
   * 現在の設定を取得
   */
  getCurrentConfig(): HatagoConfig | null {
    return this.currentGeneration?.config || null;
  }

  /**
   * 特定の世代を取得
   */
  getGeneration(id: string): ConfigGeneration | undefined {
    return this.generations.get(id);
  }

  /**
   * すべての世代を取得
   */
  getAllGenerations(): ConfigGeneration[] {
    return Array.from(this.generations.values());
  }

  /**
   * 新しい設定を読み込み、新世代を作成
   */
  async loadNewConfig(config: unknown): Promise<ConfigGeneration> {
    // バリデーション
    this.emit('config:validating');
    const validatedConfig = validateConfig(config);

    // 新世代を作成
    const newGeneration = await ConfigGeneration.create(validatedConfig);
    this.generations.set(newGeneration.id, newGeneration);
    this.transitions.set(newGeneration.id, GenerationTransition.VALIDATING);

    // イベントを発行
    const event: GenerationEvent = {
      generationId: newGeneration.id,
      type: 'created',
      timestamp: new Date(),
    };
    this.emit('generation:created', event);

    // ウォームアップフェーズ
    await this.warmupGeneration(newGeneration);

    return newGeneration;
  }

  /**
   * 世代のウォームアップ
   */
  private async warmupGeneration(generation: ConfigGeneration): Promise<void> {
    this.transitions.set(generation.id, GenerationTransition.WARMING_UP);
    this.emit('generation:warming_up', { generationId: generation.id });

    // ここで実際のウォームアップ処理を行う
    // 例: 接続プールの作成、ツールの検証など
    await new Promise((resolve) => setTimeout(resolve, 1000));

    this.transitions.set(generation.id, GenerationTransition.ACTIVE);
  }

  /**
   * 新世代にアトミックに切り替え
   */
  async switchToGeneration(generationId: string): Promise<void> {
    // ロックチェック（並行切り替えを防ぐ）
    if (this.switchLock) {
      throw new Error('Generation switch already in progress');
    }

    this.switchLock = true;
    try {
      const newGeneration = this.generations.get(generationId);
      if (!newGeneration) {
        throw new Error(`Generation ${generationId} not found`);
      }

      const transition = this.transitions.get(generationId);
      if (transition !== GenerationTransition.ACTIVE) {
        throw new Error(
          `Generation ${generationId} is not active (current: ${transition})`,
        );
      }

      const oldGeneration = this.currentGeneration;

      // 差分を計算
      let diff: ConfigDiff | null = null;
      if (oldGeneration) {
        diff = ConfigGeneration.calculateDiff(oldGeneration, newGeneration);
        this.emit('config:diff', diff);
      }

      // アトミックな切り替え（ロック内で実行）
      this.currentGeneration = newGeneration;
      newGeneration.addReference();

      // イベントを発行
      const event: GenerationEvent = {
        generationId: newGeneration.id,
        type: 'activated',
        timestamp: new Date(),
        metadata: { diff },
      };
      this.emit('generation:activated', event);

      // 旧世代のドレイン開始（ロック外で実行可能）
      if (oldGeneration) {
        // ドレインは非同期で実行
        this.drainGeneration(oldGeneration).catch((error) => {
          console.error(
            `Failed to drain generation ${oldGeneration.id}:`,
            error,
          );
        });
      }

      // 古い世代のクリーンアップ
      this.cleanupOldGenerations();
    } finally {
      this.switchLock = false;
    }
  }

  /**
   * 世代のドレイン
   */
  private async drainGeneration(generation: ConfigGeneration): Promise<void> {
    this.transitions.set(generation.id, GenerationTransition.DRAINING);

    const event: GenerationEvent = {
      generationId: generation.id,
      type: 'draining',
      timestamp: new Date(),
    };
    this.emit('generation:draining', event);

    // 猶予期間を待つ
    await new Promise((resolve) => setTimeout(resolve, this.gracePeriodMs));

    // 参照カウントを減らす
    generation.removeReference();

    // 参照がなくなったら破棄
    if (generation.canDispose()) {
      await this.disposeGeneration(generation);
    }
  }

  /**
   * 世代を破棄
   */
  private async disposeGeneration(generation: ConfigGeneration): Promise<void> {
    generation.dispose();
    this.transitions.set(generation.id, GenerationTransition.DISPOSED);

    const event: GenerationEvent = {
      generationId: generation.id,
      type: 'disposed',
      timestamp: new Date(),
    };
    this.emit('generation:disposed', event);

    // マップから削除
    this.generations.delete(generation.id);
    this.transitions.delete(generation.id);
  }

  /**
   * 古い世代をクリーンアップ
   */
  private cleanupOldGenerations(): void {
    const activeGenerations = Array.from(this.generations.values())
      .filter((g) => !g.canDispose())
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());

    // 最大世代数を超えた場合、古い世代を強制破棄
    if (activeGenerations.length > this.maxGenerations) {
      const toDispose = activeGenerations.slice(this.maxGenerations);
      for (const generation of toDispose) {
        if (generation.canDispose()) {
          this.disposeGeneration(generation).catch((error) => {
            console.error(
              `Failed to dispose generation ${generation.id}:`,
              error,
            );
          });
        }
      }
    }
  }

  /**
   * 現在の世代にロールバック
   */
  async rollbackToPrevious(): Promise<void> {
    const generations = Array.from(this.generations.values())
      .filter((g) => this.transitions.get(g.id) === GenerationTransition.ACTIVE)
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());

    if (generations.length < 2) {
      throw new Error('No previous generation available for rollback');
    }

    const previousGeneration = generations[1];
    await this.switchToGeneration(previousGeneration.id);

    this.emit('config:rollback', {
      from: this.currentGeneration?.id,
      to: previousGeneration.id,
    });
  }

  /**
   * 世代の状態を取得
   */
  getGenerationStatus(): Array<{
    id: string;
    createdAt: Date;
    state: GenerationTransition;
    referenceCount: number;
    isCurrent: boolean;
  }> {
    return Array.from(this.generations.values()).map((gen) => ({
      id: gen.id,
      createdAt: gen.createdAt,
      state: this.transitions.get(gen.id) || GenerationTransition.DISPOSED,
      referenceCount: gen.getReferenceCount(),
      isCurrent: gen === this.currentGeneration,
    }));
  }

  /**
   * シャットダウン
   */
  async shutdown(): Promise<void> {
    // すべての世代を破棄
    for (const generation of this.generations.values()) {
      if (generation.getReferenceCount() > 0) {
        // 強制的に参照を削除
        while (generation.getReferenceCount() > 0) {
          generation.removeReference();
        }
      }
      if (generation.canDispose()) {
        await this.disposeGeneration(generation);
      }
    }

    this.currentGeneration = null;
    this.generations.clear();
    this.transitions.clear();
    this.removeAllListeners();
  }
}
