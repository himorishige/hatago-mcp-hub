import { EventEmitter } from 'node:events';
import type { HatagoConfig } from '../config/types.js';
import { validateConfig } from '../config/types.js';

/**
 * 設定の世代管理を行うマネージャー
 * 複数世代の設定を保持し、アトミックな切り替えとライフサイクル管理を提供
 */
export class ConfigManager extends EventEmitter {
  private currentConfig: HatagoConfig | null = null;
  private configLock = false;

  /**
   * 現在の設定を取得
   */
  getCurrentConfig(): HatagoConfig | null {
    return this.currentConfig;
  }

  /**
   * 新しい設定を読み込み
   */
  async loadConfig(config: unknown): Promise<HatagoConfig> {
    // バリデーション
    this.emit('config:validating');
    const validatedConfig = validateConfig(config);

    // ロックチェック
    if (this.configLock) {
      throw new Error('Configuration update is already in progress');
    }

    this.configLock = true;
    try {
      const oldConfig = this.currentConfig;
      this.currentConfig = validatedConfig;

      // イベントを発行
      this.emit('config:loaded', {
        config: validatedConfig,
        previousConfig: oldConfig,
        timestamp: new Date(),
      });

      return validatedConfig;
    } finally {
      this.configLock = false;
    }
  }

  /**
   * 設定をリロード
   */
  async reloadConfig(config: unknown): Promise<void> {
    await this.loadConfig(config);
    this.emit('config:reloaded');
  }

  /**
   * シャットダウン
   */
  async shutdown(): Promise<void> {
    this.currentConfig = null;
    this.removeAllListeners();
  }
}
