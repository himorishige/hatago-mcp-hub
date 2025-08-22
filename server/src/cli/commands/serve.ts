/**
 * Serve command - Start the MCP Hub server (Refactored)
 */

import { serve } from '@hono/node-server';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import type { CallToolRequest } from '@modelcontextprotocol/sdk/types.js';
import type { Command } from 'commander';
import type { Logger } from 'pino';
import { loadConfig } from '../../config/loader.js';
import type { HatagoConfig } from '../../config/types.js';
import type { FileWatcher } from '../../core/file-watcher.js';
import { McpHub } from '../../core/mcp-hub.js';
import { ErrorHelpers } from '../../utils/errors.js';
import type { ServeOptions } from '../types/serve-options.js';

export function createServeCommand(program: Command): void {
  program
    .command('serve')
    .description('Start the MCP Hub server')
    .option('-c, --config <path>', 'Path to config file')
    .option(
      '--profile <name>',
      'Profile to use (default: "default")',
      'default',
    )
    .option('-p, --port <port>', 'HTTP port', '3000')
    .option('-m, --mode <mode>', 'Transport mode: stdio | http', 'stdio')
    .option('--http', 'Use HTTP mode instead of STDIO')
    .option('-q, --quiet', 'Suppress non-essential output')
    .option('-v, --verbose', 'Enable verbose logging')
    .option('--log-level <level>', 'Log level: error, warn, info, debug, trace')
    .option('--log-format <format>', 'Log format: json | pretty')
    .action(async (options) => {
      try {
        const reqLogger = await setupLogger(options);
        const config = await loadAndValidateConfig(options, reqLogger);
        await mergeCLIServers(config, reqLogger);

        const hub = new McpHub({ config, logger: reqLogger });
        await hub.initialize();

        const fileWatcher = await setupHotReload(
          config,
          options,
          hub,
          reqLogger,
        );

        // Start appropriate transport mode
        if (options.mode === 'stdio') {
          await startStdioMode(hub, reqLogger, options);
        } else {
          await startHttpMode(hub, config, reqLogger, options.port);
        }

        setupShutdownHandlers(hub, fileWatcher, reqLogger);
      } catch (error) {
        await handleStartupError(error);
      }
    });
}

async function setupLogger(options: ServeOptions): Promise<Logger> {
  const { createLogger, createRequestLogger, getLogLevel, setGlobalLogger } =
    await import('../../utils/logger.js');

  // STDIO mode console redirect
  if (options.mode === 'stdio') {
    const originalConsoleError = console.error;
    console.log = (...args: unknown[]) => {
      originalConsoleError('[STDIO-REDIRECT]', ...args);
    };
    console.warn = (...args: unknown[]) => {
      originalConsoleError('[STDIO-REDIRECT-WARN]', ...args);
    };
    options.quiet = true;
    options.logLevel = 'silent';
  }

  const logLevel = getLogLevel({
    verbose: options.verbose,
    quiet: options.quiet,
    logLevel: options.logLevel,
  });

  const logger = createLogger({
    level: logLevel,
    format: options.logFormat,
    profile: options.profile,
    component: 'hatago-cli',
    destination: options.mode === 'stdio' ? process.stderr : process.stdout,
  });

  setGlobalLogger(logger);

  return createRequestLogger(logger, {
    cmd: 'serve',
    profile: options.profile,
  });
}

async function loadAndValidateConfig(
  options: ServeOptions,
  logger: Logger,
): Promise<HatagoConfig> {
  if (options.http) {
    options.mode = 'http';
  }

  logger.info({ mode: options.mode }, '🏨 Starting Hatago MCP Hub');

  const config = await loadConfig(options.config, {
    quiet: options.quiet,
    profile: options.profile,
  });

  // Validate profile configuration
  const { validateProfileConfig } = await import('../../config/validator.js');
  const validationResult = validateProfileConfig(config);

  if (!validationResult.valid) {
    validationResult.errors.forEach((error) => {
      logger.error({ path: error.path }, error.message);
    });
    throw ErrorHelpers.invalidConfiguration();
  }

  if (validationResult.warnings.length > 0) {
    validationResult.warnings.forEach((warning) => {
      logger.warn({ path: warning.path }, warning.message);
    });
  }

  // Override port if specified
  if (options.port && config.http) {
    config.http.port = parseInt(options.port, 10);
  }

  return config;
}

