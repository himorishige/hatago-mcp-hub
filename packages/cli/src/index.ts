#!/usr/bin/env node
/**
 * Hatago CLI - Command-line interface for Hatago MCP Hub
 */

import { Command } from 'commander';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { setupServeCommand } from './commands/serve.js';
import { setupMcpCommand } from './commands/mcp.js';
import { setupConfigCommand } from './commands/config.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Read package.json for version
const packageJson = JSON.parse(
  readFileSync(join(__dirname, '..', 'package.json'), 'utf-8')
);

// Create main program
const program = new Command();

program
  .name('hatago')
  .description('Hatago MCP Hub - Multi-runtime MCP Hub server')
  .version(packageJson.version)
  .option('-v, --verbose', 'verbose output')
  .option('-q, --quiet', 'quiet output');

// Setup commands
setupServeCommand(program);
setupMcpCommand(program);
setupConfigCommand(program);

// Add help command
program
  .command('help [command]')
  .description('display help for command')
  .action((command) => {
    if (command) {
      const subCommand = program.commands.find(c => c.name() === command);
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
program.parseAsync(process.argv).catch((error) => {
  console.error('Error:', error.message);
  process.exit(1);
});