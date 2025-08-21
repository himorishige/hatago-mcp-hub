/**
 * MCP command handlers for Claude Code compatible syntax
 */

import chalk from 'chalk';
import { Command } from 'commander';
import { z } from 'zod';
import { loadConfig } from '../../config/loader.js';
import type {
  LocalServerConfig,
  NpxServerConfig,
  RemoteServerConfig,
} from '../../config/types.js';
import type { ServerRegistry } from '../../servers/server-registry.js';
import type { CliRegistryStorage } from '../../storage/cli-registry-storage.js';
import { handleCliError, withRegistry } from '../helpers/registry-helper.js';

/**
 * Add MCP server command schema
 */
const _AddMcpSchema = z.object({
  name: z.string(),
  commandOrUrl: z.string(),
  args: z.array(z.string()).optional(),
  transport: z.enum(['http', 'sse']).optional(),
  env: z.record(z.string()).optional(),
  header: z.record(z.string()).optional(),
});

/**
 * Parse environment variables from array of KEY=VALUE strings
 */
function parseEnvVars(envArray?: string[]): Record<string, string> | undefined {
  if (!envArray || envArray.length === 0) return undefined;

  const env: Record<string, string> = {};
  for (const envVar of envArray) {
    const [key, ...valueParts] = envVar.split('=');
    if (key && valueParts.length > 0) {
      env[key] = valueParts.join('=');
    }
  }
  return Object.keys(env).length > 0 ? env : undefined;
}

/**
 * Parse headers from array of KEY:VALUE strings
 */
function parseHeaders(
  headerArray?: string[],
): Record<string, string> | undefined {
  if (!headerArray || headerArray.length === 0) return undefined;

  const headers: Record<string, string> = {};
  for (const header of headerArray) {
    const [key, ...valueParts] = header.split(':');
    if (key && valueParts.length > 0) {
      headers[key.trim()] = valueParts.join(':').trim();
    }
  }
  return Object.keys(headers).length > 0 ? headers : undefined;
}

/**
 * Create server configuration based on type
 */
function createServerConfig(
  type: 'local' | 'npx' | 'remote',
  config: {
    name: string;
    commandOrUrl: string;
    args: string[];
    transport?: 'http' | 'sse';
    env?: Record<string, string>;
    header?: Record<string, string>;
    autoRestart: boolean;
    maxRestarts: number;
  },
): LocalServerConfig | NpxServerConfig | RemoteServerConfig {
  const baseConfig = {
    id: config.name,
    start: 'lazy' as const,
    env: config.env,
    autoRestart: config.autoRestart,
    maxRestarts: config.maxRestarts,
  };

  switch (type) {
    case 'remote': {
      // Extract auth from headers if present
      let auth: RemoteServerConfig['auth'];
      if (config.header?.Authorization) {
        const authHeader = config.header.Authorization;
        if (authHeader.startsWith('Bearer ')) {
          auth = {
            type: 'bearer',
            token: authHeader.substring(7),
          };
        } else if (authHeader.startsWith('Basic ')) {
          auth = {
            type: 'basic',
            token: authHeader.substring(6),
          };
        }
      }

      return {
        ...baseConfig,
        type: 'remote',
        url: config.commandOrUrl,
        transport: 'http',
        auth,
      } as RemoteServerConfig;
    }

    case 'npx': {
      const command = config.commandOrUrl;
      let packageName: string;
      let packageArgs: string[] = [];

      if (command === 'npx') {
        // npx [-y] package [args...]
        const npxArgs = [...config.args];
        if (npxArgs[0] === '-y') {
          npxArgs.shift();
        }
        packageName = npxArgs[0] || '';
        packageArgs = npxArgs.slice(1);
      } else if (command === 'uvx') {
        // uvx --from package command [args...]
        const uvxArgs = [...config.args];
        if (uvxArgs[0] === '--from' && uvxArgs[1]) {
          packageName = uvxArgs[1];
          packageArgs = uvxArgs.slice(3);
        } else {
          packageName = uvxArgs[0] || '';
          packageArgs = uvxArgs.slice(1);
        }
      } else {
        // Other package runners (bunx, pipx, etc.) - treat as local
        return {
          ...baseConfig,
          type: 'local',
          command,
          args: config.args,
          transport: 'stdio',
        } as LocalServerConfig;
      }

      return {
        ...baseConfig,
        type: 'npx',
        package: packageName,
        args: packageArgs,
        transport: 'stdio',
      } as NpxServerConfig;
    }

    default: {
      // Local server
      return {
        ...baseConfig,
        type: 'local',
        command: config.commandOrUrl,
        args: config.args,
        transport: 'stdio',
      } as LocalServerConfig;
    }
  }
}

