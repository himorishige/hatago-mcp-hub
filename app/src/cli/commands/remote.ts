/**
 * Remote command handlers for the CLI
 */

import chalk from 'chalk';
import Table from 'cli-table3';
import { Command } from 'commander';
import { z } from 'zod';
import type { RemoteServerConfig } from '../../config/types.js';
import type { RemoteMcpServer } from '../../servers/remote-mcp-server.js';
import {
  formatServerState,
  formatUptime,
  handleCliError,
  withRegistry,
} from '../helpers/registry-helper.js';

/**
 * Add Remote server command schema
 */
const AddRemoteSchema = z.object({
  url: z.string().url(),
  id: z.string().optional(),
  transport: z.enum(['http', 'sse']).optional(),
  authType: z.enum(['bearer', 'basic']).optional(),
  authToken: z.string().optional(),
});

/**
 * Create Remote commands
 */
export function createRemoteCommands(): Command {
  const remote = new Command('remote').description('Manage remote MCP servers');

  // Add command
  remote
    .command('add <url>')
    .description('Add a new remote MCP server')
    .option('-i, --id <id>', 'Server ID (defaults to hostname)')
    .option('-t, --transport <transport>', 'Transport type (http|sse)')
    .option('--auth-type <type>', 'Authentication type (bearer|basic)')
    .option('--auth-token <token>', 'Authentication token')
    .action(async (url: string, options: unknown) => {
      try {
        const config = AddRemoteSchema.parse({
          url,
          ...options,
        });

        // Generate server ID if not provided
        const serverId =
          config.id || new URL(config.url).hostname.replace(/\./g, '_');

        await withRegistry(async ({ registry }) => {
          // Create Remote server configuration
          const serverConfig: RemoteServerConfig = {
            id: serverId,
            type: 'remote',
            url: config.url,
            transport: config.transport || 'http',
            auth:
              config.authType && config.authToken
                ? {
                    type: config.authType,
                    token: config.authToken,
                  }
                : undefined,
          };

          // Register the server
          const registered = await registry.registerRemoteServer(serverConfig);

          console.log(chalk.green(`✓ Added remote server: ${registered.id}`));
          console.log(chalk.gray(`  URL: ${config.url}`));
          if (config.transport) {
            console.log(chalk.gray(`  Transport: ${config.transport}`));
          }
          if (config.authType) {
            console.log(chalk.gray(`  Auth: ${config.authType}`));
          }

          // Start the server
          console.log(chalk.blue('Connecting to server...'));
          await registry.startServer(registered.id);
          console.log(chalk.green(`✓ Connected successfully`));
        });
      } catch (error) {
        handleCliError(error);
      }
    });

  // Remove command
  remote
    .command('remove <id>')
    .description('Remove a remote MCP server')
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
  remote
    .command('list')
    .description('List all remote MCP servers')
    .action(async () => {
      try {
        await withRegistry(async ({ registry }) => {
          // Get all servers
          const servers = registry
            .listServers()
            .filter((s) => s.config.type === 'remote');

          if (servers.length === 0) {
            console.log(chalk.yellow('No remote servers registered'));
            return;
          }

          // Create table
          const table = new Table({
            head: ['ID', 'URL', 'Transport', 'State', 'Tools', 'Uptime'],
            style: {
              head: ['cyan'],
            },
          });

          for (const server of servers) {
            const config = server.config as RemoteServerConfig;
            const stats =
              server.instance && 'getStats' in server.instance
                ? (server.instance as RemoteMcpServer).getStats()
                : undefined;

            table.push([
              server.id,
              config.url,
              config.transport || 'http',
              formatServerState(server.state),
              server.tools?.length || 0,
              formatUptime(stats?.uptime),
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
  remote
    .command('start <id>')
    .description('Connect to a remote MCP server')
    .action(async (id: string) => {
      try {
        await withRegistry(async ({ registry }) => {
          // Start the server
          await registry.startServer(id);

          console.log(chalk.green(`✓ Connected to server: ${id}`));
        });
      } catch (error) {
        handleCliError(error);
      }
    });

  // Stop command
  remote
    .command('stop <id>')
    .description('Disconnect from a remote MCP server')
    .action(async (id: string) => {
      try {
        await withRegistry(async ({ registry }) => {
          // Stop the server
          await registry.stopServer(id);

          console.log(chalk.green(`✓ Disconnected from server: ${id}`));
        });
      } catch (error) {
        handleCliError(error);
      }
    });

  // Restart command
  remote
    .command('restart <id>')
    .description('Restart connection to a remote MCP server')
    .action(async (id: string) => {
      try {
        await withRegistry(async ({ registry }) => {
          // Restart the server
          await registry.restartServer(id);

          console.log(chalk.green(`✓ Reconnected to server: ${id}`));
        });
      } catch (error) {
        handleCliError(error);
      }
    });

  // Status command
  remote
    .command('status <id>')
    .description('Show status of a remote MCP server')
    .action(async (id: string) => {
      try {
        await withRegistry(async ({ registry }) => {
          // Get server
          const server = registry.getServer(id);

          if (!server) {
            console.error(chalk.red(`Server not found: ${id}`));
            process.exit(1);
          }

          const config = server.config as RemoteServerConfig;

          // Display status
          console.log(chalk.bold('Server Information:'));
          console.log(chalk.gray('  ID:'), server.id);
          console.log(chalk.gray('  URL:'), config.url);
          console.log(chalk.gray('  Transport:'), config.transport || 'http');
          console.log(chalk.gray('  State:'), formatServerState(server.state));
          console.log(
            chalk.gray('  Registered at:'),
            server.registeredAt.toISOString(),
          );

          if (config.auth) {
            console.log(chalk.gray('  Auth type:'), config.auth.type);
          }

          if (server.lastHealthCheck) {
            console.log(
              chalk.gray('  Last health check:'),
              server.lastHealthCheck.toISOString(),
            );
          }

          if (server.instance && 'getStats' in server.instance) {
            const stats = (server.instance as RemoteMcpServer).getStats();
            console.log(chalk.gray('  Reconnect count:'), stats.reconnectCount);

            if (stats.uptime) {
              console.log(chalk.gray('  Uptime:'), formatUptime(stats.uptime));
            }

            if (stats.transportType) {
              console.log(
                chalk.gray('  Active transport:'),
                stats.transportType,
              );
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

  return remote;
}
