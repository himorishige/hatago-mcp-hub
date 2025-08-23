/**
 * Doctor command for system diagnostics
 */

import chalk from 'chalk';
import type { Command } from 'commander';
import {
  formatDiagnosticReport,
  runDiagnostics,
} from '../../core/diagnostics.js';

/**
 * Create doctor command
 */
export function createDoctorCommand(program: Command): void {
  program
    .command('doctor')
    .description('Run system diagnostics and environment checks')
    .option('--profile <name>', 'Profile to check', 'default')
    .option('-p, --port <port>', 'Port to check availability')
    .option('-v, --verbose', 'Show detailed information')
    .option('--json', 'Output in JSON format')
    .action(async (options) => {
      try {
        console.log(chalk.blue('🏮 Running Hatago diagnostics...\n'));

        // Run diagnostics
        const report = await runDiagnostics({
          profile: options.profile,
          port: options.port ? parseInt(options.port, 10) : undefined,
          verbose: options.verbose,
        });

        // Output format
        if (options.json) {
          console.log(JSON.stringify(report, null, 2));
        } else {
          console.log(formatDiagnosticReport(report));

          // Add color to console output
          if (report.summary.failures > 0) {
            console.log(
              chalk.red(
                '\n⚠️  Some checks failed. Please review the issues above.',
              ),
            );
          } else if (report.summary.warnings > 0) {
            console.log(
              chalk.yellow(
                '\n⚠️  Some warnings detected. Consider addressing them.',
              ),
            );
          } else {
            console.log(chalk.green('\n✅ All systems operational!'));
          }
        }

        // Exit code based on failures
        if (report.summary.failures > 0) {
          process.exit(1);
        }
      } catch (error) {
        console.error(chalk.red('Failed to run diagnostics:'), error);
        process.exit(1);
      }
    });
}
