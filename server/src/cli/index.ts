#!/usr/bin/env node

/**
 * Hatago MCP Hub CLI - Refactored to avoid circular dependencies
 */

import { Command } from 'commander';

// Import individual command handlers
import { createCallCommand } from './commands/call.js';
import { createDoctorCommand } from './commands/doctor.js';
import { createDrainCommand } from './commands/drain.js';
import { createInitCommand } from './commands/init.js';
import { createListCommand } from './commands/list.js';
import { createMcpCommands } from './commands/mcp.js';
import { createNpxCommands } from './commands/npx.js';
import { createPolicyCommand } from './commands/policy.js';
import { createReloadCommand } from './commands/reload.js';
import { createRemoteCommands } from './commands/remote.js';
import { createSecretCommands } from './commands/secret.js';
import { createServeCommand } from './commands/serve.js';
import { createSessionCommand } from './commands/session.js';
import { createStatusCommand } from './commands/status.js';

const program = new Command();

program
  .name('hatago')
  .description('🏨 Hatago MCP Hub - Unified MCP server management')
  .version('0.0.2');

// Register all commands
createServeCommand(program);
createInitCommand(program);
createListCommand(program);
createReloadCommand(program);
createStatusCommand(program);
createPolicyCommand(program);
createSessionCommand(program);
createDrainCommand(program);
createCallCommand(program);

// Register existing sub-command groups
program.addCommand(createMcpCommands());
program.addCommand(createNpxCommands());
program.addCommand(createRemoteCommands());
createSecretCommands(program);
createDoctorCommand(program);

// Parse command line arguments
program.parse(process.argv);
