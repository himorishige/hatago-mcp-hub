/**
 * Dev command - Development server with hot reload and enhanced debugging
 */

import { type ChildProcess, spawn } from 'node:child_process';
import { existsSync, statSync } from 'node:fs';
import { basename, dirname, resolve } from 'node:path';
import chalk from 'chalk';
import { watch } from 'chokidar';
import type { Command } from 'commander';
import { logger } from '../../observability/structured-logger.js';

interface DevServerOptions {
  type: 'stdio' | 'npx' | 'http';
  port: string;
  watch: string;
  reload: boolean;
  clear: boolean;
  args: string;
  cwd?: string;
  env?: string;
  inspect: boolean;
  inspectPort: string;
  delay: string;
  ignore: string;
  verbose: boolean;
}

export function createDevCommand(program: Command): void {
  program
    .command('dev')
    .description('🔥 Start development server with hot reload')
    .argument('[server]', 'MCP server file or package name')
    .option('-t, --type <type>', 'Server type: stdio, npx, http', 'stdio')
    .option('-p, --port <port>', 'HTTP port (for http type)', '8000')
    .option(
      '-w, --watch <patterns>',
      'Additional watch patterns (comma-separated)',
      '',
    )
    .option('--no-reload', 'Disable hot reload')
    .option('--no-clear', "Don't clear console on reload")
    .option('-a, --args <args>', 'Server arguments', '')
    .option('--cwd <dir>', 'Working directory')
    .option('--env <vars>', 'Environment variables (JSON or key=value)')
    .option('--inspect', 'Enable Node.js inspector for server')
    .option('--inspect-port <port>', 'Node.js inspector port', '9229')
    .option('--delay <ms>', 'Reload delay after file changes', '500')
    .option(
      '--ignore <patterns>',
      'Ignore patterns (comma-separated)',
      'node_modules/**,dist/**,.git/**',
    )
    .option('-v, --verbose', 'Verbose output')
    .action(async (serverTarget, options: DevServerOptions) => {
      try {
        await startDevServer(serverTarget, options);
      } catch (error) {
        logger.error('Dev server failed', { error });
        console.error(
          chalk.red('❌ Dev server failed:'),
          error instanceof Error ? error.message : error,
        );
        process.exit(1);
      }
    });
}

interface DevServerState {
  process?: ChildProcess;
  isRestarting: boolean;
  restartCount: number;
  startTime: number;
}

async function startDevServer(
  serverTarget: string,
  options: DevServerOptions,
): Promise<void> {
  const state: DevServerState = {
    isRestarting: false,
    restartCount: 0,
    startTime: Date.now(),
  };

  console.log(chalk.blue('🔥 Starting development server...'));

  if (!serverTarget) {
    console.error(chalk.red('❌ Server target is required'));
    console.log(chalk.gray('   Examples:'));
    console.log(chalk.gray('     hatago dev ./my-server.js'));
    console.log(chalk.gray('     hatago dev @myorg/mcp-server --type npx'));
    console.log(
      chalk.gray('     hatago dev http://localhost:8000/mcp --type http'),
    );
    return;
  }

  // Validate server target
  const serverInfo = await validateServerTarget(serverTarget, options);
  console.log(chalk.gray(`   Server: ${serverInfo.display}`));
  console.log(chalk.gray(`   Type: ${options.type}`));
  console.log(
    chalk.gray(`   Hot reload: ${options.reload ? 'enabled' : 'disabled'}`),
  );

  // Start initial server process
  await startServerProcess(serverTarget, options, state);

  // Set up file watching if hot reload is enabled
  if (options.reload) {
    await setupFileWatching(serverTarget, options, state);
  }

  // Handle graceful shutdown
  setupGracefulShutdown(state);

  // Keep process alive
  process.on('exit', () => {
    if (state.process) {
      state.process.kill();
    }
  });

  console.log(chalk.green('\n✅ Dev server started!'));
  console.log(chalk.blue('💡 Tips:'));
  console.log(chalk.gray('   • Press Ctrl+C to stop'));
  console.log(chalk.gray('   • Press R to manually restart'));
  if (options.reload) {
    console.log(chalk.gray('   • File changes will trigger automatic restart'));
  }

  // Set up manual restart on 'R' key press
  setupManualRestart(state, serverTarget, options);
}

