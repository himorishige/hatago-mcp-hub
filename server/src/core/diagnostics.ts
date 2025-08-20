/**
 * Diagnostics engine for hatago doctor
 */

import { join } from 'node:path';
import { loadConfig } from '../config/loader.js';
import { validateProfileConfig } from '../config/validator.js';
import type { CheckResult } from '../utils/system-check.js';
import {
  checkDiskSpace,
  checkHatagoDirectory,
  checkMemory,
  checkNetworkConnectivity,
  checkNodeVersion,
  checkOSCompatibility,
  checkPackageManager,
  checkPortAvailability,
  checkRuntime,
} from '../utils/system-check.js';

export interface DiagnosticCategory {
  name: string;
  checks: CheckResult[];
}

export interface DiagnosticReport {
  timestamp: string;
  categories: DiagnosticCategory[];
  summary: {
    total: number;
    passed: number;
    warnings: number;
    failures: number;
  };
  suggestions: string[];
}

/**
 * Run all diagnostics
 */
export async function runDiagnostics(options: {
  profile?: string;
  port?: number;
  verbose?: boolean;
}): Promise<DiagnosticReport> {
  const categories: DiagnosticCategory[] = [];
  const allSuggestions: string[] = [];

  // System Requirements
  const systemChecks: CheckResult[] = [
    checkNodeVersion(),
    checkPackageManager(),
    checkRuntime(),
    checkOSCompatibility(),
  ];

  // Add async system checks
  systemChecks.push(await checkDiskSpace(), checkMemory());

  categories.push({
    name: 'System Requirements',
    checks: systemChecks,
  });

  // Network & Connectivity
  const networkChecks: CheckResult[] = [await checkNetworkConnectivity()];

  // Check port if specified
  if (options.port) {
    networkChecks.push(await checkPortAvailability(options.port));
  } else {
    // Check default ports
    networkChecks.push(await checkPortAvailability(3000));
  }

  categories.push({
    name: 'Network & Connectivity',
    checks: networkChecks,
  });

  // Configuration
  const configChecks: CheckResult[] = [];

  // Check .hatago directory
  const hatagoCheck = await checkHatagoDirectory();
  configChecks.push(hatagoCheck);

  // Check configuration validity if .hatago exists
  if (hatagoCheck.status === 'pass') {
    configChecks.push(await checkConfiguration(options.profile));

    // Check profiles if specified
    if (options.profile && options.profile !== 'default') {
      configChecks.push(await checkProfile(options.profile));
    }
  }

  categories.push({
    name: 'Configuration',
    checks: configChecks,
  });

  // MCP Servers (if config is valid)
  if (hatagoCheck.status === 'pass') {
    const mcpChecks = await checkMCPServers(options.profile);
    if (mcpChecks.length > 0) {
      categories.push({
        name: 'MCP Servers',
        checks: mcpChecks,
      });
    }
  }

  // Collect all suggestions
  for (const category of categories) {
    for (const check of category.checks) {
      if (check.suggestion) {
        allSuggestions.push(check.suggestion);
      }
    }
  }

  // Calculate summary
  let total = 0;
  let passed = 0;
  let warnings = 0;
  let failures = 0;

  for (const category of categories) {
    for (const check of category.checks) {
      total++;
      if (check.status === 'pass') passed++;
      else if (check.status === 'warn') warnings++;
      else if (check.status === 'fail') failures++;
    }
  }

  return {
    timestamp: new Date().toISOString(),
    categories,
    summary: {
      total,
      passed,
      warnings,
      failures,
    },
    suggestions: allSuggestions,
  };
}

/**
 * Check configuration validity
 */
async function checkConfiguration(profile?: string): Promise<CheckResult> {
  try {
    const config = await loadConfig(undefined, {
      quiet: true,
      profile: profile || 'default',
    });

    const validation = validateProfileConfig(config);

    if (!validation.valid) {
      return {
        name: 'Configuration Validity',
        status: 'fail',
        message: `Configuration has ${validation.errors.length} error(s)`,
        suggestion: `Fix configuration errors: ${validation.errors[0].message}`,
        metadata: { errors: validation.errors },
      };
    }

    if (validation.warnings.length > 0) {
      return {
        name: 'Configuration Validity',
        status: 'warn',
        message: `Configuration has ${validation.warnings.length} warning(s)`,
        suggestion: validation.warnings[0].message,
        metadata: { warnings: validation.warnings },
      };
    }

    return {
      name: 'Configuration Validity',
      status: 'pass',
      message: 'Configuration is valid',
      metadata: {
        servers: config.servers.length,
        profile: profile || 'default',
      },
    };
  } catch (error) {
    return {
      name: 'Configuration Validity',
      status: 'fail',
      message: `Failed to load configuration: ${error}`,
      suggestion: 'Check configuration file syntax',
      metadata: { error: String(error) },
    };
  }
}

/**
 * Check profile existence
 */
