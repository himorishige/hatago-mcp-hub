#!/usr/bin/env node
/**
 * Hatago MCP Hub - CLI Entry Point
 *
 * This is the main entry point for npx execution.
 * Provides subcommands for server management and configuration.
 */

import { startServer, generateDefaultConfig } from '@himorishige/hatago-server';
import { Command } from 'commander';
import { readFileSync, existsSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join, isAbsolute, resolve } from 'node:path';
import { homedir } from 'node:os';
import { createInterface } from 'node:readline';

// Get package version
const __dirname = dirname(fileURLToPath(import.meta.url));
const packageJson = JSON.parse(readFileSync(join(__dirname, '../../package.json'), 'utf-8')) as {
  version: string;
};

// Simple .env loader (no external deps) [SF][DM]
function loadDotEnv(file = '.env') {
  try {
    const cwd = process.cwd();
    const path = resolve(cwd, file);
    if (!existsSync(path)) return;

    const raw = readFileSync(path, 'utf-8');
    for (const line of raw.split(/\r?\n/)) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const eq = trimmed.indexOf('=');
      if (eq === -1) continue;
      const key = trimmed.slice(0, eq).trim();
      let val = trimmed.slice(eq + 1).trim();

      // Remove optional quotes
      if (
        (val.startsWith('"') && val.endsWith('"')) ||
        (val.startsWith("'") && val.endsWith("'"))
      ) {
        val = val.slice(1, -1);
      }
      // Only set if not already defined
      if (key && process.env[key] === undefined) {
        process.env[key] = val;
      }
    }
  } catch {
    // ignore parsing failures to keep CLI robust [REH]
  }
}

// Preload env from .env in CWD
loadDotEnv();

// Create CLI program
const program = new Command();

program
  .name('hatago')
  .description('🏮 Hatago MCP Hub - Unified MCP server management')
  .version((packageJson as { version: string }).version);

// --- helpers: env file loading (no external deps) ---
function expandPath(path: string): string {
  if (!path) return path;
  if (path.startsWith('~/')) return resolve(homedir(), path.slice(2));
  return isAbsolute(path) ? path : resolve(process.cwd(), path);
}

function parseEnv(content: string): Record<string, string> {
  const result: Record<string, string> = {};
  const lines = content.split(/\r?\n/);
  for (const raw of lines) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    const withoutExport = line.startsWith('export ') ? line.slice('export '.length).trim() : line;
    const eq = withoutExport.indexOf('=');
    if (eq <= 0) continue;
    const key = withoutExport.slice(0, eq).trim();
    let val = withoutExport.slice(eq + 1).trim();
    // strip surrounding quotes
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1);
    }
    // basic escapes
    val = val.replace(/\\n/g, '\n').replace(/\\r/g, '\r').replace(/\\t/g, '\t');
    result[key] = val;
  }
  return result;
}

function loadEnvFile(path: string): Record<string, string> {
  const abs = expandPath(path);
  if (!existsSync(abs)) {
    throw new Error(`${abs} not found`);
  }
  const content = readFileSync(abs, 'utf-8');
  return parseEnv(content);
}

function applyEnv(vars: Record<string, string>, override: boolean): void {
  for (const [k, v] of Object.entries(vars)) {
    if (override || process.env[k] === undefined) {
      process.env[k] = v;
    }
  }
}

// Init command
program
  .command('init')
  .description('Create a default hatago.config.json file')
  .option('-c, --config <path>', 'Path to configuration file', './hatago.config.json')
  .option('-f, --force', 'Overwrite existing configuration file')
  .option('-m, --mode <mode>', 'Integration mode (stdio or http)')
  .action(async (options: unknown) => {
    const opts = options as { config?: string; force?: boolean; mode?: string };
    const configPath = opts.config ?? './hatago.config.json';
    const force = opts.force ?? false;

    // Check if file already exists
    if (existsSync(configPath) && !force) {
      console.error(`❌ Configuration file already exists: ${configPath}`);
      console.error('   Use --force to overwrite');
      process.exit(1);
    }

    try {
      // Determine mode
      let mode = opts.mode;

      // If mode not specified, ask the user
      if (!mode) {
        const rl = createInterface({
          input: process.stdin,
          output: process.stdout
        });

        const answer = await new Promise<string>((resolve) => {
          console.log('\nSelect integration mode:');
          console.log('1) STDIO mode (for Claude Code, Cursor, etc.)');
          console.log('2) HTTP mode (for development/debugging)');
          console.log('');
          rl.question('Enter your choice [1-2] (default: 1): ', (input) => {
            rl.close();
            resolve(input.trim() || '1');
          });
        });

        mode = answer === '2' ? 'http' : 'stdio';
      }

      // Generate default config
      const defaultConfig = generateDefaultConfig();

      // Write to file
      writeFileSync(configPath, defaultConfig);

      console.log(`\n✅ Created configuration file: ${configPath}`);
      console.log('');
      console.log('Next steps:');
      console.log(`1. Edit ${configPath} to configure your MCP servers`);
      console.log('2. Run the server:');

      if (mode === 'stdio') {
        console.log(`   hatago serve --stdio --config ${configPath}`);
        console.log('');
        console.log('For Claude Code integration, add to your .mcp.json:');
        console.log(
          JSON.stringify(
            {
              mcpServers: {
                hatago: {
                  command: 'npx',
                  args: ['@himorishige/hatago-mcp-hub', 'serve', '--stdio', '--config', configPath]
                }
              }
            },
            null,
            2
          )
        );
      } else {
        console.log(`   hatago serve --http --config ${configPath}`);
        console.log('');
        console.log('For HTTP mode testing:');
        console.log('  - Default endpoint: http://127.0.0.1:3535/mcp');
        console.log('  - SSE endpoint: http://127.0.0.1:3535/sse');
        console.log('  - Health check: http://127.0.0.1:3535/health');
        console.log('');
        console.log('You can use MCP Inspector to test:');
        console.log('  https://inspector.mcphub.com/');
      }

      // Exit successfully
      process.exit(0);
    } catch (error) {
      console.error(
        `❌ Failed to create configuration file: ${error instanceof Error ? error.message : String(error)}`
      );
      process.exit(1);
    }
  });

