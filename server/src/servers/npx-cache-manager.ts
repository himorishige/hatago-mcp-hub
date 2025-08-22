/**
 * NPX Cache Manager
 * Manages and tracks NPX package cache status for optimal performance
 */

import { exec } from 'node:child_process';
import { access, readdir } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';

const execAsync = promisify(exec);

/**
 * Cache status for a package
 */
export interface CacheStatus {
  isCached: boolean;
  cachePath?: string;
  lastChecked: Date;
  version?: string;
}

/**
 * NPX Cache Manager
 * Tracks and manages NPX package cache for improved performance
 */
export class NpxCacheManager {
  // Cache status for packages
  private cacheStatus = new Map<string, CacheStatus>();

  // Warmup results from initialization
  private warmupResults = new Map<string, boolean>();

  // Cache check interval (default: 5 minutes)
  private readonly cacheCheckInterval: number;

  constructor(options?: { cacheCheckInterval?: number }) {
    this.cacheCheckInterval = options?.cacheCheckInterval ?? 5 * 60 * 1000;
  }

  /**
   * Record warmup result for a package
   */
  recordWarmupResult(packageSpec: string, success: boolean): void {
    this.warmupResults.set(packageSpec, success);

    // If warmup succeeded, mark as cached
    if (success) {
      this.cacheStatus.set(packageSpec, {
        isCached: true,
        lastChecked: new Date(),
      });
    }
  }

  /**
   * Check if a package is cached
   */
  async isCached(packageSpec: string): Promise<boolean> {
    // Check warmup results first
    if (this.warmupResults.has(packageSpec)) {
      const wasWarmedUp = this.warmupResults.get(packageSpec);
      if (wasWarmedUp) {
        // If it was successfully warmed up, assume it's still cached
        // unless it's been too long since last check
        const status = this.cacheStatus.get(packageSpec);
        if (status) {
          const timeSinceCheck = Date.now() - status.lastChecked.getTime();
          if (timeSinceCheck < this.cacheCheckInterval) {
            return true;
          }
        }
      }
    }

    // Perform actual cache check
    const status = await this.checkCacheStatus(packageSpec);
    this.cacheStatus.set(packageSpec, status);
    return status.isCached;
  }

  /**
   * Get cache path for a package
   */
  async getCachePath(packageSpec: string): Promise<string | null> {
    const status = await this.checkCacheStatus(packageSpec);
    return status.cachePath || null;
  }

  /**
   * Check actual cache status using npm
   */
  private async checkCacheStatus(packageSpec: string): Promise<CacheStatus> {
    try {
      // Try to get cache location using npm cache ls
      const { stdout } = await execAsync(`npm cache ls ${packageSpec}`, {
        encoding: 'utf-8',
        timeout: 5000,
      });

      // If command succeeds and returns data, package is cached
      if (stdout?.trim()) {
        // Try to extract cache path from output
        const cachePath = this.extractCachePath(stdout);

        return {
          isCached: true,
          cachePath,
          lastChecked: new Date(),
        };
      }
    } catch (_error) {
      // Command failed or timed out, try alternative method
      return this.checkCacheViaDirectory(packageSpec);
    }

    return {
      isCached: false,
      lastChecked: new Date(),
    };
  }

  /**
   * Extract cache path from npm cache ls output
   */
  private extractCachePath(output: string): string | undefined {
    // npm cache ls output typically includes the cache directory
    // Look for paths that contain .npm or cache
    const lines = output.split('\n');
    for (const line of lines) {
      if (line.includes('.npm') || line.includes('cache')) {
        // Extract path-like string
        const match = line.match(/([/\\][\w\-./\\]+\.npm[\w\-./\\]*)/);
        if (match) {
          return match[1];
        }
      }
    }
    return undefined;
  }

