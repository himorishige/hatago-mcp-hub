import { promises as fs } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { WorkspaceManager } from './workspace-manager.js';

describe('WorkspaceManager', () => {
  let manager: WorkspaceManager;
  let testBaseDir: string;

  beforeEach(() => {
    testBaseDir = path.join(tmpdir(), `test-workspaces-${Date.now()}`);
    manager = new WorkspaceManager({
      baseDir: testBaseDir,
      cleanupIntervalMs: 0, // Disable auto cleanup for tests
    });
  });

  afterEach(async () => {
    if (manager) {
      await manager.shutdown();
    }
    // Clean up test directory
    try {
      await fs.rm(testBaseDir, { recursive: true, force: true });
    } catch {
      // Ignore cleanup errors
    }
  });

  describe('initialization', () => {
    it('should create base directory on initialize', async () => {
      await manager.initialize();

      const stats = await fs.stat(testBaseDir);
      expect(stats.isDirectory()).toBe(true);
    });

    it('should handle existing base directory', async () => {
      await fs.mkdir(testBaseDir, { recursive: true });
      await manager.initialize();

      const stats = await fs.stat(testBaseDir);
      expect(stats.isDirectory()).toBe(true);
    });
  });

  describe('workspace management', () => {
    beforeEach(async () => {
      await manager.initialize();
    });

    it('should create a new workspace', async () => {
      const workspace = await manager.createWorkspace('test-server');

      expect(workspace.serverId).toBe('test-server');
      expect(workspace.path).toContain('workspace-');
      expect(workspace.createdAt).toBeInstanceOf(Date);
      expect(workspace.lastAccessedAt).toBeInstanceOf(Date);

      // Verify directory exists
      const stats = await fs.stat(workspace.path);
      expect(stats.isDirectory()).toBe(true);

      // Verify metadata file exists
      const metadataPath = path.join(workspace.path, '.metadata.json');
      const metadataStats = await fs.stat(metadataPath);
      expect(metadataStats.isFile()).toBe(true);
    });

    it('should retrieve workspace by ID', async () => {
      const created = await manager.createWorkspace('test-server');
      const retrieved = await manager.getWorkspace(created.id);

      expect(retrieved).not.toBeNull();
      expect(retrieved?.id).toBe(created.id);
      expect(retrieved?.serverId).toBe('test-server');
    });

    it('should retrieve workspace by server ID', async () => {
      const created = await manager.createWorkspace('test-server');
      const retrieved = await manager.getWorkspaceByServerId('test-server');

      expect(retrieved).not.toBeNull();
      expect(retrieved?.id).toBe(created.id);
      expect(retrieved?.serverId).toBe('test-server');
    });

    it('should return null for non-existent workspace', async () => {
      const workspace = await manager.getWorkspace('non-existent');
      expect(workspace).toBeNull();
    });

    it('should delete workspace', async () => {
      const workspace = await manager.createWorkspace('test-server');
      const workspacePath = workspace.path;

      await manager.deleteWorkspace(workspace.id);

      // Verify workspace is removed from tracking
      const retrieved = await manager.getWorkspace(workspace.id);
      expect(retrieved).toBeNull();

      // Verify directory is deleted
      await expect(fs.stat(workspacePath)).rejects.toThrow();
    });

    it('should list all workspaces', async () => {
      const workspace1 = await manager.createWorkspace('server-1');
      const workspace2 = await manager.createWorkspace('server-2');

      const list = manager.listWorkspaces();

      expect(list).toHaveLength(2);
      expect(list.map((w) => w.id)).toContain(workspace1.id);
      expect(list.map((w) => w.id)).toContain(workspace2.id);
    });
  });

  describe('package cache', () => {
    beforeEach(async () => {
      await manager.initialize();
    });

    it('should create package cache directory', async () => {
      const workspace = await manager.createWorkspace('test-server');
      const cachePath = await manager.createPackageCache(
        workspace.id,
        '@example/test-package',
      );

      expect(cachePath).toContain('.cache');
      expect(cachePath).toContain('example_test-package');

      const stats = await fs.stat(cachePath);
      expect(stats.isDirectory()).toBe(true);
    });

    it('should sanitize package names for cache directories', async () => {
      const workspace = await manager.createWorkspace('test-server');
      const cachePath = await manager.createPackageCache(
        workspace.id,
        '@scope/package-name@1.0.0',
      );

      expect(cachePath).toContain('scope_package-name_1_0_0');
    });

    it('should throw error for non-existent workspace', async () => {
      await expect(
        manager.createPackageCache('non-existent', 'package'),
      ).rejects.toThrow('Workspace non-existent not found');
    });
  });

  describe('statistics', () => {
    beforeEach(async () => {
      await manager.initialize();
    });

    it('should return workspace statistics', async () => {
      const workspace1 = await manager.createWorkspace('server-1');
      const _workspace2 = await manager.createWorkspace('server-2');
      await manager.createWorkspace('server-2'); // Second workspace for same server

      const stats = manager.getStats();

      expect(stats.totalWorkspaces).toBe(3);
      expect(stats.workspacesByServer['server-1']).toBe(1);
      expect(stats.workspacesByServer['server-2']).toBe(2);
      expect(stats.oldestWorkspace).toEqual(workspace1.createdAt);
      expect(stats.newestWorkspace).toBeDefined();
    });

    it('should return empty statistics when no workspaces', () => {
      const stats = manager.getStats();

      expect(stats.totalWorkspaces).toBe(0);
      expect(stats.workspacesByServer).toEqual({});
      expect(stats.oldestWorkspace).toBeUndefined();
      expect(stats.newestWorkspace).toBeUndefined();
    });
  });

  describe('workspace limits', () => {
    it('should enforce workspace limit', async () => {
      const limitedManager = new WorkspaceManager({
        baseDir: testBaseDir,
        maxWorkspaces: 2,
        cleanupIntervalMs: 0,
      });

      await limitedManager.initialize();

      // Create 3 workspaces
      const workspace1 = await limitedManager.createWorkspace('server-1');
      await limitedManager.createWorkspace('server-2');
      await limitedManager.createWorkspace('server-3');

      // First workspace should be deleted
      const retrieved = await limitedManager.getWorkspace(workspace1.id);
      expect(retrieved).toBeNull();

      // Total should be limited to 2
      const list = limitedManager.listWorkspaces();
      expect(list).toHaveLength(2);

      await limitedManager.shutdown();
    });
  });

  describe('cleanup', () => {
    it('should clean up old workspaces', async () => {
      await manager.initialize();

      const workspace = await manager.createWorkspace('test-server');

      // Manually set old access time
      workspace.lastAccessedAt = new Date(Date.now() - 100000000);

      // Manually trigger cleanup
      await manager.cleanup();

      // Workspace should be deleted
      const retrieved = await manager.getWorkspace(workspace.id);
      expect(retrieved).toBeNull();
    });
  });
});
