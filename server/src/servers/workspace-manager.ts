/**
 * Workspace manager for isolated NPX server environments
 */

import { randomUUID } from 'node:crypto';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { RuntimeDependentService } from '../core/runtime-dependent-service.js';
import type { Runtime } from '../runtime/types.js';

/**
 * Workspace information
 */
export interface Workspace {
  id: string;
  path: string;
  serverId: string;
  createdAt: string;
  lastAccessedAt: string;
}

/**
 * Workspace manager configuration
 */
export interface WorkspaceManagerConfig {
  baseDir?: string; // Base directory for workspaces
  cleanupIntervalMs?: number; // Cleanup interval
  maxAgeMs?: number; // Maximum age before cleanup
  maxWorkspaces?: number; // Maximum number of workspaces
}

/**
 * Manages isolated workspaces for NPX servers
 */
export class WorkspaceManager extends RuntimeDependentService {
  private config: WorkspaceManagerConfig;
  private workspaces = new Map<string, Workspace>();
  private cleanupInterval: NodeJS.Timeout | null = null;

  // Default configuration
  private readonly defaults = {
    baseDir: path.join(tmpdir(), 'hatago-workspaces'),
    cleanupIntervalMs: 3600000, // 1 hour
    maxAgeMs: 86400000, // 24 hours
    maxWorkspaces: 100,
  };

  constructor(config?: WorkspaceManagerConfig) {
    super();
    this.config = {
      ...this.defaults,
      ...config,
    };
  }

  /**
   * Called after runtime is ready
   */
  protected async onRuntimeReady(runtime: Runtime): Promise<void> {
    await this.ensureBaseDir();
    await this.loadExistingWorkspaces();

    // Start cleanup interval
    const cleanupInterval =
      this.config.cleanupIntervalMs ?? this.defaults.cleanupIntervalMs;
    this.cleanupInterval = runtime.setInterval(() => {
      void this.cleanup();
    }, cleanupInterval);
  }

  /**
   * Ensure base directory exists
   */
  private async ensureBaseDir(): Promise<void> {
    const runtime = this.requireRuntime();
    const fileSystem = runtime.getFileSystem();
    const baseDir = this.config.baseDir ?? this.defaults.baseDir;
    await fileSystem.mkdir(baseDir, true);
  }

