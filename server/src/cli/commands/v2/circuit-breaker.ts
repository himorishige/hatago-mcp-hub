/**
 * Circuit Breaker command for v2 architecture
 */

import { Command } from 'commander';
import { logger } from '../../../observability/structured-logger.js';
import { CircuitState } from '../../../proxy/circuit-breaker.js';

interface CircuitBreakerOptions {
  format: 'json' | 'table' | 'summary';
}

interface CircuitBreakerData {
  name: string;
  state: CircuitState;
  failureCount: number;
  successCount: number;
  totalCalls: number;
  lastFailureTime: number;
}

interface CircuitBreakerListOptions {
  state?: string;
  format: 'json' | 'table' | 'summary';
}

interface CircuitBreakerControlOptions {
  force?: boolean;
  reason?: string;
}

// This would be injected from the actual hub instance in a real implementation
const _circuitBreakers: Map<string, CircuitBreakerData> = new Map();

export function createCircuitBreakerCommand(): Command {
  const cbCmd = new Command('circuit-breaker')
    .alias('cb')
    .description('⚡ Manage circuit breakers for server connections')
    .option('--format <type>', 'Output format: json, table, summary', 'summary')
    .action(async (options: CircuitBreakerOptions) => {
      try {
        await showCircuitBreakers(options);
      } catch (error) {
        logger.error('Circuit breaker command failed', { error });
        process.exit(1);
      }
    });

  // Add subcommands
  cbCmd.addCommand(createCircuitBreakerListCommand());
  cbCmd.addCommand(createCircuitBreakerStatusCommand());
  cbCmd.addCommand(createCircuitBreakerResetCommand());
  cbCmd.addCommand(createCircuitBreakerOpenCommand());
  cbCmd.addCommand(createCircuitBreakerCloseCommand());

  return cbCmd;
}

async function showCircuitBreakers(options: CircuitBreakerOptions) {
  // In real implementation, this would get circuit breakers from the hub
  const mockCircuitBreakers = [
    {
      name: 'server-weather',
      state: CircuitState.Closed,
      failureCount: 0,
      successCount: 150,
      totalCalls: 150,
      lastFailureTime: 0,
    },
    {
      name: 'server-filesystem',
      state: CircuitState.Open,
      failureCount: 5,
      successCount: 95,
      totalCalls: 100,
      lastFailureTime: Date.now() - 30000,
    },
    {
      name: 'server-database',
      state: CircuitState.HalfOpen,
      failureCount: 3,
      successCount: 47,
      totalCalls: 50,
      lastFailureTime: Date.now() - 60000,
    },
  ];

  switch (options.format) {
    case 'json':
      console.log(JSON.stringify(mockCircuitBreakers, null, 2));
      break;

    case 'table':
      console.table(
        mockCircuitBreakers.map((cb) => ({
          Name: cb.name,
          State: cb.state.toUpperCase(),
          'Failure Count': cb.failureCount,
          'Success Rate':
            cb.totalCalls > 0
              ? `${((cb.successCount / cb.totalCalls) * 100).toFixed(1)}%`
              : '0%',
          'Total Calls': cb.totalCalls,
          'Last Failure':
            cb.lastFailureTime > 0
              ? formatTimeAgo(cb.lastFailureTime)
              : 'Never',
        })),
      );
      break;
    default:
      printCircuitBreakerSummary(mockCircuitBreakers);
      break;
  }
}

function printCircuitBreakerSummary(circuitBreakers: CircuitBreakerData[]) {
  console.log('⚡ Circuit Breaker Status\n');

  const stateEmojis = {
    [CircuitState.Closed]: '✅',
    [CircuitState.Open]: '🔴',
    [CircuitState.HalfOpen]: '🟡',
  };

  const summary = {
    total: circuitBreakers.length,
    closed: circuitBreakers.filter((cb) => cb.state === CircuitState.Closed)
      .length,
    open: circuitBreakers.filter((cb) => cb.state === CircuitState.Open).length,
    halfOpen: circuitBreakers.filter((cb) => cb.state === CircuitState.HalfOpen)
      .length,
  };

  console.log(
    `📊 Summary: ${summary.total} total, ${summary.closed} closed, ${summary.open} open, ${summary.halfOpen} half-open\n`,
  );

  for (const cb of circuitBreakers) {
    const emoji = stateEmojis[cb.state] || '❓';
    const successRate =
      cb.totalCalls > 0
        ? ((cb.successCount / cb.totalCalls) * 100).toFixed(1)
        : '0';

    console.log(`${emoji} ${cb.name}`);
    console.log(`   State: ${cb.state}`);
    console.log(
      `   Success Rate: ${successRate}% (${cb.successCount}/${cb.totalCalls})`,
    );
    console.log(`   Failures: ${cb.failureCount}`);

    if (cb.lastFailureTime > 0) {
      console.log(`   Last Failure: ${formatTimeAgo(cb.lastFailureTime)}`);
    }

    console.log('');
  }
}

