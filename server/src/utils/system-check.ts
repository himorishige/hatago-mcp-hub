/**
 * System check utilities for hatago doctor
 */

import { execSync } from 'node:child_process';
import { constants, existsSync } from 'node:fs';
import { access } from 'node:fs/promises';
import * as net from 'node:net';
import { freemem, platform, release, totalmem } from 'node:os';
import { join } from 'node:path';
import { ErrorHelpers } from './errors.js';

export interface CheckResult {
  name: string;
  status: 'pass' | 'warn' | 'fail';
  message: string;
  suggestion?: string;
  metadata?: Record<string, unknown>;
}

/**
 * Check Node.js version
 */
export function checkNodeVersion(): CheckResult {
  const currentVersion = process.version;
  const minVersion = 'v20.0.0';

  const parseVersion = (v: string) => {
    const match = v.match(/v?(\d+)\.(\d+)\.(\d+)/);
    if (!match) return { major: 0, minor: 0, patch: 0 };
    return {
      major: parseInt(match[1], 10),
      minor: parseInt(match[2], 10),
      patch: parseInt(match[3], 10),
    };
  };

  const current = parseVersion(currentVersion);
  const min = parseVersion(minVersion);

  const isValid =
    current.major > min.major ||
    (current.major === min.major && current.minor >= min.minor);

  return {
    name: 'Node.js Version',
    status: isValid ? 'pass' : 'fail',
    message: isValid
      ? `Node.js ${currentVersion} meets requirement (>=${minVersion})`
      : `Node.js ${currentVersion} is below minimum requirement (>=${minVersion})`,
    suggestion: isValid
      ? undefined
      : 'Please update Node.js to version 20.0.0 or higher',
    metadata: { currentVersion, minVersion },
  };
}

/**
 * Check package manager availability
 */
export function checkPackageManager(): CheckResult {
  const managers = ['pnpm', 'npm', 'yarn'];
  const available: string[] = [];

  for (const manager of managers) {
    try {
      execSync(`which ${manager}`, { stdio: 'ignore' });
      available.push(manager);
    } catch {
      // Manager not found
    }
  }

  if (available.length === 0) {
    return {
      name: 'Package Manager',
      status: 'fail',
      message: 'No package manager found',
      suggestion: 'Please install pnpm, npm, or yarn',
    };
  }

  const hasPnpm = available.includes('pnpm');
  return {
    name: 'Package Manager',
    status: hasPnpm ? 'pass' : 'warn',
    message: `Available: ${available.join(', ')}`,
    suggestion: hasPnpm ? undefined : 'pnpm is recommended for this project',
    metadata: { available },
  };
}

/**
 * Check runtime environment
 */
export function checkRuntime(): CheckResult {
  const runtime = (() => {
    if (globalThis.Deno) return 'Deno';
    if (globalThis.Bun) return 'Bun';
    return 'Node.js';
  })();

  const version = (() => {
    if (runtime === 'Deno' && globalThis.Deno) {
      return (
        (globalThis.Deno as { version?: { deno?: string } }).version?.deno ||
        'unknown'
      );
    }
    if (runtime === 'Bun' && globalThis.Bun) {
      return (globalThis.Bun as { version?: string }).version || 'unknown';
    }
    return process.version;
  })();

  return {
    name: 'Runtime Environment',
    status: 'pass',
    message: `${runtime} ${version}`,
    metadata: { runtime, version },
  };
}

/**
 * Check disk space
 */
export async function checkDiskSpace(): Promise<CheckResult> {
  const cwd = process.cwd();

  try {
    // Use df command to get disk usage
    const output = execSync(`df -k "${cwd}"`, { encoding: 'utf-8' });
    const lines = output.trim().split('\n');
    if (lines.length < 2) {
      throw ErrorHelpers.invalidDfOutput();
    }

    const parts = lines[1].split(/\s+/);
    const available = parseInt(parts[3], 10) * 1024; // Convert KB to bytes
    const total = parseInt(parts[1], 10) * 1024;
    const used = parseInt(parts[2], 10) * 1024;
    const percent = Math.round((used / total) * 100);

    const availableGB = (available / 1024 / 1024 / 1024).toFixed(2);
    const totalGB = (total / 1024 / 1024 / 1024).toFixed(2);

    let status: 'pass' | 'warn' | 'fail' = 'pass';
    let suggestion: string | undefined;

    if (available < 100 * 1024 * 1024) {
      // Less than 100MB
      status = 'fail';
      suggestion = 'Free up disk space (less than 100MB available)';
    } else if (available < 1024 * 1024 * 1024) {
      // Less than 1GB
      status = 'warn';
      suggestion = 'Disk space is running low (less than 1GB available)';
    }

    return {
      name: 'Disk Space',
      status,
      message: `${availableGB}GB available of ${totalGB}GB (${percent}% used)`,
      suggestion,
      metadata: { available, total, used, percent },
    };
  } catch (error) {
    return {
      name: 'Disk Space',
      status: 'warn',
      message: 'Unable to check disk space',
      metadata: { error: String(error) },
    };
  }
}