  /**
   * Load existing workspaces from disk
   */
  private async loadExistingWorkspaces(): Promise<void> {
    const runtime = this.requireRuntime();
    const fileSystem = runtime.getFileSystem();
    const baseDir = this.config.baseDir ?? this.defaults.baseDir;

    try {
      const entries = await fileSystem.readdir(baseDir);

      for (const entryName of entries) {
        if (!entryName.startsWith('workspace-')) {
          continue;
        }

        const metadataPath = path.join(baseDir, entryName, 'metadata.json');

        // Skip invalid workspaces
        if (!(await fileSystem.exists(metadataPath))) {
          console.error(`Skipping invalid workspace: ${entryName}`);
          continue;
        }

        const metadata = JSON.parse(
          await fileSystem.readFile(metadataPath),
        ) as Workspace;
        this.workspaces.set(metadata.id, metadata);
      }
    } catch (error) {
      // Base directory might not exist yet
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
        throw error;
      }
    }
  }

  /**
   * Create a new workspace
   */
  async createWorkspace(serverId: string): Promise<Workspace> {
    const runtime = this.requireRuntime();
    const fileSystem = runtime.getFileSystem();

    // Enforce workspace limit
    await this.enforceWorkspaceLimit();

    const id = `workspace-${randomUUID()}`;
    const baseDir = this.config.baseDir ?? this.defaults.baseDir;
    const workspacePath = path.join(baseDir, id);

    // Create workspace directory
    await fileSystem.mkdir(workspacePath, { recursive: true });

    const workspace: Workspace = {
      id,
      path: workspacePath,
      serverId,
      createdAt: new Date().toISOString(),
      lastAccessedAt: new Date().toISOString(),
    };

    // Save metadata
    await this.saveMetadata(workspace);

    // Store in memory
    this.workspaces.set(id, workspace);

    // Create package cache directory
    await this.createPackageCache(workspace);

    return workspace;
  }

  /**
   * Save workspace metadata to disk
   */
  private async saveMetadata(workspace: Workspace): Promise<void> {
    const runtime = this.requireRuntime();
    const fileSystem = runtime.getFileSystem();
    const metadataPath = path.join(workspace.path, 'metadata.json');
    await fileSystem.writeFile(
      metadataPath,
      JSON.stringify(workspace, null, 2),
    );
  }

  /**
   * Get a workspace by ID
   */
  async getWorkspace(id: string): Promise<Workspace | undefined> {
    const workspace = this.workspaces.get(id);
    if (workspace) {
      // Update last accessed time
      workspace.lastAccessedAt = new Date().toISOString();
      await this.saveMetadata(workspace);
    }
    return workspace;
  }

  /**
   * Get workspace by server ID
   */
  async getWorkspaceByServerId(
    serverId: string,
  ): Promise<Workspace | undefined> {
    for (const workspace of this.workspaces.values()) {
      if (workspace.serverId === serverId) {
        // Update last accessed time
        workspace.lastAccessedAt = new Date().toISOString();
        await this.saveMetadata(workspace);
        return workspace;
      }
    }
    return undefined;
  }

  /**
   * Delete a workspace
   */
  async deleteWorkspace(id: string): Promise<void> {
    const runtime = this.requireRuntime();
    const fileSystem = runtime.getFileSystem();
    const workspace = this.workspaces.get(id);
    if (!workspace) {
      return;
    }

    // Remove from disk
    await fileSystem.rmdir(workspace.path, { recursive: true });

    // Remove from memory
    this.workspaces.delete(id);
  }

  /**
   * Enforce workspace limit by deleting oldest workspaces
   */
  private async enforceWorkspaceLimit(): Promise<void> {
    const maxWorkspaces =
      this.config.maxWorkspaces ?? this.defaults.maxWorkspaces;

    if (this.workspaces.size >= maxWorkspaces) {
      // Sort by last accessed time
      const sorted = Array.from(this.workspaces.values()).sort(
        (a, b) =>
          new Date(a.lastAccessedAt).getTime() -
          new Date(b.lastAccessedAt).getTime(),
      );

      // Delete oldest workspaces
      const toDelete = sorted.slice(
        0,
        this.workspaces.size - maxWorkspaces + 1,
      );
      for (const workspace of toDelete) {
        await this.deleteWorkspace(workspace.id);
      }
    }
  }

  /**
   * Clean up old workspaces
   */
  async cleanup(): Promise<void> {
    const maxAgeMs = this.config.maxAgeMs ?? this.defaults.maxAgeMs;
    const now = Date.now();

    for (const workspace of this.workspaces.values()) {
      const age = now - new Date(workspace.lastAccessedAt).getTime();
      if (age > maxAgeMs) {
        await this.deleteWorkspace(workspace.id);
      }
    }
  }

  /**
   * Create package cache directory for a workspace
   */
  async createPackageCache(workspace: Workspace): Promise<void> {
    const runtime = this.requireRuntime();
    const fileSystem = runtime.getFileSystem();
    const cacheDir = path.join(workspace.path, '.cache');
    await fileSystem.mkdir(cacheDir, { recursive: true });

    // Create subdirectories for different package managers
    await fileSystem.mkdir(path.join(cacheDir, 'npm'), { recursive: true });
    await fileSystem.mkdir(path.join(cacheDir, 'yarn'), { recursive: true });
    await fileSystem.mkdir(path.join(cacheDir, 'pnpm'), { recursive: true });
  }

  /**
   * Get workspace statistics
   */
  getStats(): WorkspaceStats {
    const workspaces = Array.from(this.workspaces.values());
    const now = Date.now();

    const stats: WorkspaceStats = {
      total: workspaces.length,
      active: 0,
      stale: 0,
      avgAgeMs: 0,
      oldestAgeMs: 0,
      newestAgeMs: Number.MAX_SAFE_INTEGER,
    };

    if (workspaces.length === 0) {
      return stats;
    }

    let totalAge = 0;
    const maxAgeMs = this.config.maxAgeMs ?? this.defaults.maxAgeMs;

    for (const workspace of workspaces) {
      const age = now - new Date(workspace.lastAccessedAt).getTime();
      totalAge += age;

      if (age > maxAgeMs) {
        stats.stale++;
      } else {
        stats.active++;
      }

      stats.oldestAgeMs = Math.max(stats.oldestAgeMs, age);
      stats.newestAgeMs = Math.min(stats.newestAgeMs, age);
    }

    stats.avgAgeMs = totalAge / workspaces.length;

    return stats;
  }

  /**
   * List all workspaces
   */
  listWorkspaces(): Workspace[] {
    return Array.from(this.workspaces.values());
  }

  /**
   * Shutdown the workspace manager
   */
  /**
   * Called during shutdown
   */
  protected async onShutdown(): Promise<void> {
    // Stop cleanup interval
    if (this.cleanupInterval) {
      const runtime = this.requireRuntime();
      runtime.clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
    }

    // Final cleanup
    await this.cleanup();
  }
}
