#!/usr/bin/env node

/**
 * Hatago MCP Hub CLI
 * Minimal CLI with only essential commands
 */

// IMPORTANT: Check for STDIO mode BEFORE importing anything that uses logger
// This ensures logger is configured correctly from the start
if (
  process.argv.includes('serve') &&
  ((process.argv.includes('--mode') &&
    process.argv[process.argv.indexOf('--mode') + 1] === 'stdio') ||
    (!process.argv.includes('--http') && !process.argv.includes('--mode')))
) {
  process.env.MCP_STDIO_MODE = 'true';
}

import { Command } from 'commander';

// Import only essential command handlers
import { createListCommand } from './commands/list.js';
import { createMcpCommands } from './commands/mcp.js';
import { createServeCommand } from './commands/serve.js';

const program = new Command();

program
  .name('hatago')
  .description('🏮 Hatago MCP Hub - Lightweight MCP server management')
  .version('0.2.0');

// Register essential commands only
createServeCommand(program);
createListCommand(program);

// MCP management commands
program.addCommand(createMcpCommands());

// Optional: Add help for enabling enterprise features
program
  .command('enterprise')
  .description('Information about enterprise features')
  .action(() => {
    console.log(`
🏮 Hatago Enterprise Features

To enable enterprise features, install the full version:
  npm install @himorishige/hatago

Available enterprise features:
  • Health monitoring and metrics
  • Authentication and rate limiting
  • TypeScript type generation
  • OpenAPI integration
  • Distributed tracing
  • Advanced circuit breakers

Configure features in your config file:
  {
    "features": {
      "healthCheck": true,
      "metrics": true,
      "authentication": true
    }
  }

Learn more: https://github.com/himorishige/hatago-hub
    `);
  });

// Parse command line arguments
(async () => {
  try {
    await program.parseAsync(process.argv);
  } catch (error) {
    console.error('Command execution failed:', error);
    process.exit(1);
  }
})();
