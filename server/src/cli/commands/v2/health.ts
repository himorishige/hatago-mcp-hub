/**
 * Health command for v2 architecture
 */

import { Command } from 'commander';
import {
  getHealth,
  healthMonitor,
} from '../../../observability/health-monitor.js';
import { logger } from '../../../observability/structured-logger.js';

interface HealthOptions {
  format: 'json' | 'table' | 'summary';
  watch: boolean;
  interval: string;
}

interface HealthProbesOptions {
  format: 'json' | 'table';
}

interface HealthData {
  state: string;
  startedAt: number;
  readyAt?: number;
  lastCheck: number;
  message?: string;
  summary: {
    total: number;
    ready: number;
    failing: number;
    failed: number;
  };
  components: Record<string, HealthComponent>;
}

interface HealthComponent {
  state: string;
  lastCheck: number;
  message?: string;
  probes: Record<string, ProbeResult>;
}

interface ProbeResult {
  success: boolean;
  message?: string;
  latencyMs?: number;
  metadata?: Record<string, unknown>;
}

export function createHealthCommand(): Command {
  const healthCmd = new Command('health')
    .description('🏥 Check health status of Hatago MCP Hub v2')
    .option('--format <type>', 'Output format: json, table, summary', 'summary')
    .option('--watch', 'Watch health status continuously')
    .option('--interval <ms>', 'Watch interval in milliseconds', '5000')
    .action(async (options: HealthOptions) => {
      try {
        if (options.watch) {
          await watchHealth(options);
        } else {
          await showHealth(options);
        }
      } catch (error) {
        logger.error('Health check failed', { error });
        process.exit(1);
      }
    });

  // Add subcommands
  healthCmd.addCommand(createHealthProbesCommand());
  healthCmd.addCommand(createHealthStatusCommand());

  return healthCmd;
}

async function showHealth(options: HealthOptions) {
  const health = getHealth();

  switch (options.format) {
    case 'json':
      console.log(JSON.stringify(health, null, 2));
      break;

    case 'table':
      console.table([
        {
          Component: 'Overall',
          Status: health.state,
          Ready: health.readyAt
            ? new Date(health.readyAt).toISOString()
            : 'N/A',
          Message: health.message || '',
        },
        ...Object.entries(health.components).map(([name, component]) => ({
          Component: name,
          Status: component.state,
          'Last Check': new Date(component.lastCheck).toISOString(),
          Message: component.message || '',
        })),
      ]);
      break;
    default:
      printHealthSummary(health);
      break;
  }

  // Exit with error code if not healthy
  if (health.state !== 'ready') {
    process.exit(1);
  }
}

async function watchHealth(options: HealthOptions) {
  const interval = parseInt(options.interval, 10);

  console.log(`🔄 Watching health status (interval: ${interval}ms)`);
  console.log('Press Ctrl+C to stop\n');

  const showHealthStatus = async () => {
    try {
      // Clear screen
      process.stdout.write('\x1Bc');
      console.log(
        `🏥 Hatago MCP Hub Health Status - ${new Date().toLocaleString()}\n`,
      );

      const health = await healthMonitor.check();
      printHealthSummary(health);
    } catch (error) {
      console.error('❌ Health check error:', error);
    }
  };

  // Initial check
  await showHealthStatus();

  // Set up interval
  const watchInterval = setInterval(showHealthStatus, interval);

  // Handle graceful shutdown
  process.on('SIGINT', () => {
    clearInterval(watchInterval);
    console.log('\n👋 Stopped watching health status');
    process.exit(0);
  });
}

