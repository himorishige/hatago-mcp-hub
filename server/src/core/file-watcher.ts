import { EventEmitter } from 'node:events';
import { readFile } from 'node:fs/promises';
import { type FSWatcher, watch } from 'chokidar';
import { parse } from 'jsonc-parser';
import { ErrorHelpers } from '../utils/errors.js';

/**
 * 設定ファイルの変更を監視するクラス
 */
export class FileWatcher extends EventEmitter {
  private watcher: FSWatcher | null = null;
  private watchPaths: string[];
  private debounceMs: number;
  private debounceTimer: NodeJS.Timeout | null = null;
  private isWatching = false;

  constructor(options?: { watchPaths?: string[]; debounceMs?: number }) {
    super();
    this.watchPaths = options?.watchPaths || ['.hatago/config.jsonc'];
    this.debounceMs = options?.debounceMs || 2000;
  }

  /**
   * 監視を開始
   */
  async start(): Promise<void> {
    if (this.isWatching) {
      return;
    }

    console.log('Starting file watcher for:', this.watchPaths);

    this.watcher = watch(this.watchPaths, {
      persistent: true,
      ignoreInitial: true,
      awaitWriteFinish: {
        stabilityThreshold: 1000,
        pollInterval: 100,
      },
    });

    // ファイル変更イベント
    this.watcher.on('change', (path) => {
      this.handleFileChange(path);
    });

    // ファイル追加イベント
    this.watcher.on('add', (path) => {
      this.handleFileChange(path);
    });

    // エラーイベント
    this.watcher.on('error', (error) => {
      console.error('File watcher error:', error);
      this.emit('error', error);
    });

    // 準備完了イベント
    this.watcher.on('ready', () => {
      this.isWatching = true;
      console.log('File watcher is ready');
      this.emit('ready');
    });
  }

  /**
   * ファイル変更を処理
   */
  private handleFileChange(path: string): void {
    console.log(`File changed: ${path}`);

    // デバウンス処理
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
    }

    this.debounceTimer = setTimeout(() => {
      this.loadAndEmitConfig(path);
    }, this.debounceMs);
  }

  /**
   * 設定ファイルを読み込んでイベントを発行
   */
  private async loadAndEmitConfig(path: string): Promise<void> {
    try {
      const content = await readFile(path, 'utf-8');
      const config = parse(content);

      // 設定変更イベントを発行
      this.emit('config:changed', {
        path,
        config,
        timestamp: new Date(),
      });
    } catch (error) {
      console.error(`Failed to load config from ${path}:`, error);
      this.emit('error', {
        type: 'load',
        path,
        error,
      });
    }
  }

  /**
   * 設定ファイルを手動で再読み込み
   */
  async reload(): Promise<unknown> {
    if (this.watchPaths.length === 0) {
      throw ErrorHelpers.noWatchPaths();
    }

    const configs: Array<{ path: string; config: unknown }> = [];

    for (const path of this.watchPaths) {
      try {
        const content = await readFile(path, 'utf-8');
        const config = parse(content);
        configs.push({ path, config });
      } catch (error) {
        console.error(`Failed to reload config from ${path}:`, error);
        // エラーがあっても続行
      }
    }

    if (configs.length === 0) {
      throw ErrorHelpers.configLoadFailed();
    }

    // 最初の設定を返す（将来的には複数設定のマージを考慮）
    return configs[0].config;
  }

  /**
   * 監視パスを追加
   */
  async addPath(path: string): Promise<void> {
    if (!this.watchPaths.includes(path)) {
      this.watchPaths.push(path);
      if (this.watcher) {
        await this.watcher.add(path);
        console.log(`Added watch path: ${path}`);
      }
    }
  }

  /**
   * 監視パスを削除
   */
  async removePath(path: string): Promise<void> {
    const index = this.watchPaths.indexOf(path);
    if (index > -1) {
      this.watchPaths.splice(index, 1);
      if (this.watcher) {
        await this.watcher.unwatch(path);
        console.log(`Removed watch path: ${path}`);
      }
    }
  }

  /**
   * 監視中のパスを取得
   */
  getWatchPaths(): string[] {
    return [...this.watchPaths];
  }

  /**
   * 監視を停止
   */
  async stop(): Promise<void> {
    if (!this.isWatching) {
      return;
    }

    console.log('Stopping file watcher');

    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
      this.debounceTimer = null;
    }

    if (this.watcher) {
      await this.watcher.close();
      this.watcher = null;
    }

    this.isWatching = false;
    this.removeAllListeners();
  }

  /**
   * 監視状態を取得
   */
  isActive(): boolean {
    return this.isWatching;
  }
}
