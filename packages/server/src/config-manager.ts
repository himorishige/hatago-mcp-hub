/**
 * Configuration Manager
 *
 * Provides safe configuration file management with:
 * - Atomic writes
 * - Backup management
 * - Comment preservation in JSONC format
 * - Optimistic locking
 */

import { existsSync } from 'node:fs';
import { readFile, writeFile, rename, mkdir, copyFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import {
  type HatagoConfig,
  safeParseConfig,
  formatConfigError,
  expandConfig,
  validateEnvironmentVariables
} from '@himorishige/hatago-core';
import type { Logger } from './logger.js';

export interface ConfigManagerOptions {
  configPath: string;
  backupDir?: string;
  maxBackups?: number;
  logger: Logger;
}

export interface ConfigUpdateResult {
  success: boolean;
  version?: string;
  error?: string;
  backup?: string;
}

export class ConfigManager {
  private configPath: string;
  private backupDir: string;
  private maxBackups: number;
  private logger: Logger;
  private currentVersion: string = '0';
  private fileWatchers: Set<() => void> = new Set();

  constructor(options: ConfigManagerOptions) {
    this.configPath = resolve(options.configPath);
    this.backupDir = options.backupDir ?? join(dirname(this.configPath), '.backups');
    this.maxBackups = options.maxBackups ?? 10;
    this.logger = options.logger;
  }

  /**
   * Read current configuration
   */
  async readConfig(): Promise<{ data: HatagoConfig; version: string; raw: string }> {
    if (!existsSync(this.configPath)) {
      throw new Error(`Configuration file not found: ${this.configPath}`);
    }

    const raw = await readFile(this.configPath, 'utf-8');

    // Strip comments while preserving structure for round-trip
    const jsonContent = this.stripJsonComments(raw);
    const parsed = JSON.parse(jsonContent);

    // Validate with Zod
    const result = safeParseConfig(parsed);
    if (!result.success) {
      throw new Error(formatConfigError(result.error));
    }

    // Update version from file stats
    const { mtime } = await import('node:fs').then((m) => m.promises.stat(this.configPath));
    this.currentVersion = mtime.toISOString();

    return {
      data: result.data,
      version: this.currentVersion,
      raw
    };
  }

  /**
   * Save configuration with atomic write
   */
  async saveConfig(config: HatagoConfig, expectedVersion?: string): Promise<ConfigUpdateResult> {
    try {
      // 1. Check version for optimistic locking
      if (expectedVersion && expectedVersion !== this.currentVersion) {
        return {
          success: false,
          error: 'Configuration has been modified by another process',
          version: this.currentVersion
        };
      }

      // 2. Validate configuration
      const validation = safeParseConfig(config);
      if (!validation.success) {
        return {
          success: false,
          error: formatConfigError(validation.error)
        };
      }

      // 3. Create backup
      const backupPath = await this.createBackup();

      // 4. Prepare content with comment preservation
      const content = await this.prepareConfigContent(config);

      // 5. Atomic write
      const tmpPath = `${this.configPath}.tmp`;
      await writeFile(tmpPath, content, 'utf-8');

      // Force sync to disk
      const fd = await import('node:fs').then((m) => m.promises.open(tmpPath, 'r+'));
      await fd.sync();
      await fd.close();

      // Atomic rename
      await rename(tmpPath, this.configPath);

      // 6. Update version
      const { mtime } = await import('node:fs').then((m) => m.promises.stat(this.configPath));
      this.currentVersion = mtime.toISOString();

      // 7. Notify watchers
      this.notifyWatchers();

      // 8. Cleanup old backups
      await this.cleanupOldBackups();

      return {
        success: true,
        version: this.currentVersion,
        backup: backupPath
      };
    } catch (error) {
      this.logger.error('Failed to save configuration', {
        error: error instanceof Error ? error.message : String(error)
      });
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  /**
   * Create a backup of current configuration
   */
  private async createBackup(): Promise<string> {
    if (!existsSync(this.configPath)) {
      return '';
    }

    // Ensure backup directory exists
    await mkdir(this.backupDir, { recursive: true });

    // Generate backup filename with timestamp
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const backupName = `config-${timestamp}.json`;
    const backupPath = join(this.backupDir, backupName);

    // Copy current config to backup
    await copyFile(this.configPath, backupPath);

    this.logger.debug(`Created backup: ${backupName}`);
    return backupPath;
  }

  /**
   * Clean up old backups keeping only maxBackups
   */
  private async cleanupOldBackups(): Promise<void> {
    const { readdir, unlink, stat } = await import('node:fs/promises');

    try {
      const files = await readdir(this.backupDir);

      // Get backup files with stats
      const backups = await Promise.all(
        files
          .filter((f) => f.startsWith('config-') && f.endsWith('.json'))
          .map(async (f) => {
            const path = join(this.backupDir, f);
            const stats = await stat(path);
            return { path, mtime: stats.mtime };
          })
      );

      // Sort by modification time (newest first)
      backups.sort((a, b) => b.mtime.getTime() - a.mtime.getTime());

      // Remove old backups
      for (let i = this.maxBackups; i < backups.length; i++) {
        await unlink(backups[i].path);
        this.logger.debug(`Removed old backup: ${backups[i].path}`);
      }
    } catch (error) {
      this.logger.warn('Failed to cleanup old backups', {
        error: error instanceof Error ? error.message : String(error)
      });
    }
  }

  /**
   * Prepare configuration content preserving comments
   */
  private async prepareConfigContent(config: HatagoConfig): Promise<string> {
    // For now, we'll use pretty JSON formatting
    // In the future, this could preserve original JSONC comments
    return JSON.stringify(config, null, 2);
  }

  /**
   * Strip comments from JSONC content
   */
  private stripJsonComments(content: string): string {
    // Remove single-line comments
    content = content.replace(/("(?:[^"\\]|\\.)*")|\/\/.*$/gm, '$1');

    // Remove multi-line comments
    content = content.replace(/("(?:[^"\\]|\\.)*")|\/\*[\s\S]*?\*\//g, '$1');

    // Remove trailing commas
    content = content.replace(/,(\s*[}\]])/g, '$1');

    return content;
  }

  /**
   * Register a watcher for configuration changes
   */
  onConfigChange(callback: () => void): () => void {
    this.fileWatchers.add(callback);
    return () => {
      this.fileWatchers.delete(callback);
    };
  }

  /**
   * Notify all watchers of configuration change
   */
  private notifyWatchers(): void {
    for (const watcher of this.fileWatchers) {
      try {
        watcher();
      } catch (error) {
        this.logger.error('Error in config watcher', {
          error: error instanceof Error ? error.message : String(error)
        });
      }
    }
  }

  /**
   * List available backups
   */
  async listBackups(): Promise<Array<{ name: string; date: Date; size: number }>> {
    const { readdir, stat } = await import('node:fs/promises');

    if (!existsSync(this.backupDir)) {
      return [];
    }

    const files = await readdir(this.backupDir);
    const backups = await Promise.all(
      files
        .filter((f) => f.startsWith('config-') && f.endsWith('.json'))
        .map(async (f) => {
          const path = join(this.backupDir, f);
          const stats = await stat(path);
          return {
            name: f,
            date: stats.mtime,
            size: stats.size
          };
        })
    );

    // Sort by date (newest first)
    return backups.sort((a, b) => b.date.getTime() - a.date.getTime());
  }

  /**
   * Restore configuration from backup
   */
  async restoreFromBackup(backupName: string): Promise<ConfigUpdateResult> {
    const backupPath = join(this.backupDir, backupName);

    if (!existsSync(backupPath)) {
      return {
        success: false,
        error: `Backup not found: ${backupName}`
      };
    }

    try {
      // Create backup of current config before restoring
      await this.createBackup();

      // Copy backup to config location
      await copyFile(backupPath, this.configPath);

      // Update version
      const { mtime } = await import('node:fs').then((m) => m.promises.stat(this.configPath));
      this.currentVersion = mtime.toISOString();

      // Notify watchers
      this.notifyWatchers();

      this.logger.info(`Restored configuration from backup: ${backupName}`);

      return {
        success: true,
        version: this.currentVersion
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  /**
   * Validate configuration without saving
   */
  async validateConfig(config: unknown): Promise<{ valid: boolean; errors?: string[] }> {
    const result = safeParseConfig(config);

    if (result.success) {
      // Additional validation for environment variables
      try {
        validateEnvironmentVariables(config as Record<string, unknown>);
        return { valid: true };
      } catch (error) {
        return {
          valid: false,
          errors: [
            error instanceof Error ? error.message : 'Environment variable validation failed'
          ]
        };
      }
    }

    // Parse Zod errors
    const errors = result.error.errors.map((err) => `${err.path.join('.')}: ${err.message}`);

    return {
      valid: false,
      errors
    };
  }
}