function printHealthSummary(health: HealthData) {
  const stateEmoji = {
    ready: '✅',
    starting: '🟡',
    'not-ready': '🟠',
    failing: '🔴',
    failed: '💥',
    unknown: '❓',
  };

  console.log(
    `${stateEmoji[health.state] || '❓'} Overall Status: ${health.state.toUpperCase()}`,
  );

  if (health.startedAt) {
    const uptimeMs = Date.now() - health.startedAt;
    const uptimeStr = formatDuration(uptimeMs);
    console.log(`⏱️  Uptime: ${uptimeStr}`);
  }

  if (health.readyAt) {
    const readyTime = formatDuration(health.readyAt - health.startedAt);
    console.log(`🚀 Ready in: ${readyTime}`);
  }

  console.log(
    `📊 Components: ${health.summary.total} total, ${health.summary.ready} ready, ${health.summary.failing} failing, ${health.summary.failed} failed`,
  );

  if (health.summary.failing > 0 || health.summary.failed > 0) {
    console.log('\n🔍 Component Details:');

    for (const [name, component] of Object.entries(health.components)) {
      if (component.state !== 'ready') {
        const emoji = stateEmoji[component.state] || '❓';
        console.log(`  ${emoji} ${name}: ${component.state}`);

        if (component.message) {
          console.log(`    └─ ${component.message}`);
        }

        // Show failed probes
        for (const [probeName, result] of Object.entries(component.probes)) {
          if (!result.success) {
            console.log(`    └─ ${probeName}: ${result.message}`);
          }
        }
      }
    }
  }

  console.log('');
}

function createHealthProbesCommand(): Command {
  return new Command('probes')
    .description('List health probes')
    .option('--format <type>', 'Output format: json, table', 'table')
    .action(async (options: HealthProbesOptions) => {
      const health = getHealth();
      const probes: Array<{
        Component: string;
        Probe: string;
        Status: string;
        Message: string;
        'Latency (ms)': number;
      }> = [];

      for (const [componentName, component] of Object.entries(
        health.components,
      )) {
        for (const [probeName, result] of Object.entries(component.probes)) {
          probes.push({
            Component: componentName,
            Probe: probeName,
            Status: result.success ? 'PASS' : 'FAIL',
            Message: result.message || '',
            'Latency (ms)': result.latencyMs || 0,
          });
        }
      }

      if (options.format === 'json') {
        console.log(JSON.stringify(probes, null, 2));
      } else {
        console.table(probes);
      }
    });
}

function createHealthStatusCommand(): Command {
  return new Command('status')
    .description('Show detailed health status')
    .action(async () => {
      const health = getHealth();

      console.log('🏥 Detailed Health Status\n');

      console.log('Overall:');
      console.log(`  State: ${health.state}`);
      console.log(`  Started: ${new Date(health.startedAt).toISOString()}`);
      if (health.readyAt) {
        console.log(`  Ready: ${new Date(health.readyAt).toISOString()}`);
      }
      console.log(`  Last Check: ${new Date(health.lastCheck).toISOString()}`);

      console.log('\nComponents:');
      for (const [name, component] of Object.entries(health.components)) {
        console.log(`\n  ${name}:`);
        console.log(`    State: ${component.state}`);
        console.log(
          `    Last Check: ${new Date(component.lastCheck).toISOString()}`,
        );

        console.log('    Probes:');
        for (const [probeName, result] of Object.entries(component.probes)) {
          const status = result.success ? '✅' : '❌';
          console.log(
            `      ${status} ${probeName}: ${result.message || 'OK'}`,
          );

          if (result.latencyMs) {
            console.log(`        Latency: ${result.latencyMs}ms`);
          }

          if (result.metadata) {
            console.log(`        Metadata: ${JSON.stringify(result.metadata)}`);
          }
        }
      }
    });
}

function formatDuration(ms: number): string {
  const seconds = Math.floor(ms / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);

  if (days > 0) {
    return `${days}d ${hours % 24}h ${minutes % 60}m`;
  } else if (hours > 0) {
    return `${hours}h ${minutes % 60}m ${seconds % 60}s`;
  } else if (minutes > 0) {
    return `${minutes}m ${seconds % 60}s`;
  } else {
    return `${seconds}s`;
  }
}
