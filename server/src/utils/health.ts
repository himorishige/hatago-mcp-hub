/**
 * Health check utilities
 */

import { constants, existsSync } from 'node:fs';
import { access } from 'node:fs/promises';
import type { Logger } from 'pino';

export interface HealthCheck {
  name: string;
  description?: string;
  critical: boolean;
  check: () => Promise<HealthCheckResult>;
}

export interface HealthCheckResult {
  ok: boolean;
  message?: string;
  metadata?: Record<string, unknown>;
}

export interface HealthStatus {
  status: 'ready' | 'not ready';
  timestamp: string;
  checks: Record<string, HealthCheckResult>;
  errors?: string[];
}

/**
 * Health check manager
 */
export class HealthCheckManager {
  private checks = new Map<string, HealthCheck>();
  private logger?: Logger;

  constructor(logger?: Logger) {
    this.logger = logger;
  }

  /**
   * Register a health check
   */
  register(check: HealthCheck): void {
    this.checks.set(check.name, check);
    this.logger?.debug(
      { check: check.name, critical: check.critical },
      'Health check registered',
    );
  }

  /**
   * Run all health checks
   */
  async runAll(): Promise<HealthStatus> {
    const results: Record<string, HealthCheckResult> = {};
    const errors: string[] = [];
    let hasCriticalFailure = false;

    for (const [name, check] of this.checks) {
      try {
        const result = await this.runCheck(check);
        results[name] = result;

        if (!result.ok) {
          const errorMsg = `${name}: ${result.message || 'Check failed'}`;
          if (check.critical) {
            hasCriticalFailure = true;
            errors.push(`[CRITICAL] ${errorMsg}`);
          } else {
            errors.push(errorMsg);
          }
        }
      } catch (error) {
        const errorMsg = error instanceof Error ? error.message : String(error);
        results[name] = {
          ok: false,
          message: errorMsg,
        };

        if (check.critical) {
          hasCriticalFailure = true;
          errors.push(`[CRITICAL] ${name}: ${errorMsg}`);
        } else {
          errors.push(`${name}: ${errorMsg}`);
        }
      }
    }

    const status: HealthStatus = {
      status: hasCriticalFailure ? 'not ready' : 'ready',
      timestamp: new Date().toISOString(),
      checks: results,
    };

    if (errors.length > 0) {
      status.errors = errors;
    }

    return status;
  }

  /**
   * Run a single health check with timeout
   */
  private async runCheck(
    check: HealthCheck,
    timeoutMs = 5000,
  ): Promise<HealthCheckResult> {
    let timeoutId: NodeJS.Timeout | undefined;
    const timeoutPromise = new Promise<HealthCheckResult>((resolve) => {
      timeoutId = setTimeout(
        () =>
          resolve({
            ok: false,
            message: `Check timed out after ${timeoutMs}ms`,
          }),
        timeoutMs,
      );
    });

    try {
      return await Promise.race([check.check(), timeoutPromise]);
    } finally {
      if (timeoutId !== undefined) {
        clearTimeout(timeoutId);
      }
    }
  }
}

/**
 * Standard health checks
 */

/**
 * Check if configuration is loaded
 */
export function createConfigCheck(configLoaded: () => boolean): HealthCheck {
  return {
    name: 'config',
    description: 'Configuration loaded and valid',
    critical: true,
    check: async () => {
      const loaded = configLoaded();
      return {
        ok: loaded,
        message: loaded ? 'Configuration loaded' : 'Configuration not loaded',
      };
    },
  };
}

/**
 * Check workspace directory access
 */
export function createWorkspaceCheck(workspacePath?: string): HealthCheck {
  return {
    name: 'workspace',
    description: 'Workspace directory accessible',
    critical: false,
    check: async () => {
      const path = workspacePath || process.cwd();

      try {
        await access(path, constants.R_OK | constants.W_OK);
        return {
          ok: true,
          message: 'Workspace accessible',
          metadata: { path },
        };
      } catch (error) {
        let message = 'Cannot access workspace';
        let errorCode: string | undefined;

        // Provide specific error messages based on error code
        if (error && typeof error === 'object' && 'code' in error) {
          errorCode = String(error.code);

          if (errorCode === 'ENOENT') {
            message = `Workspace directory does not exist: ${path}`;
          } else if (errorCode === 'EACCES') {
            message = `Permission denied accessing workspace: ${path}`;
          } else if (errorCode === 'EPERM') {
            message = `Operation not permitted on workspace: ${path}`;
          } else if ('message' in error) {
            message = `Cannot access workspace: ${error.message}`;
          }
        } else {
          message = `Cannot access workspace: ${String(error)}`;
        }

        return {
          ok: false,
          message,
          metadata: {
            path,
            errorCode,
          },
        };
      }
    },
  };
}

/**
 * Check .hatago directory exists
 */
export function createHatagoDirectoryCheck(): HealthCheck {
  return {
    name: 'hatago_directory',
    description: '.hatago directory exists',
    critical: false,
    check: async () => {
      const hatagoDir = '.hatago';
      const exists = existsSync(hatagoDir);

      return {
        ok: exists,
        message: exists
          ? '.hatago directory exists'
          : '.hatago directory not found',
      };
    },
  };
}

/**
 * Check MCP servers health
 */
export function createMCPServersCheck(
  getServerStatuses: () => Array<{
    id: string;
    state: string;
    type: string;
  }>,
): HealthCheck {
  return {
    name: 'mcp_servers',
    description: 'MCP servers status',
    critical: false,
    check: async () => {
      const statuses = getServerStatuses();
      const running = statuses.filter((s) => s.state === 'running');
      const failed = statuses.filter((s) => s.state === 'crashed');

      const allRunning = failed.length === 0;

      return {
        ok: allRunning,
        message: allRunning
          ? `All ${statuses.length} servers healthy`
          : `${failed.length} servers failed`,
        metadata: {
          total: statuses.length,
          running: running.length,
          failed: failed.length,
          servers: statuses,
        },
      };
    },
  };
}

/**
 * Check system resources
 */
export function createSystemResourcesCheck(): HealthCheck {
  return {
    name: 'system_resources',
    description: 'System resources available',
    critical: false,
    check: async () => {
      const memUsage = process.memoryUsage();
      const heapUsed = memUsage.heapUsed / 1024 / 1024; // MB
      const heapTotal = memUsage.heapTotal / 1024 / 1024; // MB
      const heapPercent = (heapUsed / heapTotal) * 100;

      // Warn if heap usage is over 90%
      const ok = heapPercent < 90;

      return {
        ok,
        message: ok
          ? `Memory usage normal (${heapPercent.toFixed(1)}%)`
          : `High memory usage (${heapPercent.toFixed(1)}%)`,
        metadata: {
          heap_used_mb: Math.round(heapUsed),
          heap_total_mb: Math.round(heapTotal),
          heap_percent: Math.round(heapPercent),
          rss_mb: Math.round(memUsage.rss / 1024 / 1024),
        },
      };
    },
  };
}
