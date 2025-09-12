#!/usr/bin/env node

/**
 * Hatago CLI - Command-line interface for Hatago MCP Hub
 */

import { Command } from 'commander';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { setupConfigCommand } from './commands/config.js';
import { setupInitCommand } from './commands/init.js';
import { setupMcpCommand } from './commands/mcp.js';
import { setupServeCommand } from './commands/serve.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Read package.json for version
const packageJson = JSON.parse(readFileSync(join(__dirname, '..', 'package.json'), 'utf-8')) as {
  version: string;
};

// Create main program
const program = new Command();

program
  .name('hatago')
  .description('Hatago MCP Hub - Unified MCP Hub server')
  .version(packageJson.version)
  .option('-v, --verbose', 'verbose output')
  .option('-q, --quiet', 'quiet output');

// Setup commands
setupInitCommand(program);
setupServeCommand(program);
setupMcpCommand(program);
setupConfigCommand(program);

// Add help command
program
  .command('help [command]')
  .description('display help for command')
  .action((command) => {
    if (command) {
      const subCommand = program.commands.find((c) => c.name() === command);
      if (subCommand) {
        subCommand.help();
      } else {
        console.error(`Unknown command: ${command}`);
        process.exit(1);
      }
    } else {
      program.help();
    }
  });

// Parse arguments and handle errors
program.parseAsync(process.argv).catch((error: unknown) => {
  console.error('Error:', error instanceof Error ? error.message : String(error));
  process.exit(1);
});