  /**
   * Check cache by looking at npm cache directory
   */
  private async checkCacheViaDirectory(
    packageSpec: string,
  ): Promise<CacheStatus> {
    try {
      // Get npm cache directory
      const { stdout } = await execAsync('npm config get cache', {
        encoding: 'utf-8',
        timeout: 5000,
      });

      const cacheDir = stdout.trim();
      if (!cacheDir) {
        return { isCached: false, lastChecked: new Date() };
      }

      // Parse package name from spec
      const packageName = this.parsePackageName(packageSpec);

      // Check if package exists in cache
      // NPM cache structure: cache/_cacache/content-v2/...
      // But we can check for package in cache/_npx
      const npxCacheDir = join(cacheDir, '_npx');

      try {
        await access(npxCacheDir);

        // Look for directories that might contain our package
        const entries = await readdir(npxCacheDir);

        // Check if any entry contains our package name
        const hasPackage = entries.some((entry) =>
          entry.toLowerCase().includes(packageName.toLowerCase()),
        );

        if (hasPackage) {
          return {
            isCached: true,
            cachePath: npxCacheDir,
            lastChecked: new Date(),
          };
        }
      } catch {
        // Directory doesn't exist or can't be accessed
      }

      // Alternative: check user's home directory .npm
      const homeNpmCache = join(homedir(), '.npm');
      try {
        await access(join(homeNpmCache, '_npx'));
        return {
          isCached: true,
          cachePath: homeNpmCache,
          lastChecked: new Date(),
        };
      } catch {
        // Not in home directory cache either
      }
    } catch (_error) {
      // Failed to determine cache directory
    }

    return {
      isCached: false,
      lastChecked: new Date(),
    };
  }

  /**
   * Parse package name from package spec
   */
  private parsePackageName(packageSpec: string): string {
    // Remove version specifier if present
    const atIndex = packageSpec.lastIndexOf('@');
    if (atIndex > 0) {
      // Check if this @ is for scoped package or version
      const beforeAt = packageSpec.substring(0, atIndex);
      if (beforeAt.includes('/')) {
        // It's likely @scope/package@version
        return beforeAt;
      }
      // It's package@version
      return beforeAt;
    }
    return packageSpec;
  }

  /**
   * Clear cache status for a package
   */
  clearStatus(packageSpec: string): void {
    this.cacheStatus.delete(packageSpec);
    this.warmupResults.delete(packageSpec);
  }

  /**
   * Get all cached packages
   */
  getCachedPackages(): string[] {
    return Array.from(this.cacheStatus.entries())
      .filter(([_, status]) => status.isCached)
      .map(([packageSpec, _]) => packageSpec);
  }

  /**
   * Verify npm cache integrity
   */
  async verifyCacheIntegrity(): Promise<boolean> {
    try {
      const { stdout } = await execAsync('npm cache verify', {
        encoding: 'utf-8',
        timeout: 30000,
      });

      // Check if verification succeeded
      return stdout.toLowerCase().includes('verified');
    } catch (_error) {
      return false;
    }
  }

  /**
   * Force refresh cache for a package
   */
  async refreshCache(packageSpec: string): Promise<boolean> {
    try {
      // Clear our cache status
      this.clearStatus(packageSpec);

      // Force npm to re-download
      const { stderr } = await execAsync(
        `npx -y --ignore-existing ${packageSpec} --version`,
        {
          encoding: 'utf-8',
          timeout: 60000,
        },
      );

      // Check if download was successful
      const success = !stderr.includes('error') && !stderr.includes('ERR!');

      if (success) {
        this.recordWarmupResult(packageSpec, true);
      }

      return success;
    } catch (_error) {
      return false;
    }
  }
}

/**
 * Create a singleton instance
 */
let cacheManagerInstance: NpxCacheManager | null = null;

export function getNpxCacheManager(): NpxCacheManager {
  if (!cacheManagerInstance) {
    cacheManagerInstance = new NpxCacheManager();
  }
  return cacheManagerInstance;
}
