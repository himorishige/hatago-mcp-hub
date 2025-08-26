/**
 * Serve command - Lightweight version
 */

import { serve } from '@hono/node-server';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import type { Command } from 'commander';
import { loadConfig } from '../../config/loader.js';
import type { HatagoConfig } from '../../config/types.js';
import { McpHub } from '../../core/mcp-hub.js';
import {
  LogLevel,
  logger,
  MinimalLogger,
  parseLogLevel,
} from '../../observability/minimal-logger.js';
import {
  createSecurityMiddleware,
  validateBindAddress,
} from '../../security/minimal-security.js';
import { ErrorHelpers } from '../../utils/errors.js';
import type { ServeOptions } from '../types/serve-options.js';

export function createServeCommand(program: Command): void {
  program
    .command('serve')
    .description('Start the MCP Hub server')
    .option('-c, --config <path>', 'Path to config file')
    .option('--profile <name>', 'Profile to use', 'default')
    .option('-p, --port <port>', 'HTTP port', '3000')
    .option('-m, --mode <mode>', 'Transport mode: stdio | http', 'stdio')
    .option('--http', 'Use HTTP mode instead of STDIO')
    .option('--bind <address>', 'Bind address', '127.0.0.1')
    .option('--allow-remote', 'Allow remote connections')
    .option('--shared-secret <secret>', 'Shared secret for authentication')
    .option('-q, --quiet', 'Suppress non-essential output')
    .option('-v, --verbose', 'Enable verbose logging')
    .option('--log-level <level>', 'Log level: error, warn, info, debug, trace')
    .option('--log-format <format>', 'Log format: json | human', 'human')
    .action(async (options) => {
      // Handle transport mode
      if (options.http) {
        options.mode = 'http';
      }

      try {
        // Setup logging
        setupLogging(options);

        // Load configuration
        const config = await loadAndValidateConfig(options);

        // Merge CLI servers if provided
        await mergeCLIServers(config);

        // Create and initialize hub
        const hub = new McpHub({ config });
        await hub.initialize();

        // Start appropriate transport mode
        if (options.mode === 'stdio') {
          await startStdioMode(hub, options);
        } else {
          await startHttpMode(hub, config, options);
        }

        // Setup shutdown handlers
        setupShutdownHandlers(hub);
      } catch (error) {
        await handleStartupError(error);
      }
    });
}

function setupLogging(options: ServeOptions): void {
  // IMMEDIATELY set STDIO mode flag and disable console output
  if (options.mode === 'stdio') {
    process.env.MCP_STDIO_MODE = 'true';

    // Disable ALL console output immediately
    if (!process.env.DEBUG && !process.env.MCP_DEBUG) {
      const noop = () => {};
      console.log = noop;
      console.error = noop;
      console.warn = noop;
      console.info = noop;
      console.debug = noop;
    }
  }

  // Set log level
  const level = parseLogLevel(
    options.logLevel ||
      (options.verbose ? 'debug' : options.quiet ? 'warn' : 'info'),
  );
  logger.setLevel(level);

  // In STDIO mode, disable most logging to avoid polluting MCP protocol
  if (options.mode === 'stdio') {
    // In STDIO mode, silence all logs unless DEBUG is enabled
    const stderrLevel =
      process.env.DEBUG === 'true' || process.env.MCP_DEBUG === 'true'
        ? parseLogLevel('debug')
        : LogLevel.NONE;
    const stderrLogger = new MinimalLogger(stderrLevel, 200, 'human', 'none');
    // Replace global logger
    Object.setPrototypeOf(logger, Object.getPrototypeOf(stderrLogger));
    Object.assign(logger, stderrLogger);

    // Disable all console output to prevent protocol pollution
    const originalConsoleError = console.error;
    const _originalConsoleLog = console.log;
    const _originalConsoleWarn = console.warn;

    console.error = (...args: any[]) => {
      // Only output in debug mode
      if (process.env.DEBUG === 'true' || process.env.MCP_DEBUG === 'true') {
        originalConsoleError(...args);
      }
      // Otherwise, completely silence console.error
    };

    console.log = (...args: any[]) => {
      // Never output to stdout in STDIO mode - it corrupts the protocol
      if (process.env.DEBUG === 'true' || process.env.MCP_DEBUG === 'true') {
        // In debug mode, redirect to stderr
        originalConsoleError('[LOG]', ...args);
      }
      // Otherwise, completely silence
    };

    console.warn = (...args: any[]) => {
      // Only output in debug mode (to stderr)
      if (process.env.DEBUG === 'true' || process.env.MCP_DEBUG === 'true') {
        originalConsoleError('[WARN]', ...args);
      }
      // Otherwise, completely silence
    };
  }

  // Log startup
  logger.info('Starting Hatago MCP Hub', {
    version: '0.2.0-lite',
    mode: options.mode || 'stdio',
  });
}