async function checkProfile(profileName: string): Promise<CheckResult> {
  const profilePath = join(
    process.cwd(),
    '.hatago',
    'profiles',
    `${profileName}.jsonc`,
  );

  try {
    const { existsSync } = await import('node:fs');

    if (!existsSync(profilePath)) {
      return {
        name: `Profile '${profileName}'`,
        status: 'fail',
        message: `Profile '${profileName}' not found`,
        suggestion: `Create profile at .hatago/profiles/${profileName}.jsonc`,
        metadata: { profilePath },
      };
    }

    // Try to load the profile
    const config = await loadConfig(undefined, {
      quiet: true,
      profile: profileName,
    });

    return {
      name: `Profile '${profileName}'`,
      status: 'pass',
      message: `Profile loaded successfully`,
      metadata: {
        servers: config.servers.length,
        profilePath,
      },
    };
  } catch (error) {
    return {
      name: `Profile '${profileName}'`,
      status: 'fail',
      message: `Failed to load profile: ${error}`,
      suggestion: 'Check profile configuration syntax',
      metadata: { error: String(error), profilePath },
    };
  }
}

/**
 * Check MCP servers connectivity
 */
async function checkMCPServers(profile?: string): Promise<CheckResult[]> {
  const checks: CheckResult[] = [];

  try {
    const config = await loadConfig(undefined, {
      quiet: true,
      profile: profile || 'default',
    });

    for (const server of config.servers) {
      let status: 'pass' | 'warn' | 'fail' = 'pass';
      let message = '';
      let suggestion: string | undefined;

      switch (server.type) {
        case 'npx':
          // Check if package exists
          try {
            const { execSync } = await import('node:child_process');
            execSync(`npm view ${server.package} version`, { stdio: 'ignore' });
            message = `NPX package '${server.package}' is available`;
          } catch {
            status = 'warn';
            message = `NPX package '${server.package}' may not exist`;
            suggestion = `Verify package name: npm view ${server.package}`;
          }
          break;

        case 'remote':
          // Basic URL validation
          if (server.url) {
            try {
              const url = new URL(server.url);
              message = `Remote server URL is valid: ${url.hostname}`;

              // Check if it's localhost and warn
              if (
                url.hostname === 'localhost' ||
                url.hostname === '127.0.0.1'
              ) {
                status = 'warn';
                suggestion = 'Ensure local server is running';
              }
            } catch {
              status = 'fail';
              message = `Invalid URL: ${server.url}`;
              suggestion = 'Check URL format';
            }
          } else {
            status = 'fail';
            message = 'Remote server missing URL';
            suggestion = 'Add "url" field to server configuration';
          }
          break;

        case 'local':
          // Check command existence
          if (server.command) {
            const cmd = server.command.split(' ')[0];
            try {
              const { execSync } = await import('node:child_process');
              execSync(`which ${cmd}`, { stdio: 'ignore' });
              message = `Command '${cmd}' is available`;
            } catch {
              status = 'fail';
              message = `Command '${cmd}' not found`;
              suggestion = `Install ${cmd} or check PATH`;
            }
          } else {
            status = 'fail';
            message = 'Local server missing command';
            suggestion = 'Add "command" field to server configuration';
          }
          break;

        default:
          status = 'warn';
          message = `Unknown server type: ${server.type}`;
          suggestion = 'Use "npx", "remote", or "local" as server type';
      }

      checks.push({
        name: `Server '${server.id}'`,
        status,
        message,
        suggestion,
        metadata: {
          type: server.type,
          id: server.id,
        },
      });
    }

    if (checks.length === 0) {
      checks.push({
        name: 'MCP Servers',
        status: 'warn',
        message: 'No servers configured',
        suggestion: 'Add servers to your configuration',
      });
    }
  } catch (error) {
    checks.push({
      name: 'MCP Servers',
      status: 'fail',
      message: `Failed to check servers: ${error}`,
      metadata: { error: String(error) },
    });
  }

  return checks;
}

/**
 * Format diagnostic report for console output
 */
export function formatDiagnosticReport(report: DiagnosticReport): string {
  const lines: string[] = [];

  // Header
  lines.push('🏮 Hatago Doctor - System Diagnostics');
  lines.push('=====================================');
  lines.push(`Timestamp: ${report.timestamp}`);
  lines.push('');

  // Categories
  for (const category of report.categories) {
    lines.push(`\n## ${category.name}`);
    lines.push('');

    for (const check of category.checks) {
      const icon =
        check.status === 'pass' ? '✅' : check.status === 'warn' ? '⚠️ ' : '❌';

      lines.push(`${icon} ${check.name}`);
      lines.push(`   ${check.message}`);

      if (check.suggestion) {
        lines.push(`   💡 ${check.suggestion}`);
      }
      lines.push('');
    }
  }

  // Summary
  lines.push('\n## Summary');
  lines.push('----------');
  lines.push(`Total checks: ${report.summary.total}`);
  lines.push(`✅ Passed: ${report.summary.passed}`);
  lines.push(`⚠️  Warnings: ${report.summary.warnings}`);
  lines.push(`❌ Failures: ${report.summary.failures}`);

  // Overall status
  lines.push('');
  if (report.summary.failures === 0 && report.summary.warnings === 0) {
    lines.push('🎉 All checks passed! Your system is ready.');
  } else if (report.summary.failures === 0) {
    lines.push('✓ System is operational with minor warnings.');
  } else {
    lines.push('⚠️  Please address the failures above before proceeding.');
  }

  // Suggestions summary
  if (report.suggestions.length > 0) {
    lines.push('\n## Recommended Actions');
    lines.push('---------------------');
    for (const suggestion of report.suggestions) {
      lines.push(`• ${suggestion}`);
    }
  }

  return lines.join('\n');
}