async function validateServerTarget(
  serverTarget: string,
  options: DevServerOptions,
): Promise<{ display: string; exists: boolean }> {
  switch (options.type) {
    case 'stdio': {
      const resolvedPath = resolve(serverTarget);
      const exists = existsSync(resolvedPath);
      return {
        display: `${basename(serverTarget)} ${options.args || ''}`.trim(),
        exists,
      };
    }
    case 'npx': {
      return {
        display: `npx ${serverTarget} ${options.args || ''}`.trim(),
        exists: true, // Can't easily validate npx packages
      };
    }
    case 'http': {
      try {
        new URL(serverTarget);
        return {
          display: serverTarget,
          exists: true,
        };
      } catch {
        return {
          display: serverTarget,
          exists: false,
        };
      }
    }
    default:
      throw new Error(`Unsupported server type: ${options.type}`);
  }
}

async function startServerProcess(
  serverTarget: string,
  options: DevServerOptions,
  state: DevServerState,
): Promise<void> {
  if (state.process) {
    console.log(chalk.yellow('🔄 Stopping existing server...'));
    state.process.kill();
    await waitForProcessExit(state.process);
  }

  state.isRestarting = true;

  if (!options.clear) {
    if (state.restartCount > 0) {
      console.log(
        chalk.yellow(
          `\n🔄 Restarting server (restart #${state.restartCount})...`,
        ),
      );
    }
  } else if (state.restartCount > 0) {
    // Clear console
    process.stdout.write('\x1Bc');
    console.log(chalk.blue('🔥 Hatago Development Server'));
    console.log(
      chalk.gray(
        `   Restart #${state.restartCount} at ${new Date().toLocaleTimeString()}`,
      ),
    );
  }

  try {
    const { command, args, env } = buildServerCommand(serverTarget, options);

    if (options.verbose) {
      console.log(chalk.gray(`   Command: ${command} ${args.join(' ')}`));
    }

    state.process = spawn(command, args, {
      stdio: ['inherit', 'inherit', 'inherit'],
      env: { ...process.env, ...env },
      cwd: options.cwd || process.cwd(),
    });

    // Handle process events
    state.process.on('spawn', () => {
      console.log(
        chalk.green(`✅ Server started (PID: ${state.process?.pid})`),
      );
      state.isRestarting = false;
      state.restartCount++;
    });

    state.process.on('error', (error) => {
      console.error(chalk.red('❌ Server process error:'), error.message);
      state.isRestarting = false;
    });

    state.process.on('exit', (code, signal) => {
      if (!state.isRestarting) {
        if (code === 0) {
          console.log(chalk.yellow('⚠️  Server exited normally'));
        } else if (signal) {
          console.log(
            chalk.yellow(`⚠️  Server terminated by signal: ${signal}`),
          );
        } else {
          console.log(chalk.red(`❌ Server exited with code: ${code}`));
        }
      }
      state.process = undefined;
    });
  } catch (error) {
    console.error(
      chalk.red('❌ Failed to start server:'),
      error instanceof Error ? error.message : error,
    );
    state.isRestarting = false;
  }
}

function buildServerCommand(
  serverTarget: string,
  options: DevServerOptions,
): { command: string; args: string[]; env: Record<string, string> } {
  const env = parseEnvironmentVariables(options.env) || {};
  const userArgs = options.args ? options.args.split(' ').filter(Boolean) : [];

  switch (options.type) {
    case 'stdio': {
      const command = process.execPath; // Use current Node.js
      const args: string[] = [];

      // Add inspector options if requested
      if (options.inspect) {
        args.push(`--inspect=${options.inspectPort}`);
      }

      // Add server file and arguments
      args.push(resolve(serverTarget));
      args.push(...userArgs);

      return { command, args, env };
    }

    case 'npx': {
      const command = 'npx';
      const args = ['--yes', serverTarget, ...userArgs];
      return { command, args, env };
    }

    case 'http': {
      // For HTTP servers, we don't spawn a process but could set up a proxy
      throw new Error('HTTP dev mode not yet implemented - use stdio or npx');
    }

    default:
      throw new Error(`Unsupported server type: ${options.type}`);
  }
}