async function loadAndValidateConfig(
  options: ServeOptions,
): Promise<HatagoConfig> {
  if (!options.config) {
    logger.info('No config file specified, using defaults');
    return {
      version: 1,
      servers: [],
      logLevel: 'info',
      concurrency: { global: 10 },
      toolNaming: {
        format: '{server}_{tool}',
        strategy: 'namespace',
        separator: '_',
      },
      session: {
        timeout: 300000,
        keepAlive: true,
        maxSessions: 100,
      },
      security: {
        allowedOrigins: ['*'],
        enableAuth: false,
        rateLimit: {
          enabled: false,
          windowMs: 60000,
          maxRequests: 100,
        },
      },
      policy: {
        maxRequestSize: 10485760,
        timeout: 30000,
        retryPolicy: {
          enabled: false,
          maxRetries: 3,
          retryDelayMs: 1000,
        },
      },
      registry: {
        type: 'memory',
        persistence: {
          enabled: false,
        },
      },
      generation: {
        enabled: false,
      },
      rollover: {
        enabled: false,
        maxSize: 10485760,
        maxAge: 86400000,
        maxFiles: 5,
      },
      replication: {
        enabled: false,
      },
      sessionSharing: {
        enabled: false,
      },
      timeouts: {
        default: 30000,
        tool: 30000,
        resource: 30000,
        prompt: 30000,
      },
    } as unknown as HatagoConfig;
  }

  logger.info(`Loading config from: ${options.config}`);
  const config = await loadConfig(options.config, {
    profile: options.profile,
  });

  // Ensure servers array exists
  if (!config.servers) {
    config.servers = [];
  }

  return config;
}

async function mergeCLIServers(config: HatagoConfig): Promise<void> {
  const cliServers = process.env.HATAGO_CLI_SERVERS;
  if (!cliServers) return;

  try {
    const servers = JSON.parse(cliServers);
    if (Array.isArray(servers)) {
      config.servers = [...(config.servers || []), ...servers];
      logger.info(`Merged ${servers.length} servers from CLI`);
    }
  } catch (error) {
    logger.warn('Failed to parse CLI servers', { error });
  }
}

async function startStdioMode(
  hub: McpHub,
  _options: ServeOptions,
): Promise<void> {
  logger.info('Starting STDIO transport');

  const transport = new StdioServerTransport();
  const mcpServer = hub.getServer();

  await mcpServer.connect(transport);
  logger.info('STDIO transport connected');

  // Handle transport errors
  transport.onerror = (error) => {
    logger.error('STDIO transport error', { error });
    process.exit(1);
  };

  transport.onclose = () => {
    logger.info('STDIO transport closed');
    process.exit(0);
  };
}

async function startHttpMode(
  hub: McpHub,
  _config: HatagoConfig,
  options: ServeOptions,
): Promise<void> {
  const port = Number.parseInt(options.port || '3000', 10);
  const bindAddress = options.bind || '127.0.0.1';

  // Validate bind address for security
  validateBindAddress(bindAddress, options.allowRemote || false);

  logger.info(`Starting HTTP server on ${bindAddress}:${port}`);

  // Create HTTP app with security middleware
  const { Hono } = await import('hono');
  const app = new Hono();

  // Add minimal security
  app.use(
    '*',
    createSecurityMiddleware({
      bindAddress,
      allowRemote: options.allowRemote,
      sharedSecret: options.sharedSecret || process.env.HATAGO_TOKEN,
    }),
  );

  // Add health endpoint
  app.get('/health', (c) => c.json({ status: 'ok', version: '0.2.0-lite' }));

  // Setup MCP endpoints
  const { setupSessionEndpoints } = await import(
    '../utils/session-endpoints.js'
  );
  setupSessionEndpoints(app, hub);

  // Start server
  const _server = serve({
    fetch: app.fetch,
    port,
    hostname: bindAddress,
  });

  logger.info(`HTTP server started on http://${bindAddress}:${port}`);

  if (options.allowRemote) {
    logger.warn(
      'Remote connections are allowed. Ensure proper security measures are in place.',
    );
  }
}

function setupShutdownHandlers(hub: McpHub): void {
  const shutdown = async (signal: string) => {
    logger.info(`Received ${signal}, shutting down gracefully`);

    try {
      await hub.shutdown();
      logger.info('Hub shutdown complete');
      process.exit(0);
    } catch (error) {
      logger.error('Error during shutdown', { error });
      process.exit(1);
    }
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));

  // Handle uncaught errors
  process.on('uncaughtException', (error) => {
    logger.error('Uncaught exception', { error });
    logger.dumpRingBuffer();
    process.exit(1);
  });

  process.on('unhandledRejection', (reason) => {
    logger.error('Unhandled rejection', { reason });
    logger.dumpRingBuffer();
    process.exit(1);
  });
}

async function handleStartupError(error: unknown): Promise<never> {
  const errorInfo = ErrorHelpers.extract(error);
  logger.error('Failed to start server', { error: errorInfo });

  if (errorInfo.code === 'EADDRINUSE') {
    logger.error(
      'Port is already in use. Try a different port or stop the existing process.',
    );
  } else if (errorInfo.code === 'EACCES') {
    logger.error(
      'Permission denied. Try running with appropriate permissions or use a port > 1024.',
    );
  }

  process.exit(1);
}
