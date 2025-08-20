/**
 * Secret management command
 */

import { readFile } from 'node:fs/promises';
import chalk from 'chalk';
import { Command } from 'commander';
import { SecretManager } from '../../core/secret-manager.js';
import { createLogger } from '../../utils/logger.js';

/**
 * Create secret command
 */
export function createSecretCommand(): Command {
  const secret = new Command('secret').description('Manage secrets');

  /**
   * Initialize secret storage
   */
  secret
    .command('init')
    .description('Initialize secret storage')
    .option('--plain', 'Initialize in plain text mode (no encryption)')
    .action(async (options) => {
      try {
        const logger = createLogger({ component: 'hatago-secret' });
        const manager = new SecretManager({ logger });

        await manager.initialize({ plain: options.plain });

        if (options.plain) {
          console.log(
            chalk.yellow('⚠️  Secret storage initialized in PLAIN mode'),
          );
          console.log(
            chalk.yellow(
              '   Secrets will be stored in plain text. Use encryption for production.',
            ),
          );
        } else {
          console.log(
            chalk.green('🏮 Secret storage initialized with encryption'),
          );
          console.log(chalk.gray('   Master key stored in .hatago/master.key'));
          console.log(
            chalk.gray('   Keep this file safe and add it to .gitignore'),
          );
        }
      } catch (error) {
        console.error(chalk.red('Failed to initialize:'), error);
        process.exit(1);
      }
    });

  /**
   * Set a secret
   */
  secret
    .command('set <key> [value]')
    .description('Set a secret value')
    .option('--plain', 'Store in plain text (no encryption)')
    .option('--file <path>', 'Read value from file')
    .option('--label <label>', 'Add label to secret')
    .action(async (key, value, options) => {
      try {
        const logger = createLogger({ component: 'hatago-secret' });
        const manager = new SecretManager({ logger });

        await manager.initialize();

        // Get value from file if specified
        if (options.file) {
          value = await readFile(options.file, 'utf-8');
        }

        // Check if value is provided
        if (!value) {
          console.error(chalk.red('Value is required'));
          process.exit(1);
        }

        // Parse labels
        const labels = options.label ? [options.label] : undefined;

        // Set secret
        await manager.set(key, value, {
          plain: options.plain,
          labels,
        });

        console.log(
          chalk.green(`🏮 Secret '${key}' stored`),
          options.plain ? chalk.yellow('(plain)') : chalk.gray('(encrypted)'),
        );
      } catch (error) {
        console.error(chalk.red('Failed to set secret:'), error);
        process.exit(1);
      }
    });

  /**
   * Get a secret
   */
  secret
    .command('get <key>')
    .description('Get a secret value')
    .option('--show', 'Show actual value (default is masked)')
    .action(async (key, options) => {
      try {
        const logger = createLogger({ component: 'hatago-secret' });
        const manager = new SecretManager({ logger });

        await manager.initialize();

        const value = await manager.get(key);

        if (value === undefined) {
          console.error(chalk.red(`Secret '${key}' not found`));
          process.exit(1);
        }

        if (options.show) {
          console.log(value);
        } else {
          // Mask the value
          const masked =
            value.length > 4
              ? value.substring(0, 2) +
                '*'.repeat(Math.min(value.length - 4, 20)) +
                value.substring(value.length - 2)
              : '*'.repeat(value.length);
          console.log(chalk.gray(`${key}=`), chalk.yellow(masked));
          console.log(chalk.gray('Use --show to display actual value'));
        }
      } catch (error) {
        console.error(chalk.red('Failed to get secret:'), error);
        process.exit(1);
      }
    });

  /**
   * List all secrets
   */
  secret
    .command('list')
    .alias('ls')
    .description('List all secret keys')
    .option('--json', 'Output in JSON format')
    .action(async (options) => {
      try {
        const logger = createLogger({ component: 'hatago-secret' });
        const manager = new SecretManager({ logger });

        await manager.initialize();

        const secrets = await manager.list();

        if (options.json) {
          console.log(JSON.stringify(secrets, null, 2));
        } else {
          if (secrets.length === 0) {
            console.log(chalk.gray('No secrets found'));
          } else {
            console.log(chalk.bold('Secrets:'));
            console.log();

            for (const secret of secrets) {
              const icon = secret.encrypted ? '🔒' : '📝';
              const type = secret.encrypted
                ? chalk.green('encrypted')
                : chalk.yellow('plain');

              console.log(`${icon} ${chalk.bold(secret.key)} (${type})`);
              console.log(chalk.gray(`   Created: ${secret.created_at}`));
              if (secret.updated_at) {
                console.log(chalk.gray(`   Updated: ${secret.updated_at}`));
              }
              if (secret.labels && secret.labels.length > 0) {
                console.log(
                  chalk.gray(`   Labels: ${secret.labels.join(', ')}`),
                );
              }
              console.log();
            }

            // Show statistics
            const stats = manager.getStats();
            console.log(chalk.gray('─'.repeat(40)));
            console.log(
              chalk.gray(
                `Total: ${stats.total} | Encrypted: ${stats.encrypted} | Plain: ${stats.plain}`,
              ),
            );
          }
        }
      } catch (error) {
        console.error(chalk.red('Failed to list secrets:'), error);
        process.exit(1);
      }
    });

  /**
   * Remove a secret
   */
  secret
    .command('rm <key>')
    .alias('remove')
    .description('Remove a secret')
    .action(async (key) => {
      try {
        const logger = createLogger({ component: 'hatago-secret' });
        const manager = new SecretManager({ logger });

        await manager.initialize();

        const removed = await manager.remove(key);

        if (removed) {
          console.log(chalk.green(`🏮 Secret '${key}' removed`));
        } else {
          console.log(chalk.yellow(`Secret '${key}' not found`));
        }
      } catch (error) {
        console.error(chalk.red('Failed to remove secret:'), error);
        process.exit(1);
      }
    });

  /**
   * Clear all secrets
   */
  secret
    .command('clear')
    .description('Remove all secrets')
    .option('--force', 'Skip confirmation')
    .action(async (options) => {
      try {
        if (!options.force) {
          console.log(
            chalk.yellow('⚠️  This will remove ALL secrets permanently!'),
          );
          console.log(chalk.gray('Use --force to skip this confirmation'));
          process.exit(1);
        }

        const logger = createLogger({ component: 'hatago-secret' });
        const manager = new SecretManager({ logger });

        await manager.initialize();
        await manager.clear();

        console.log(chalk.green('🏮 All secrets cleared'));
      } catch (error) {
        console.error(chalk.red('Failed to clear secrets:'), error);
        process.exit(1);
      }
    });

  /**
   * Export secrets
   */
  secret
    .command('export')
    .description('Export all secrets')
    .option('--plain', 'Export in plain text (WARNING: insecure)')
    .option('--format <format>', 'Output format: json | env', 'json')
    .action(async (options) => {
      try {
        if (options.plain) {
          console.error(
            chalk.yellow('⚠️  WARNING: Exporting secrets in plain text'),
          );
        }

        const logger = createLogger({ component: 'hatago-secret' });
        const manager = new SecretManager({ logger });

        await manager.initialize();

        const exported = await manager.export({
          format: options.format,
        });

        console.log(exported);
      } catch (error) {
        console.error(chalk.red('Failed to export secrets:'), error);
        process.exit(1);
      }
    });

  /**
   * Import secrets
   */
  secret
    .command('import <file>')
    .description('Import secrets from file')
    .option('--plain', 'Store imported secrets in plain text')
    .option('--format <format>', 'Input format: json | env', 'json')
    .action(async (file, options) => {
      try {
        const data = await readFile(file, 'utf-8');

        const logger = createLogger({ component: 'hatago-secret' });
        const manager = new SecretManager({ logger });

        await manager.initialize();

        const count = await manager.import(data, {
          format: options.format,
          plain: options.plain,
        });

        console.log(chalk.green(`🏮 Imported ${count} secret(s)`));
      } catch (error) {
        console.error(chalk.red('Failed to import secrets:'), error);
        process.exit(1);
      }
    });

  /**
   * Rotate encryption keys
   */
  secret
    .command('rotate')
    .description('Rotate encryption keys')
    .option('--force', 'Skip confirmation')
    .action(async (options) => {
      try {
        if (!options.force) {
          console.log(chalk.yellow('⚠️  This will rotate all encryption keys'));
          console.log(
            chalk.yellow('   Make sure to backup .hatago/master.key first'),
          );
          console.log(chalk.gray('Use --force to skip this confirmation'));
          process.exit(1);
        }

        const logger = createLogger({ component: 'hatago-secret' });
        const manager = new SecretManager({ logger });

        await manager.initialize();
        await manager.rotate();

        console.log(chalk.green('🏮 Encryption keys rotated successfully'));
        console.log(
          chalk.gray('   New master key saved to .hatago/master.key'),
        );
      } catch (error) {
        console.error(chalk.red('Failed to rotate keys:'), error);
        process.exit(1);
      }
    });

  return secret;
}
