/**
 * Simple workspace management for NPX servers
 * Lightweight version without complex features
 */

import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

/**
 * Simple workspace interface
 */
export interface SimpleWorkspace {
  id: string;
  path: string;
  serverId?: string;
  created: Date;
}

/**
 * Simplified workspace manager
 */
export class SimpleWorkspaceManager {
  private workspaces = new Map<string, SimpleWorkspace>();
  private tempDir: string;

  constructor() {
    this.tempDir = tmpdir();
  }

  /**
   * Create a workspace for a server
   */
  async createWorkspace(serverId: string): Promise<SimpleWorkspace> {
    // Create temp directory
    const prefix = `hatago-${serverId}-`;
    const path = await mkdtemp(join(this.tempDir, prefix));

    const workspace: SimpleWorkspace = {
      id: serverId,
      path,
      serverId,
      created: new Date(),
    };

    this.workspaces.set(serverId, workspace);
    return workspace;
  }

  /**
   * Get workspace by server ID
   */
  async getWorkspaceByServerId(
    serverId: string,
  ): Promise<SimpleWorkspace | null> {
    return this.workspaces.get(serverId) || null;
  }

  /**
   * Remove workspace
   */
  async removeWorkspace(serverId: string): Promise<void> {
    const workspace = this.workspaces.get(serverId);
    if (workspace) {
      try {
        await rm(workspace.path, { recursive: true, force: true });
      } catch (error) {
        // Ignore cleanup errors
      }
      this.workspaces.delete(serverId);
    }
  }

  /**
   * Clean up all workspaces
   */
  async cleanup(): Promise<void> {
    const promises = Array.from(this.workspaces.keys()).map((id) =>
      this.removeWorkspace(id),
    );
    await Promise.all(promises);
  }

  /**
   * Initialize (no-op for simple version)
   */
  async initialize(): Promise<void> {
    // No initialization needed
  }

  /**
   * Shutdown and clean up
   */
  async shutdown(): Promise<void> {
    await this.cleanup();
  }
}
