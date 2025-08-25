/**
 * Metrics command for v2 architecture
 */

import { Command } from 'commander';
import {
  exportPrometheus,
  getMetrics,
} from '../../../observability/metrics.js';
import { logger } from '../../../observability/structured-logger.js';

interface MetricsOptions {
  format: 'json' | 'prometheus' | 'table' | 'summary';
  filter?: string;
  watch: boolean;
  interval: string;
  export: boolean;
}

interface MetricValue {
  value: number | string | boolean;
  timestamp?: number;
  labels?: Record<string, string>;
}

export function createMetricsCommand(): Command {
  const metricsCmd = new Command('metrics')
    .description('📊 Display metrics from Hatago MCP Hub v2')
    .option(
      '--format <type>',
      'Output format: json, prometheus, table, summary',
      'summary',
    )
    .option('--filter <pattern>', 'Filter metrics by name pattern (regex)')
    .option('--watch', 'Watch metrics continuously')
    .option('--interval <ms>', 'Watch interval in milliseconds', '5000')
    .option('--export', 'Export metrics in Prometheus format')
    .action(async (options: MetricsOptions) => {
      try {
        if (options.export) {
          await exportMetrics();
        } else if (options.watch) {
          await watchMetrics(options);
        } else {
          await showMetrics(options);
        }
      } catch (error) {
        logger.error('Metrics command failed', { error });
        process.exit(1);
      }
    });

  // Add subcommands
  metricsCmd.addCommand(createMetricsExportCommand());
  metricsCmd.addCommand(createMetricsHistoryCommand());

  return metricsCmd;
}

async function showMetrics(options: MetricsOptions) {
  const metrics = getMetrics();

  // Apply filter if specified
  let filteredMetrics = metrics;
  if (options.filter) {
    const filterRegex = new RegExp(options.filter, 'i');
    filteredMetrics = Object.fromEntries(
      Object.entries(metrics).filter(([name]) => filterRegex.test(name)),
    );
  }

  switch (options.format) {
    case 'json':
      console.log(JSON.stringify(filteredMetrics, null, 2));
      break;

    case 'prometheus': {
      const prometheusOutput = await exportPrometheus();
      console.log(prometheusOutput);
      break;
    }

    case 'table':
      console.table(
        Object.entries(filteredMetrics).map(([name, value]) => ({
          Metric: name,
          Value: typeof value === 'object' ? JSON.stringify(value) : value,
          Type: typeof value,
        })),
      );
      break;
    default:
      printMetricsSummary(filteredMetrics);
      break;
  }
}

async function watchMetrics(options: MetricsOptions) {
  const interval = parseInt(options.interval, 10);

  console.log(`📊 Watching metrics (interval: ${interval}ms)`);
  console.log('Press Ctrl+C to stop\n');

  const showMetricsStatus = async () => {
    try {
      // Clear screen
      process.stdout.write('\x1Bc');
      console.log(
        `📊 Hatago MCP Hub Metrics - ${new Date().toLocaleString()}\n`,
      );

      await showMetrics({ ...options, watch: false });
    } catch (error) {
      console.error('❌ Metrics error:', error);
    }
  };

  // Initial display
  await showMetricsStatus();

  // Set up interval
  const watchInterval = setInterval(showMetricsStatus, interval);

  // Handle graceful shutdown
  process.on('SIGINT', () => {
    clearInterval(watchInterval);
    console.log('\n👋 Stopped watching metrics');
    process.exit(0);
  });
}

async function exportMetrics() {
  const prometheusOutput = await exportPrometheus();
  console.log(prometheusOutput);
}

function printMetricsSummary(metrics: Record<string, MetricValue>) {
  console.log('📊 Metrics Summary\n');

  // Group metrics by category
  const categories = {
    requests: {} as Record<string, MetricValue>,
    circuit_breaker: {} as Record<string, MetricValue>,
    health: {} as Record<string, MetricValue>,
    rate_limit: {} as Record<string, MetricValue>,
    system: {} as Record<string, MetricValue>,
    other: {} as Record<string, MetricValue>,
  };

  for (const [name, value] of Object.entries(metrics)) {
    if (name.includes('requests')) {
      categories.requests[name] = value;
    } else if (name.includes('circuit_breaker')) {
      categories.circuit_breaker[name] = value;
    } else if (name.includes('health')) {
      categories.health[name] = value;
    } else if (name.includes('rate_limit')) {
      categories.rate_limit[name] = value;
    } else if (
      name.includes('system') ||
      name.includes('memory') ||
      name.includes('cpu')
    ) {
      categories.system[name] = value;
    } else {
      categories.other[name] = value;
    }
  }

  // Print each category
  for (const [categoryName, categoryMetrics] of Object.entries(categories)) {
    if (Object.keys(categoryMetrics).length > 0) {
      console.log(`\n🔸 ${categoryName.replace('_', ' ').toUpperCase()}:`);

      for (const [name, value] of Object.entries(categoryMetrics)) {
        const displayName = name.replace(/^hatago_/, '').replace(/_/g, ' ');
        const displayValue = formatMetricValue(value);
        console.log(`  ${displayName}: ${displayValue}`);
      }
    }
  }

  console.log('');
}

function formatMetricValue(value: number | string | boolean): string {
  if (typeof value === 'number') {
    // Format large numbers with commas
    if (value >= 1000) {
      return value.toLocaleString();
    }
    // Round decimals to 2 places
    if (value % 1 !== 0) {
      return value.toFixed(2);
    }
    return value.toString();
  } else if (typeof value === 'object') {
    // For histogram/summary objects, show key stats
    if (value.count !== undefined && value.sum !== undefined) {
      const avg = value.count > 0 ? (value.sum / value.count).toFixed(2) : '0';
      return `count=${value.count} avg=${avg}`;
    }
    return JSON.stringify(value);
  }
  return String(value);
}

function createMetricsExportCommand(): Command {
  return new Command('export')
    .description('Export metrics in Prometheus format')
    .option('--output <file>', 'Output file (default: stdout)')
    .action(async (options) => {
      const prometheusOutput = await exportPrometheus();

      if (options.output) {
        const fs = await import('node:fs/promises');
        await fs.writeFile(options.output, prometheusOutput, 'utf-8');
        console.log(`✅ Metrics exported to ${options.output}`);
      } else {
        console.log(prometheusOutput);
      }
    });
}

function createMetricsHistoryCommand(): Command {
  return new Command('history')
    .description('Show metrics history (if available)')
    .option('--duration <time>', 'Duration to show (e.g., 1h, 30m, 5m)', '1h')
    .option('--metric <name>', 'Specific metric to show history for')
    .action(async (options) => {
      console.log('📈 Metrics History');

      if (options.metric) {
        console.log(`\nShowing history for: ${options.metric}`);
        console.log(`Duration: ${options.duration}`);
        console.log('\n⚠️  Metrics history not yet implemented');
        console.log(
          'This feature requires time-series storage to be configured.',
        );
      } else {
        console.log('\n⚠️  Metrics history not yet implemented');
        console.log(
          'This feature requires time-series storage to be configured.',
        );
        console.log('\nAvailable options:');
        console.log('  --metric <name>  Show history for specific metric');
        console.log('  --duration <time>  Duration to show (1h, 30m, 5m)');
      }
    });
}
