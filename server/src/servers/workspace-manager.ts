/**
 * Workspace manager for isolated NPX server environments
 */

import { promises as fs } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { getRuntime } from '../runtime/runtime-factory.js';

/**
 * Workspace information
 */
export interface Workspace {
  id: string;
  path: string;
  serverId: string;
  createdAt: Date;
  lastAccessedAt: Date;
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
export class WorkspaceManager {
  private config: WorkspaceManagerConfig;
  private workspaces = new Map<string, Workspace>();
  private cleanupInterval: NodeJS.Timeout | null = null;
  private runtime = getRuntime();

  // Default configuration
  private readonly defaults = {
    baseDir: path.join(tmpdir(), 'hatago-workspaces'),
    cleanupIntervalMs: 3600000, // 1 hour
    maxAgeMs: 86400000, // 24 hours
    maxWorkspaces: 100,
  };

  constructor(config?: WorkspaceManagerConfig) {
    this.config = {
      ...this.defaults,
      ...config,
    };
  }

  /**
   * Initialize the workspace manager
   */
  async initialize(): Promise<void> {
    const runtime = await this.runtime;

    // Ensure base directory exists
    await this.ensureBaseDir();

    // Start cleanup interval
    if (this.config.cleanupIntervalMs) {
      this.cleanupInterval = runtime.setInterval(
        () => this.cleanup(),
        this.config.cleanupIntervalMs,
      );
    }

    // Load existing workspaces
    await this.loadExistingWorkspaces();
  }

  /**
   * Ensure base directory exists
   */
  private async ensureBaseDir(): Promise<void> {
    const baseDir = this.config.baseDir || this.defaults.baseDir;

    try {
      await fs.access(baseDir);
    } catch {
      await fs.mkdir(baseDir, { recursive: true });
    }
  }

  /**
   * Load existing workspaces from disk
   */
  private async loadExistingWorkspaces(): Promise<void> {
    const baseDir = this.config.baseDir || this.defaults.baseDir;

    try {
      const entries = await fs.readdir(baseDir, { withFileTypes: true });

      for (const entry of entries) {
        if (entry.isDirectory() && entry.name.startsWith('workspace-')) {
          const metadataPath = path.join(baseDir, entry.name, '.metadata.json');

          try {
            const metadata = await fs.readFile(metadataPath, 'utf-8');
            const workspace = JSON.parse(metadata) as Workspace;
            workspace.createdAt = new Date(workspace.createdAt);
            workspace.lastAccessedAt = new Date(workspace.lastAccessedAt);
            this.workspaces.set(workspace.id, workspace);
          } catch {
            // Metadata not found or invalid, skip
            console.warn(`Skipping invalid workspace: ${entry.name}`);
          }
        }
      }
    } catch (error) {
      console.error('Failed to load existing workspaces:', error);
    }
  }

  /**
   * Create a new workspace for a server
   */
  async createWorkspace(serverId: string): Promise<Workspace> {
    const runtime = await this.runtime;
    const baseDir = this.config.baseDir || this.defaults.baseDir;

    let attempts = 0;
    const maxAttempts = 3;

    while (attempts < maxAttempts) {
      const id = await runtime.idGenerator.generate();
      const workspacePath = path.join(baseDir, `workspace-${id}`);

      try {
        // Try to create directory (will fail if already exists)
        await fs.mkdir(workspacePath, { recursive: false });

        // Create workspace metadata
        const workspace: Workspace = {
          id,
          path: workspacePath,
          serverId,
          createdAt: new Date(),
          lastAccessedAt: new Date(),
        };

        // Save metadata
        await this.saveMetadata(workspace);

        // Track workspace
        this.workspaces.set(id, workspace);

        // Check workspace limit
        await this.enforceWorkspaceLimit();

        return workspace;
      } catch (error) {
        // If directory already exists (race condition), retry with new ID
        if (
          error instanceof Error &&
          'code' in error &&
          error.code === 'EEXIST'
        ) {
          attempts++;
          console.warn(
            `Workspace directory collision, retrying (attempt ${attempts}/${maxAttempts})`,
          );
          continue;
        }
        // Re-throw other errors
        throw error;
      }
    }

    throw new Error(`Failed to create workspace after ${maxAttempts} attempts`);
  }

  /**
   * Save workspace metadata
   */
  private async saveMetadata(workspace: Workspace): Promise<void> {
    const metadataPath = path.join(workspace.path, '.metadata.json');
    await fs.writeFile(
      metadataPath,
      JSON.stringify(workspace, null, 2),
      'utf-8',
    );
  }

