/**
 * MCP command handlers for Claude Code compatible syntax
 */

import chalk from 'chalk';
import { Command } from 'commander';
import { z } from 'zod';
import type {
  LocalServerConfig,
  NpxServerConfig,
  RemoteServerConfig,
} from '../../config/types.js';
import type { ServerRegistry } from '../../servers/server-registry.js';
import type { UnifiedFileStorage } from '../../storage/unified-file-storage.js';
import { ErrorHelpers } from '../../utils/errors.js';
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
export function parseEnvVars(
  envArray?: string[],
): Record<string, string> | undefined {
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
export function parseHeaders(
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
export function createServerConfig(
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
  cliStorage: UnifiedFileStorage,
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
export function detectServerType(
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
    .command('add <name> [command...]')
    .description('Add a new MCP server')
    .option('--scope <scope>', 'Server scope (local|project|user)', 'local')
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
  # Local stdio server with NPX
  $ pnpm cli mcp add filesystem -- npx -y @modelcontextprotocol/server-filesystem /tmp
  
  # Local Node.js server
  $ pnpm cli mcp add myserver -- node ./server.js arg1 arg2
  
  # Local Python server
  $ pnpm cli mcp add pyserver -- python ./server.py --config config.json
  
  # Python package with uvx  
  $ pnpm cli mcp add serena -- uvx --from serena-mcp serena-mcp /project/path
  
  # Remote SSE server
  $ pnpm cli mcp add --transport sse linear https://mcp.linear.app/sse
  
  # Remote HTTP server with authentication
  $ pnpm cli mcp add --transport http --header "Authorization:Bearer TOKEN" api https://api.example.com/mcp
  
  # With environment variables
  $ pnpm cli mcp add --env API_KEY=secret --env DB_URL=postgres://localhost db -- node ./db-server.js
`,
    )
    .action(
      async (
        name: string,
        command?: string[],
        options?: Record<string, unknown>,
      ) => {
        try {
          // Process the command array
          let actualCommand: string | undefined;
          let actualArgs: string[] = [];

          if (command && command.length > 0) {
            // Claude Code format only: command is an array
            actualCommand = command[0];
            actualArgs = command.slice(1);
          }

          if (!actualCommand) {
            throw ErrorHelpers.commandOrUrlRequired();
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

  // Get command - show details of a single MCP server
  mcp
    .command('get <name>')
    .description('Get details of an MCP server')
    .option('--json', 'Output as JSON')
    .option('--probe', 'Connect and probe for tools')
    .action(
      async (name: string, options?: { json?: boolean; probe?: boolean }) => {
        try {
          await withRegistry(async ({ registry, cliStorage }) => {
            // Try to get server from registry
            const servers = registry.listServers();
            const server = servers.find((s) => s.id === name);

            if (!server) {
              throw new Error(`Server '${name}' not found`);
            }

            // Get metadata
            const cliServers = await cliStorage.getServers();
            const isCliServer = cliServers.some((s) => s.id === name);

            // Prepare server info
            const serverInfo: any = {
              name: server.id,
              type: server.config.type,
              status: server.state,
              source: isCliServer ? 'CLI' : 'Config',
            };

            // Add command details based on type
            if (server.config.type === 'local') {
              const config = server.config as LocalServerConfig;
              serverInfo.command = config.command;
              serverInfo.args = config.args;
              serverInfo.cwd = config.cwd;
            } else if (server.config.type === 'npx') {
              const config = server.config as NpxServerConfig;
              serverInfo.package = config.package;
              serverInfo.args = config.args;
            } else if (server.config.type === 'remote') {
              const config = server.config as RemoteServerConfig;
              serverInfo.url = config.url;
              serverInfo.transport = config.transport;
            }

            // Add environment variables (keys only)
            if (
              server.config.env &&
              Object.keys(server.config.env).length > 0
            ) {
              serverInfo.envKeys = Object.keys(server.config.env);
            }

            // Get tool count if running
            if (server.state === 'running') {
              try {
                const tools =
                  (await (server.instance as any)?.getTools?.()) ?? [];
                serverInfo.tools = tools ? tools.length : 0;
              } catch {
                serverInfo.tools = 'unavailable';
              }
            }

            // Probe for more details if requested
            if (options?.probe && server.state === 'running') {
              try {
                const tools =
                  (await (server.instance as any)?.getTools?.()) ?? [];
                if (tools && tools.length > 0) {
                  serverInfo.toolNames = tools
                    .map((t: any) => t.name)
                    .slice(0, 5);
                  if (tools.length > 5) {
                    serverInfo.toolNames.push(`... +${tools.length - 5} more`);
                  }
                }
              } catch (error) {
                serverInfo.probeError =
                  error instanceof Error ? error.message : 'Probe failed';
              }
            }

            // Output based on format
            if (options?.json) {
              console.log(JSON.stringify(serverInfo, null, 2));
            } else {
              // Text output
              console.log(
                chalk.bold(`
Server: ${serverInfo.name}`),
              );
              console.log(`Type: ${serverInfo.type}`);
              console.log(
                `Status: ${serverInfo.status === 'running' ? chalk.green('running') : chalk.gray('stopped')}`,
              );
              console.log(`Source: ${serverInfo.source}`);

              if (serverInfo.command) {
                console.log(
                  `Command: ${serverInfo.command} ${serverInfo.args?.join(' ') || ''}`,
                );
              }
              if (serverInfo.package) {
                console.log(`Package: ${serverInfo.package}`);
                if (serverInfo.args?.length) {
                  console.log(`Args: ${serverInfo.args.join(' ')}`);
                }
              }
              if (serverInfo.url) {
                console.log(`URL: ${serverInfo.url}`);
                console.log(`Transport: ${serverInfo.transport || 'http'}`);
              }
              if (serverInfo.cwd) {
                console.log(`Working Dir: ${serverInfo.cwd}`);
              }
              if (serverInfo.envKeys) {
                console.log(
                  `Env Variables: ${serverInfo.envKeys.join(', ')} (${serverInfo.envKeys.length} vars)`,
                );
              }
              if (serverInfo.tools !== undefined) {
                console.log(
                  `Tools: ${serverInfo.tools === 'unavailable' ? 'unavailable' : `${serverInfo.tools} tools`}`,
                );
              }
              if (serverInfo.toolNames) {
                console.log(`Tool Names: ${serverInfo.toolNames.join(', ')}`);
              }
              if (serverInfo.probeError) {
                console.log(chalk.red(`Probe Error: ${serverInfo.probeError}`));
              }
            }
          });
        } catch (error) {
          handleCliError(error);
        }
      },
    );

  // List command
  mcp
    .command('list')
    .description('List all MCP servers')
    .option('--json', 'Output as JSON')
    .action(async (options?: { json?: boolean }) => {
      try {
        await withRegistry(async ({ registry }) => {
          const servers = registry.listServers();

          if (servers.length === 0) {
            console.log(chalk.yellow('No MCP servers registered'));
            return;
          }

          // JSON output
          if (options?.json) {
            const serverList = await Promise.all(
              servers.map(async (server) => {
                let tools = 0;
                if (server.state === 'running') {
                  try {
                    const toolList =
                      (await (server.instance as any)?.getTools?.()) ?? [];
                    tools = toolList ? toolList.length : 0;
                  } catch {
                    // Ignore errors
                  }
                }
                return {
                  name: server.id,
                  status: server.state,
                  type: server.config.type,
                  tools,
                };
              }),
            );
            console.log(JSON.stringify(serverList, null, 2));
            return;
          }

          // Text output - simplified table format
          const maxNameLength = Math.max(...servers.map((s) => s.id.length), 4);

          // Get tool counts for running servers
          const toolCounts = new Map<string, number>();
          for (const server of servers) {
            if (server.state === 'running') {
              try {
                const tools =
                  (await (server.instance as any)?.getTools?.()) ?? [];
                toolCounts.set(server.id, tools ? tools.length : 0);
              } catch {
                toolCounts.set(server.id, 0);
              }
            }
          }

          // Print servers
          for (const server of servers) {
            const name = server.id.padEnd(maxNameLength + 2);
            const status =
              server.state === 'running'
                ? chalk.green('[running]')
                : chalk.gray('[stopped]');
            const type = server.config.type.padEnd(8);
            const tools = toolCounts.has(server.id)
              ? `${toolCounts.get(server.id)} tools`
              : '-';

            console.log(`${name}${status}  ${type}${tools}`);
          }
        });
      } catch (error) {
        handleCliError(error);
      }
    });

  return mcp;
}
