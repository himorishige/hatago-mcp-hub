/**
 * File-based registry storage implementation
 */

import { existsSync, promises as fs } from 'node:fs';
import { join } from 'node:path';
import type { RegistryStorage, ServerState } from './registry-storage.js';

export class FileRegistryStorage implements RegistryStorage {
  private storageFile: string;
  private states: Map<string, ServerState> = new Map();
  private saveDebounceTimer: NodeJS.Timeout | null = null;
  private readonly saveDebounceMs = 1000;

  constructor(storageDir: string) {
    this.storageFile = join(storageDir, 'registry-state.json');
  }

  async init(): Promise<void> {
    await this.load();
  }

  private async load(): Promise<void> {
    if (!existsSync(this.storageFile)) {
      return;
    }

    try {
      const data = await fs.readFile(this.storageFile, 'utf-8');
      const parsed = JSON.parse(data);

      this.states.clear();
      for (const [key, value] of Object.entries(parsed)) {
        // Convert date strings back to Date objects
        const state = value as ServerState;
        if (state.lastStartedAt) {
          state.lastStartedAt = new Date(
            state.lastStartedAt as unknown as string,
          );
        }
        if (state.lastStoppedAt) {
          state.lastStoppedAt = new Date(
            state.lastStoppedAt as unknown as string,
          );
        }
        if (state.lastFailureAt) {
          state.lastFailureAt = new Date(
            state.lastFailureAt as unknown as string,
          );
        }
        this.states.set(key, state);
      }
    } catch (error) {
      console.warn('Failed to load registry state:', error);
    }
  }

  private async save(): Promise<void> {
    // Convert Map to plain object for JSON serialization
    const data: Record<string, ServerState> = {};
    for (const [key, value] of this.states.entries()) {
      data[key] = value;
    }

    try {
      const dir = join(this.storageFile, '..');
      if (!existsSync(dir)) {
        await fs.mkdir(dir, { recursive: true });
      }

      await fs.writeFile(
        this.storageFile,
        JSON.stringify(data, null, 2),
        'utf-8',
      );
    } catch (error) {
      console.error('Failed to save registry state:', error);
    }
  }

  private debouncedSave(): void {
    if (this.saveDebounceTimer) {
      clearTimeout(this.saveDebounceTimer);
    }

    this.saveDebounceTimer = setTimeout(() => {
      this.save().catch(console.error);
      this.saveDebounceTimer = null;
    }, this.saveDebounceMs);
  }

  async saveServerState(serverId: string, state: ServerState): Promise<void> {
    this.states.set(serverId, state);
    this.debouncedSave();
  }

  async getServerState(serverId: string): Promise<ServerState | null> {
    return this.states.get(serverId) || null;
  }

  async getAllServerStates(): Promise<Map<string, ServerState>> {
    return new Map(this.states);
  }

  async deleteServerState(serverId: string): Promise<void> {
    this.states.delete(serverId);
    this.debouncedSave();
  }

  async clear(): Promise<void> {
    this.states.clear();
    await this.save();
  }

  async close(): Promise<void> {
    if (this.saveDebounceTimer) {
      clearTimeout(this.saveDebounceTimer);
      await this.save();
    }
  }
}
