import { EventEmitter } from 'node:events';
import type { HatagoConfig } from '../config/types.js';
import { type ConfigStore, createConfigStore } from './config-store.js';

/**
 * 設定の世代管理を行うマネージャー
 * 複数世代の設定を保持し、アトミックな切り替えとライフサイクル管理を提供
 */
/**
 * Config Manager - thin adapter over config store
 * Maintains backward compatibility while using functional core
 */
export class ConfigManager extends EventEmitter {
  private store: ConfigStore;

  constructor() {
    super();
    this.store = createConfigStore();

    // Bridge store events to EventEmitter for backward compatibility
    this.store.subscribe((config, previousConfig) => {
      this.emit('config:loaded', {
        config,
        previousConfig,
        timestamp: new Date(),
      });
    });
  }

  /**
   * 現在の設定を取得
   */
  getCurrentConfig(): HatagoConfig | null {
    return this.store.get();
  }

  /**
   * 新しい設定を読み込み
   */
  async loadConfig(config: unknown): Promise<HatagoConfig> {
    this.emit('config:validating');

    try {
      const validatedConfig = this.store.set(config);
      return validatedConfig;
    } catch (error) {
      this.emit('config:error', error);
      throw error;
    }
  }

  /**
   * 設定をリロード
   */
  async reloadConfig(config: unknown): Promise<void> {
    await this.store.reload(config);
    this.emit('config:reloaded');
  }

  /**
   * シャットダウン
   */
  async shutdown(): Promise<void> {
    this.store.clear();
    this.removeAllListeners();
  }
}
