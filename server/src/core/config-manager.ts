/**
 * Config Manager - Platform-agnostic implementation
 * Uses EventBus interface instead of EventEmitter
 */
import type { HatagoConfig } from '../config/types.js';
import type { EventBus } from '../platform/types.js';
import { type ConfigStore, createConfigStore } from './config-store.js';

/**
 * Config Manager with platform-agnostic event handling
 */
export class ConfigManager {
  private store: ConfigStore;
  private events: EventBus;
  private unsubscribe?: () => void;

  constructor(events: EventBus) {
    this.store = createConfigStore();
    this.events = events;

    // Bridge store events to EventBus
    this.unsubscribe = this.store.subscribe((config, previousConfig) => {
      this.events.emit('config:loaded', {
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
    this.events.emit('config:validating', {});

    try {
      const validatedConfig = this.store.set(config);
      return validatedConfig;
    } catch (error) {
      this.events.emit('config:error', { error });
      throw error;
    }
  }

  /**
   * 設定をリロード
   */
  async reloadConfig(config: unknown): Promise<void> {
    await this.store.reload(config);
    this.events.emit('config:reloaded', {});
  }

  /**
   * Subscribe to config events
   */
  on(event: string, handler: (payload: unknown) => void): () => void {
    return this.events.on(event, handler);
  }

  /**
   * Emit an event (for compatibility)
   */
  emit(event: string, payload?: unknown): void {
    this.events.emit(event, payload || {});
  }

  /**
   * Remove all listeners for an event
   */
  removeAllListeners(event?: string): void {
    if (event) {
      this.events.off(event);
    }
    // Note: removing all listeners across all events is not supported
    // in the EventBus interface - this is intentional for better isolation
  }

  /**
   * シャットダウン
   */
  async shutdown(): Promise<void> {
    if (this.unsubscribe) {
      this.unsubscribe();
    }
    this.store.clear();
    // Note: EventBus cleanup is handled by the Platform
  }
}
