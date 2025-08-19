/**
 * NPX command handlers for the CLI
 */

import chalk from 'chalk';
import Table from 'cli-table3';
import { Command } from 'commander';
import { z } from 'zod';
import type { NpxServerConfig } from '../../config/types.js';
import {
  formatServerState,
  formatUptime,
  handleCliError,
  withRegistry,
} from '../helpers/registry-helper.js';

/**
 * Add NPX server command schema
 */
const AddNpxSchema = z.object({
  package: z.string(),
  id: z.string().optional(),
  version: z.string().optional(),
  args: z.array(z.string()).optional(),
  autoRestart: z.boolean().default(true),
  maxRestarts: z.number().default(3),
});

/**
 * Create NPX commands
 */
export function createNpxCommands(): Command {
  const npx = new Command('npx').description('Manage NPX MCP servers');

  // Add command
  npx
    .command('add <package>')
    .description('Add a new NPX MCP server')
    .option('-i, --id <id>', 'Server ID (defaults to package name)')
    .option('-v, --version <version>', 'Package version')
    .option('-a, --args <args...>', 'Additional arguments')
    .option('--no-auto-restart', 'Disable automatic restart')
    .option('--max-restarts <number>', 'Maximum restart attempts', '3')
    .action(async (packageName: string, options: unknown) => {
      try {
        const config = AddNpxSchema.parse({
          package: packageName,
          ...options,
        });

        // Generate server ID if not provided
        const serverId =
          config.id || packageName.replace(/[^a-zA-Z0-9_]/g, '_');

        await withRegistry(async ({ registry }) => {
          // Create NPX server configuration
          const serverConfig: NpxServerConfig = {
            id: serverId,
            type: 'npx',
            package: config.package,
            version: config.version,
            args: config.args,
            autoRestart: config.autoRestart,
            maxRestarts: config.maxRestarts,
          };

          // Register the server
          const registered = await registry.registerNpxServer(serverConfig);

          console.log(chalk.green(`✓ Added NPX server: ${registered.id}`));
          console.log(chalk.gray(`  Package: ${config.package}`));
          if (config.version) {
            console.log(chalk.gray(`  Version: ${config.version}`));
          }

          // Start the server
          console.log(chalk.blue('Starting server...'));
          await registry.startServer(registered.id);
          console.log(chalk.green(`✓ Server started successfully`));
        });
      } catch (error) {
        handleCliError(error);
      }
    });

  // Remove command
  npx
    .command('remove <id>')
    .description('Remove an NPX MCP server')
    .action(async (id: string) => {
      try {
        await withRegistry(async ({ registry }) => {
          // Unregister the server
          await registry.unregisterServer(id);

          console.log(chalk.green(`✓ Removed server: ${id}`));
        });
      } catch (error) {
        handleCliError(error);
      }
    });

  // List command
  npx
    .command('list')
    .description('List all NPX MCP servers')
    .action(async () => {
      try {
        await withRegistry(async ({ registry }) => {
          // Get all servers
          const servers = registry
            .listServers()
            .filter((s) => s.config.type === 'npx');

          if (servers.length === 0) {
            console.log(chalk.yellow('No NPX servers registered'));
            return;
          }

          // Create table
          const table = new Table({
            head: ['ID', 'Package', 'Version', 'State', 'Tools', 'Uptime'],
            style: {
              head: ['cyan'],
            },
          });

          for (const server of servers) {
            const config = server.config as NpxServerConfig;
            const uptime = server.instance?.getStats().uptime;

            table.push([
              server.id,
              config.package,
              config.version || 'latest',
              formatServerState(server.state),
              server.tools?.length || 0,
              formatUptime(uptime),
            ]);
          }

          console.log(table.toString());

          // Show statistics
          const stats = registry.getStats();
          console.log(chalk.gray(`\nTotal servers: ${stats.totalServers}`));
          console.log(chalk.gray(`Total tools: ${stats.totalTools}`));
        });
      } catch (error) {
        handleCliError(error);
      }
    });

  // Start command
  npx
    .command('start <id>')
    .description('Start an NPX MCP server')
    .action(async (id: string) => {
      try {
        await withRegistry(async ({ registry }) => {
          // Start the server
          await registry.startServer(id);

          console.log(chalk.green(`✓ Started server: ${id}`));
        });
      } catch (error) {
        handleCliError(error);
      }
    });

  // Stop command
  npx
    .command('stop <id>')
    .description('Stop an NPX MCP server')
    .action(async (id: string) => {
      try {
        await withRegistry(async ({ registry }) => {
          // Stop the server
          await registry.stopServer(id);

          console.log(chalk.green(`✓ Stopped server: ${id}`));
        });
      } catch (error) {
        handleCliError(error);
      }
    });

  // Restart command
  npx
    .command('restart <id>')
    .description('Restart an NPX MCP server')
    .action(async (id: string) => {
      try {
        await withRegistry(async ({ registry }) => {
          // Restart the server
          await registry.restartServer(id);

          console.log(chalk.green(`✓ Restarted server: ${id}`));
        });
      } catch (error) {
        handleCliError(error);
      }
    });

  // Status command
  npx
    .command('status <id>')
    .description('Show status of an NPX MCP server')
    .action(async (id: string) => {
      try {
        await withRegistry(async ({ registry }) => {
          // Get server
          const server = registry.getServer(id);

          if (!server) {
            console.error(chalk.red(`Server not found: ${id}`));
            process.exit(1);
          }

          const config = server.config as NpxServerConfig;

          // Display status
          console.log(chalk.bold('Server Information:'));
          console.log(chalk.gray('  ID:'), server.id);
          console.log(chalk.gray('  Package:'), config.package);
          console.log(chalk.gray('  Version:'), config.version || 'latest');
          console.log(chalk.gray('  State:'), formatServerState(server.state));
          console.log(
            chalk.gray('  Registered at:'),
            server.registeredAt.toISOString(),
          );

          if (server.lastHealthCheck) {
            console.log(
              chalk.gray('  Last health check:'),
              server.lastHealthCheck.toISOString(),
            );
          }

          if (server.instance) {
            const stats = server.instance.getStats();
            console.log(chalk.gray('  Process PID:'), stats.pid || '-');
            console.log(chalk.gray('  Restart count:'), stats.restartCount);

            if (stats.uptime) {
              console.log(chalk.gray('  Uptime:'), formatUptime(stats.uptime));
            }
          }

          if (server.tools && server.tools.length > 0) {
            console.log(chalk.bold('\nDiscovered Tools:'));
            for (const tool of server.tools) {
              console.log(chalk.gray('  -'), tool);
            }
          }
        });
      } catch (error) {
        handleCliError(error);
      }
    });

  return npx;
}