async function setupFileWatching(
  serverTarget: string,
  options: DevServerOptions,
  state: DevServerState,
): Promise<void> {
  const watchPatterns: string[] = [];
  const ignorePatterns = options.ignore.split(',').map((p: string) => p.trim());

  // Add server file/directory to watch patterns
  if (options.type === 'stdio') {
    const serverPath = resolve(serverTarget);
    if (existsSync(serverPath)) {
      const stats = statSync(serverPath);
      if (stats.isFile()) {
        // Watch the file and its directory
        watchPatterns.push(serverPath);
        watchPatterns.push(`${dirname(serverPath)}/**/*.{js,ts,json}`);
      } else if (stats.isDirectory()) {
        // Watch the entire directory
        watchPatterns.push(`${serverPath}/**/*.{js,ts,json}`);
      }
    }
  }

  // Add additional watch patterns
  if (options.watch) {
    watchPatterns.push(
      ...options.watch.split(',').map((p: string) => p.trim()),
    );
  }

  if (watchPatterns.length === 0) {
    console.log(
      chalk.yellow('⚠️  No watch patterns configured, hot reload disabled'),
    );
    return;
  }

  console.log(chalk.gray(`   Watching: ${watchPatterns.join(', ')}`));

  const watcher = watch(watchPatterns, {
    ignored: ignorePatterns,
    ignoreInitial: true,
    persistent: true,
  });

  let reloadTimeout: NodeJS.Timeout | undefined;

  watcher.on('change', (path) => {
    if (state.isRestarting) return;

    console.log(chalk.cyan(`📁 File changed: ${path}`));

    // Debounce restarts
    if (reloadTimeout) {
      clearTimeout(reloadTimeout);
    }

    reloadTimeout = setTimeout(
      async () => {
        console.log(chalk.blue('🔄 Reloading server...'));
        await startServerProcess(serverTarget, options, state);
      },
      parseInt(options.delay, 10),
    );
  });

  watcher.on('error', (error) => {
    console.error(chalk.red('❌ File watcher error:'), error.message);
  });

  // Clean up watcher on exit
  process.on('exit', () => {
    watcher.close();
  });
}

function setupManualRestart(
  state: DevServerState,
  serverTarget: string,
  options: DevServerOptions,
): void {
  // Set up raw mode to capture key presses
  if (process.stdin.isTTY) {
    process.stdin.setRawMode(true);
    process.stdin.resume();
    process.stdin.setEncoding('utf8');

    process.stdin.on('data', async (key) => {
      const keyStr = key.toString();

      if (keyStr === '\u0003' || keyStr === '\u0004') {
        // Ctrl+C or Ctrl+D
        process.exit(0);
      } else if (keyStr.toLowerCase() === 'r') {
        if (!state.isRestarting) {
          console.log(chalk.blue('\n🔄 Manual restart triggered...'));
          await startServerProcess(serverTarget, options, state);
        }
      } else if (keyStr === '\r' || keyStr === '\n') {
        // Enter - just show current status
        const uptime = Math.round((Date.now() - state.startTime) / 1000);
        console.log(
          chalk.blue(
            `\n📊 Server status: ${state.process ? 'running' : 'stopped'} (uptime: ${uptime}s, restarts: ${state.restartCount})`,
          ),
        );
      }
    });
  }
}

function setupGracefulShutdown(state: DevServerState): void {
  const shutdown = () => {
    console.log(chalk.yellow('\n👋 Shutting down dev server...'));

    if (state.process) {
      state.process.kill('SIGTERM');

      // Force kill after 5 seconds
      setTimeout(() => {
        if (state.process) {
          console.log(chalk.red('🔪 Force killing server process'));
          state.process.kill('SIGKILL');
        }
      }, 5000);
    }

    process.exit(0);
  };

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

function waitForProcessExit(process: ChildProcess): Promise<void> {
  return new Promise((resolve) => {
    if (process.exitCode !== null || process.killed) {
      resolve();
      return;
    }

    const cleanup = () => {
      process.removeListener('exit', onExit);
      resolve();
    };

    const onExit = () => {
      cleanup();
    };

    process.on('exit', onExit);

    // Timeout after 5 seconds
    setTimeout(cleanup, 5000);
  });
}

function parseEnvironmentVariables(
  envString?: string,
): Record<string, string> | undefined {
  if (!envString) return undefined;

  try {
    return JSON.parse(envString);
  } catch {
    const env: Record<string, string> = {};
    for (const pair of envString.split(',')) {
      const [key, ...valueParts] = pair.trim().split('=');
      if (key && valueParts.length > 0) {
        env[key] = valueParts.join('=');
      }
    }
    return Object.keys(env).length > 0 ? env : undefined;
  }
}