// Serve command
program
  .command('serve')
  .description('Start Hatago MCP Hub server')
  .option('--stdio', 'Run in STDIO mode (default)')
  .option('--http', 'Run in HTTP mode')
  .option('-c, --config <path>', 'Path to configuration file')
  .option('-p, --port <port>', 'Port for HTTP mode', '3535')
  .option('-h, --host <host>', 'Host for HTTP mode', '127.0.0.1')
  .option('--verbose', 'Enable verbose logging')
  .option('--quiet', 'Minimize output')
  .option('--watch', 'Watch configuration file for changes')
  .option('--tags <tags>', 'Filter servers by tags (comma-separated)')
  .option('--env-file <path...>', 'Load environment variables from file(s) before start')
  .option('--env-override', 'Override existing environment variables from env-file(s)')
  .action(async (options: unknown) => {
    try {
      const opts = options as {
        http?: boolean;
        config?: string;
        port?: string;
        host?: string;
        verbose?: boolean;
        quiet?: boolean;
        watch?: boolean;
        tags?: string;
        envFile?: string | string[];
        envOverride?: boolean;
      };

      // Determine mode
      const mode = opts.http ? 'http' : 'stdio';

      // Set log level
      const logLevel = opts.verbose ? 'debug' : opts.quiet ? 'error' : 'info';

      // Parse tags if provided
      const tags = opts.tags ? opts.tags.split(',').map((t) => t.trim()) : undefined;

      // Load environment variables from --env-file before any config handling
      const envFiles = Array.isArray(opts.envFile)
        ? opts.envFile
        : opts.envFile
          ? [opts.envFile]
          : [];
      if (envFiles.length > 0) {
        const override = !!opts.envOverride;
        for (const p of envFiles) {
          try {
            const loaded = loadEnvFile(p);
            applyEnv(loaded, override);
          } catch (e) {
            const msg = e instanceof Error ? e.message : String(e);
            console.error(`\n❌ Failed to load env file: ${msg}`);
            process.exit(1);
          }
        }
      }

      // PR6 migration banner removed after Phase 4 cleanup. [PEC]

      // Preflight: STDIO requires a config file. Check existence and fail immediately.
      if (mode === 'stdio') {
        const pathToCheck = opts.config ?? './hatago.config.json';
        const abs = isAbsolute(pathToCheck) ? pathToCheck : resolve(process.cwd(), pathToCheck);
        if (!existsSync(abs)) {
          console.error('\n❌ Configuration file not found');
          console.error('');
          console.error('   Create a configuration file with:');
          console.error('     hatago init');
          console.error('');
          console.error('   Or specify a different config file:');
          console.error('     hatago serve --config path/to/config.json');
          console.error('');
          process.exit(1);
        }
      }

      // Start server
      await startServer({
        mode,
        config: opts.config,
        port: opts.port ? parseInt(opts.port, 10) : 3535,
        host: opts.host ?? '127.0.0.1',
        logLevel,
        verbose: opts.verbose,
        quiet: opts.quiet,
        watchConfig: opts.watch,
        tags
      });
    } catch (error) {
      // Handle specific errors with cleaner messages
      const errorMessage = error instanceof Error ? error.message : String(error);

      // Missing config file
      if (errorMessage.includes('ENOENT') && errorMessage.includes('hatago.config.json')) {
        console.error('\n❌ Configuration file not found');
        console.error('');
        console.error('   Create a configuration file with:');
        console.error('     hatago init');
        console.error('');
        console.error('   Or specify a different config file:');
        console.error('     hatago serve --config path/to/config.json');
        console.error('');
        process.exit(1);
      }

      // Other missing files
      if (errorMessage.includes('ENOENT')) {
        console.error(`\n❌ File not found: ${errorMessage.split("'")[1] ?? 'unknown'}`);
        process.exit(1);
      }

      // Environment variable validation (no stack trace)
      if (
        errorMessage.includes('Missing required environment variables') ||
        errorMessage.toLowerCase().includes('environment variable validation failed')
      ) {
        console.error(`\n❌ ${errorMessage}`);
        console.error(
          '   Tip: define the variable(s) or use ${VAR:-default} in hatago.config.json'
        );
        process.exit(1);
      }

      // Fallback: concise message only (no stack)
      console.error(`\n❌ Failed to start server: ${errorMessage}`);
      process.exit(1);
    }
  });

// Parse arguments
program.parse(process.argv);

// If no command was provided, show help
if (!process.argv.slice(2).length) {
  program.help();
}