  /**
   * Get workspace by ID
   */
  async getWorkspace(id: string): Promise<Workspace | null> {
    const workspace = this.workspaces.get(id);

    if (workspace) {
      // Update last accessed time
      workspace.lastAccessedAt = new Date();
      await this.saveMetadata(workspace);
    }

    return workspace || null;
  }

  /**
   * Get workspace by server ID
   */
  async getWorkspaceByServerId(serverId: string): Promise<Workspace | null> {
    for (const workspace of this.workspaces.values()) {
      if (workspace.serverId === serverId) {
        // Update last accessed time
        workspace.lastAccessedAt = new Date();
        await this.saveMetadata(workspace);
        return workspace;
      }
    }

    return null;
  }

  /**
   * Delete a workspace
   */
  async deleteWorkspace(id: string): Promise<void> {
    const workspace = this.workspaces.get(id);

    if (!workspace) {
      return;
    }

    // Remove from tracking
    this.workspaces.delete(id);

    // Delete directory
    try {
      await fs.rm(workspace.path, { recursive: true, force: true });
    } catch (error) {
      console.error(`Failed to delete workspace ${id}:`, error);
    }
  }

  /**
   * Enforce workspace limit
   */
  private async enforceWorkspaceLimit(): Promise<void> {
    const maxWorkspaces =
      this.config.maxWorkspaces || this.defaults.maxWorkspaces;

    if (this.workspaces.size <= maxWorkspaces) {
      return;
    }

    // Sort by last accessed time
    const sorted = Array.from(this.workspaces.values()).sort(
      (a, b) => a.lastAccessedAt.getTime() - b.lastAccessedAt.getTime(),
    );

    // Delete oldest workspaces
    const toDelete = sorted.slice(0, this.workspaces.size - maxWorkspaces);

    for (const workspace of toDelete) {
      await this.deleteWorkspace(workspace.id);
    }
  }

  /**
   * Clean up old workspaces
   */
  async cleanup(): Promise<void> {
    const maxAgeMs = this.config.maxAgeMs || this.defaults.maxAgeMs;
    const now = Date.now();
    const toDelete: string[] = [];

    for (const workspace of this.workspaces.values()) {
      const age = now - workspace.lastAccessedAt.getTime();

      if (age > maxAgeMs) {
        toDelete.push(workspace.id);
      }
    }

    // Delete old workspaces
    for (const id of toDelete) {
      await this.deleteWorkspace(id);
    }

    console.log(`Cleaned up ${toDelete.length} old workspaces`);
  }

  /**
   * Create a package cache directory
   */
  async createPackageCache(
    workspaceId: string,
    packageName: string,
  ): Promise<string> {
    const workspace = await this.getWorkspace(workspaceId);

    if (!workspace) {
      throw new Error(`Workspace ${workspaceId} not found`);
    }

    // Sanitize package name for directory
    const safeName = packageName.replace(/[^a-zA-Z0-9-]/g, '_');
    const cachePath = path.join(workspace.path, '.cache', safeName);

    await fs.mkdir(cachePath, { recursive: true });

    return cachePath;
  }

  /**
   * Get workspace statistics
   */
  getStats(): {
    totalWorkspaces: number;
    workspacesByServer: Record<string, number>;
    oldestWorkspace?: Date;
    newestWorkspace?: Date;
  } {
    const stats: {
      totalWorkspaces: number;
      workspacesByServer: Record<string, number>;
      oldestWorkspace?: Date;
      newestWorkspace?: Date;
    } = {
      totalWorkspaces: this.workspaces.size,
      workspacesByServer: {},
    };

    let oldest: Date | undefined;
    let newest: Date | undefined;

    for (const workspace of this.workspaces.values()) {
      // Count by server
      stats.workspacesByServer[workspace.serverId] =
        (stats.workspacesByServer[workspace.serverId] || 0) + 1;

      // Track oldest and newest
      if (!oldest || workspace.createdAt < oldest) {
        oldest = workspace.createdAt;
      }
      if (!newest || workspace.createdAt > newest) {
        newest = workspace.createdAt;
      }
    }

    stats.oldestWorkspace = oldest;
    stats.newestWorkspace = newest;

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
  async shutdown(): Promise<void> {
    const runtime = await this.runtime;

    // Stop cleanup interval
    if (this.cleanupInterval) {
      runtime.clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
    }

    // Final cleanup
    await this.cleanup();
  }
}