/**
 * Register server and save to CLI storage
 */
async function registerAndSaveServer(
  serverConfig: LocalServerConfig | NpxServerConfig | RemoteServerConfig,
  registry: ServerRegistry,
  cliStorage: CliRegistryStorage,
): Promise<void> {
  // Register with appropriate method
  let registered: { id: string };
  switch (serverConfig.type) {
    case 'remote':
      registered = await registry.registerRemoteServer(serverConfig);
      console.log(chalk.green(`✓ Added remote MCP server: ${registered.id}`));
      break;
    case 'npx':
      registered = await registry.registerNpxServer(serverConfig);
      console.log(chalk.green(`✓ Added NPX MCP server: ${registered.id}`));
      break;
    case 'local':
      registered = await registry.registerLocalServer(serverConfig);
      console.log(chalk.green(`✓ Added local MCP server: ${registered.id}`));
      break;
  }

  // Save to CLI registry
  await cliStorage.addServer(serverConfig);
  console.log(chalk.gray('✓ Saved to CLI registry'));
}

/**
 * Detect server type from command
 */
function detectServerType(
  command: string,
  transport?: string,
): 'npx' | 'local' | 'remote' {
  if (transport === 'http' || transport === 'sse') {
    return 'remote';
  }

  // Check if it's a URL
  if (command.startsWith('http://') || command.startsWith('https://')) {
    return 'remote';
  }

  // Check if it's npx or similar package runners
  if (
    command === 'npx' ||
    command === 'uvx' ||
    command === 'pipx' ||
    command === 'bunx' ||
    command === 'yarn' ||
    command === 'pnpm'
  ) {
    return 'npx'; // We'll use NpxMcpServer for all package runners
  }

  return 'local';
}

/**
 * Create MCP commands with Claude Code compatible syntax
 */