async function mergeCLIServers(
  config: HatagoConfig,
  logger: Logger,
): Promise<void> {
  const { CliRegistryStorage } = await import(
    '../../storage/cli-registry-storage.js'
  );
  const cliStorage = new CliRegistryStorage('.hatago/cli-registry.json');
  await cliStorage.initialize();
  const cliServers = await cliStorage.getServers();

  const configServerIds = new Set(config.servers.map((s) => s.id));
  for (const cliServer of cliServers) {
    if (!configServerIds.has(cliServer.id)) {
      config.servers.push(cliServer);
      logger.info(`Added CLI server: ${cliServer.id}`);
    } else {
      logger.warn(
        `CLI server '${cliServer.id}' skipped (name conflict with config)`,
      );
    }
  }
}

async function setupHotReload(
  config: HatagoConfig,
  options: ServeOptions,
  hub: McpHub,
  logger: Logger,
): Promise<FileWatcher | null> {
  if (!config.generation?.autoReload) {
    return null;
  }

  const { FileWatcher } = await import('../../core/file-watcher.js');
  const fileWatcher = new FileWatcher({
    watchPaths: config.generation.watchPaths || ['.hatago/config.jsonc'],
    debounceMs: 2000,
  });

  fileWatcher.on('config:changed', async (event: { path: string }) => {
    logger.info({ path: event.path }, '🔄 Config changed, reloading...');

    try {
      await hub.shutdown();

      const newConfig = await loadConfig(
        options.config || '.hatago/config.jsonc',
        {
          quiet: options.quiet,
          profile: options.profile,
        },
      );

      hub = new McpHub({ config: newConfig, logger });
      await hub.initialize();

      logger.info('✅ Hub reloaded successfully');
    } catch (error) {
      logger.error({ error }, '❌ Failed to reload hub');
    }
  });

  await fileWatcher.start();
  logger.info(
    { paths: fileWatcher.getWatchPaths() },
    '👁️ Watching config files for changes',
  );

  return fileWatcher;
}

async function startStdioMode(
  hub: McpHub,
  logger: Logger,
  options: ServeOptions,
): Promise<void> {
  logger.info({ profile: options.profile }, `🏨 MCP Hub running in STDIO mode`);

  process.stderr.write('[DEBUG] Creating StdioServerTransport...\n');
  const transport = new StdioServerTransport();
  process.stderr.write('[DEBUG] Transport created\n');

  // Debug: Intercept MCP server tool calls
  const server = hub.getServer();
  const originalCallTool = server.callTool;
  if (originalCallTool) {
    server.callTool = async function (request: CallToolRequest) {
      console.error(
        `[DEBUG STDIO] Tool call request:`,
        JSON.stringify(request),
      );
      const result = await originalCallTool.call(this, request);
      console.error(
        `[DEBUG STDIO] Tool call response:`,
        JSON.stringify(result).substring(0, 200),
      );
      return result;
    };
  }

  process.stderr.write('[DEBUG] Connecting transport to server...\n');
  await hub.getServer().server.connect(transport);
  process.stderr.write('[DEBUG] Transport connected successfully\n');
}

async function startHttpMode(
  hub: McpHub,
  config: HatagoConfig,
  logger: Logger,
  portOption?: string,
): Promise<void> {
  const { createHttpApp, setupReadinessCheck, getPort } = await import(
    '../utils/http-app-factory.js'
  );
  const { setupSessionEndpoints } = await import(
    '../utils/session-endpoints.js'
  );

  // Create HTTP application
  const app = createHttpApp(hub, config, logger);

  // Setup readiness checks
  await setupReadinessCheck(app, hub, config, logger);

  // Setup MCP session endpoints
  setupSessionEndpoints(app, hub, logger);

  // Get port configuration
  const port = getPort(config, portOption);

  // Start server
  serve(
    {
      fetch: app.fetch,
      port,
    },
    (info) => {
      logger.info(
        { port: info.port, url: `http://localhost:${info.port}` },
        `🏨 MCP Hub is running on http://localhost:${info.port}`,
      );
    },
  );
}

function setupShutdownHandlers(
  hub: McpHub,
  fileWatcher: FileWatcher | null,
  logger: Logger,
): void {
  const shutdown = async (signal: string) => {
    logger.info(`Received ${signal}, shutting down...`);
    if (fileWatcher) {
      await fileWatcher.stop();
    }
    await hub.shutdown();
    process.exit(0);
  };

  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));
}

async function handleStartupError(error: unknown): Promise<never> {
  const { logError, getGlobalLogger } = await import('../../utils/logger.js');
  const logger = getGlobalLogger();
  logError(logger, error, 'Failed to start server');
  process.exit(1);
}