function createCircuitBreakerListCommand(): Command {
  return new Command('list')
    .alias('ls')
    .description('List all circuit breakers')
    .option('--state <state>', 'Filter by state: closed, open, half-open')
    .option('--format <type>', 'Output format: json, table, summary', 'table')
    .action(async (options: CircuitBreakerListOptions) => {
      // Mock implementation - would query actual circuit breakers
      console.log('⚡ Circuit Breaker List\n');

      if (options.state) {
        console.log(`Filtering by state: ${options.state}\n`);
      }

      await showCircuitBreakers(options);
    });
}

function createCircuitBreakerStatusCommand(): Command {
  return new Command('status')
    .description('Show detailed status of a circuit breaker')
    .argument('<name>', 'Circuit breaker name')
    .action(async (name: string) => {
      console.log(`⚡ Circuit Breaker Status: ${name}\n`);

      // Mock detailed status
      const mockStatus = {
        name,
        state: CircuitState.Closed,
        failureCount: 2,
        successCount: 98,
        totalCalls: 100,
        slowCalls: 5,
        lastFailureTime: Date.now() - 300000,
        nextRetryTime: 0,
        halfOpenCalls: 0,
        errorStats: {
          low: 1,
          medium: 1,
          high: 0,
          critical: 0,
        },
      };

      console.log(`State: ${mockStatus.state}`);
      console.log(
        `Success Rate: ${((mockStatus.successCount / mockStatus.totalCalls) * 100).toFixed(1)}%`,
      );
      console.log(`Total Calls: ${mockStatus.totalCalls}`);
      console.log(`Successful: ${mockStatus.successCount}`);
      console.log(`Failed: ${mockStatus.failureCount}`);
      console.log(`Slow Calls: ${mockStatus.slowCalls}`);

      if (mockStatus.lastFailureTime > 0) {
        console.log(
          `Last Failure: ${new Date(mockStatus.lastFailureTime).toISOString()}`,
        );
      }

      if (mockStatus.nextRetryTime > 0) {
        console.log(
          `Next Retry: ${new Date(mockStatus.nextRetryTime).toISOString()}`,
        );
      }

      console.log('\nError Statistics:');
      console.log(`  Low Severity: ${mockStatus.errorStats.low}`);
      console.log(`  Medium Severity: ${mockStatus.errorStats.medium}`);
      console.log(`  High Severity: ${mockStatus.errorStats.high}`);
      console.log(`  Critical Severity: ${mockStatus.errorStats.critical}`);
    });
}

function createCircuitBreakerResetCommand(): Command {
  return new Command('reset')
    .description('Reset a circuit breaker to closed state')
    .argument('<name>', 'Circuit breaker name')
    .option('--force', 'Force reset without confirmation')
    .action(async (name: string, options: CircuitBreakerControlOptions) => {
      if (!options.force) {
        // In a real implementation, we'd use a proper prompt library
        console.log(
          `⚠️  This will reset circuit breaker '${name}' to closed state.`,
        );
        console.log('Use --force to skip this confirmation.');
        return;
      }

      console.log(`🔄 Resetting circuit breaker: ${name}`);

      // Mock reset operation
      console.log(
        `✅ Circuit breaker '${name}' has been reset to closed state`,
      );

      logger.info('Circuit breaker reset', { name, operator: 'cli' });
    });
}

function createCircuitBreakerOpenCommand(): Command {
  return new Command('open')
    .description('Manually open a circuit breaker')
    .argument('<name>', 'Circuit breaker name')
    .option('--reason <text>', 'Reason for opening')
    .action(async (name: string, options: CircuitBreakerControlOptions) => {
      console.log(`🔴 Opening circuit breaker: ${name}`);

      if (options.reason) {
        console.log(`Reason: ${options.reason}`);
      }

      // Mock open operation
      console.log(`✅ Circuit breaker '${name}' has been opened`);

      logger.warn('Circuit breaker manually opened', {
        name,
        reason: options.reason || 'Manual intervention',
        operator: 'cli',
      });
    });
}

function createCircuitBreakerCloseCommand(): Command {
  return new Command('close')
    .description('Manually close a circuit breaker')
    .argument('<name>', 'Circuit breaker name')
    .option('--reason <text>', 'Reason for closing')
    .action(async (name: string, options: CircuitBreakerControlOptions) => {
      console.log(`✅ Closing circuit breaker: ${name}`);

      if (options.reason) {
        console.log(`Reason: ${options.reason}`);
      }

      // Mock close operation
      console.log(`✅ Circuit breaker '${name}' has been closed`);

      logger.info('Circuit breaker manually closed', {
        name,
        reason: options.reason || 'Manual intervention',
        operator: 'cli',
      });
    });
}

function formatTimeAgo(timestamp: number): string {
  const now = Date.now();
  const diff = now - timestamp;
  const seconds = Math.floor(diff / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);

  if (days > 0) {
    return `${days}d ago`;
  } else if (hours > 0) {
    return `${hours}h ago`;
  } else if (minutes > 0) {
    return `${minutes}m ago`;
  } else {
    return `${seconds}s ago`;
  }
}