export function createMcpCommands(): Command {
  const mcp = new Command('mcp').description(
    'Manage MCP servers (Claude Code compatible)',
  );

  // Add command - Claude Code compatible syntax
  mcp
    .command('add <name> [commandOrUrl] [args...]')
    .description('Add a new MCP server')
    .option(
      '-t, --transport <type>',
      'Transport type (http|sse) for remote servers',
    )
    .option('-e, --env <vars...>', 'Environment variables (KEY=VALUE format)')
    .option(
      '-h, --header <headers...>',
      'Headers for remote servers (KEY:VALUE format)',
    )
    .option('--no-auto-restart', 'Disable automatic restart')
    .option('--max-restarts <number>', 'Maximum restart attempts', '3')
    .allowUnknownOption()
    .addHelpText(
      'after',
      `
Examples (Claude Code compatible):
  # NPX package server
  hatago mcp add filesystem -- npx -y @modelcontextprotocol/server-filesystem /path/to/dir
  
  # Python package with uvx
  hatago mcp add serena -- uvx --from serena-mcp serena-mcp /project/path
  
  # Local Node.js server
  hatago mcp add myserver -- node ./server.js
  
  # Local Python server
  hatago mcp add pyserver -- python ./server.py
  
  # Remote SSE server
  hatago mcp add --transport sse linear https://mcp.linear.app/sse
  
  # Remote HTTP server with auth
  hatago mcp add --transport http --header "Authorization:Bearer TOKEN" api https://api.example.com/mcp
  
  # With environment variables
  hatago mcp add --env API_KEY=secret database -- node ./db-server.js
`,
    )
    .action(
      async (
        name: string,
        commandOrUrl?: string,
        args?: string[],
        options?: Record<string, unknown>,
      ) => {
        try {
          // Handle the case where commandOrUrl might be in args due to -- separator
          let actualCommand = commandOrUrl;
          let actualArgs = args || [];

          // If no commandOrUrl but args exist, first arg is the command
          if (!actualCommand && actualArgs.length > 0) {
            actualCommand = actualArgs[0];
            actualArgs = actualArgs.slice(1);
          }

          if (!actualCommand) {
            throw new Error('Command or URL is required');
          }

          const config = {
            name,
            commandOrUrl: actualCommand,
            args: actualArgs,
            transport: options?.transport as 'http' | 'sse' | undefined,
            env: parseEnvVars(options?.env as string[] | undefined),
            header: parseHeaders(options?.header as string[] | undefined),
            autoRestart: options?.autoRestart !== false,
            maxRestarts: parseInt((options?.maxRestarts as string) || '3', 10),
          };

          const serverType = detectServerType(
            config.commandOrUrl,
            config.transport,
          );

          await withRegistry(async ({ registry, cliStorage }) => {
            // Create server configuration
            const serverConfig = createServerConfig(serverType, config);

            // Register and save
            await registerAndSaveServer(serverConfig, registry, cliStorage);

            // Start the server
            console.log(chalk.blue('Starting server...'));
            await registry.startServer(config.name);
            console.log(chalk.green(`✓ Server started successfully`));
          });
        } catch (error) {
          handleCliError(error);
        }
      },
    );

  // Remove command
  mcp
    .command('remove <name>')
    .description('Remove an MCP server')
    .action(async (name: string) => {
      try {
        await withRegistry(async ({ registry, cliStorage }) => {
          // Check if it's from CLI registry
          const isInCliRegistry = await cliStorage.hasServer(name);

          // Try to remove from server registry
          try {
            await registry.unregisterServer(name);
            console.log(chalk.green(`✓ Removed server: ${name}`));
          } catch (error) {
            // Server might not be running, but still in CLI registry
            if (!isInCliRegistry) {
              throw error;
            }
          }

          // Remove from CLI registry if it was there
          if (isInCliRegistry) {
            await cliStorage.removeServer(name);
            console.log(chalk.gray('✓ Removed from CLI registry'));
          } else {
            console.log(
              chalk.yellow(
                '⚠ Server was from config file (not removed from config)',
              ),
            );
          }
        });
      } catch (error) {
        handleCliError(error);
      }
    });

  // List command
  mcp
    .command('list')
    .description('List all MCP servers')
    .action(async () => {
      try {
        await withRegistry(async ({ registry, cliStorage }) => {
          const servers = registry.listServers();

          // Get metadata about which servers are from CLI
          const cliServers = await cliStorage.getServers();
          const cliServerIds = new Set(cliServers.map((s) => s.id));

          // Load config to see which are from config file
          const config = await loadConfig(undefined, { quiet: true });
          const configServerIds = new Set(config.servers.map((s) => s.id));

          if (servers.length === 0) {
            console.log(chalk.yellow('No MCP servers registered'));
            return;
          }

          console.log(chalk.bold('MCP Servers:'));
          for (const server of servers) {
            const status =
              server.state === 'running'
                ? chalk.green('● running')
                : chalk.gray('○ stopped');

            // Determine source
            let source = '';
            if (cliServerIds.has(server.id)) {
              source = chalk.cyan('[cli]');
            } else if (configServerIds.has(server.id)) {
              source = chalk.blue('[config]');
            }

            console.log(
              `  ${status} ${server.id} ${source} (${server.config.type})`,
            );
          }
        });
      } catch (error) {
        handleCliError(error);
      }
    });

  return mcp;
}