/**
 * Check memory availability
 */
export function checkMemory(): CheckResult {
  const free = freemem();
  const total = totalmem();
  const used = total - free;
  const percent = Math.round((used / total) * 100);

  const freeGB = (free / 1024 / 1024 / 1024).toFixed(2);
  const totalGB = (total / 1024 / 1024 / 1024).toFixed(2);

  let status: 'pass' | 'warn' | 'fail' = 'pass';
  let suggestion: string | undefined;

  if (free < 256 * 1024 * 1024) {
    // Less than 256MB
    status = 'fail';
    suggestion = 'Very low memory available (less than 256MB)';
  } else if (free < 512 * 1024 * 1024) {
    // Less than 512MB
    status = 'warn';
    suggestion = 'Memory is running low (less than 512MB available)';
  }

  return {
    name: 'Memory',
    status,
    message: `${freeGB}GB available of ${totalGB}GB (${percent}% used)`,
    suggestion,
    metadata: { free, total, used, percent },
  };
}

/**
 * Check network connectivity
 */
export async function checkNetworkConnectivity(): Promise<CheckResult> {
  const hosts = [
    { host: 'google.com', port: 443, name: 'Internet' },
    { host: 'github.com', port: 443, name: 'GitHub' },
    { host: 'registry.npmjs.org', port: 443, name: 'npm Registry' },
  ];

  const results: { name: string; ok: boolean }[] = [];

  for (const target of hosts) {
    const ok = await new Promise<boolean>((resolve) => {
      const socket = new net.Socket();
      const timeout = setTimeout(() => {
        socket.destroy();
        resolve(false);
      }, 3000);

      socket.once('connect', () => {
        clearTimeout(timeout);
        socket.end();
        resolve(true);
      });

      socket.once('error', () => {
        clearTimeout(timeout);
        resolve(false);
      });

      socket.connect(target.port, target.host);
    });

    results.push({ name: target.name, ok });
  }

  const allOk = results.every((r) => r.ok);
  const someOk = results.some((r) => r.ok);

  return {
    name: 'Network Connectivity',
    status: allOk ? 'pass' : someOk ? 'warn' : 'fail',
    message: results.map((r) => `${r.name}: ${r.ok ? '✓' : '✗'}`).join(', '),
    suggestion: allOk
      ? undefined
      : 'Check your network connection and firewall settings',
    metadata: { results },
  };
}

/**
 * Check .hatago directory
 */
export async function checkHatagoDirectory(): Promise<CheckResult> {
  const hatagoDir = join(process.cwd(), '.hatago');

  if (!existsSync(hatagoDir)) {
    return {
      name: '.hatago Directory',
      status: 'fail',
      message: '.hatago directory not found',
      suggestion: 'Run "hatago init" to create the configuration directory',
    };
  }

  try {
    await access(hatagoDir, constants.R_OK | constants.W_OK);

    // Check for required files
    const configFile = join(hatagoDir, 'config.jsonc');
    const hasConfig = existsSync(configFile);

    if (!hasConfig) {
      return {
        name: '.hatago Directory',
        status: 'warn',
        message: '.hatago directory exists but config.jsonc is missing',
        suggestion: 'Run "hatago init" to create a configuration file',
      };
    }

    return {
      name: '.hatago Directory',
      status: 'pass',
      message: '.hatago directory is properly configured',
      metadata: { path: hatagoDir },
    };
  } catch (error) {
    return {
      name: '.hatago Directory',
      status: 'fail',
      message: '.hatago directory exists but is not accessible',
      suggestion: 'Check directory permissions',
      metadata: { error: String(error) },
    };
  }
}

/**
 * Check port availability
 */
export async function checkPortAvailability(
  port: number,
): Promise<CheckResult> {
  return new Promise((resolve) => {
    const server = net.createServer();

    server.once('error', (err: NodeJS.ErrnoException) => {
      if (err.code === 'EADDRINUSE') {
        resolve({
          name: `Port ${port}`,
          status: 'warn',
          message: `Port ${port} is already in use`,
          suggestion: 'Use a different port with --port option',
          metadata: { port },
        });
      } else {
        resolve({
          name: `Port ${port}`,
          status: 'fail',
          message: `Cannot check port ${port}: ${err.message}`,
          metadata: { port, error: err.message },
        });
      }
    });

    server.once('listening', () => {
      server.close();
      resolve({
        name: `Port ${port}`,
        status: 'pass',
        message: `Port ${port} is available`,
        metadata: { port },
      });
    });

    server.listen(port);
  });
}

/**
 * Check OS compatibility
 */
export function checkOSCompatibility(): CheckResult {
  const os = platform();
  const version = release();

  const supported = ['darwin', 'linux', 'win32'];
  const isSupported = supported.includes(os);

  return {
    name: 'Operating System',
    status: isSupported ? 'pass' : 'warn',
    message: `${os} ${version}`,
    suggestion: isSupported ? undefined : 'This OS may not be fully supported',
    metadata: { os, version },
  };
}
