/**
 * MCP command - Manage MCP servers
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import type { Command } from 'commander';

interface McpServer {
  id: string;
  type: 'local' | 'npx' | 'remote';
  command?: string;
  args?: string[];
  url?: string;
  transport?: 'stdio' | 'http' | 'sse';
}

export function setupMcpCommand(program: Command): void {
  const mcp = program.command('mcp').description('Manage MCP servers');

  // List servers
  mcp
    .command('list')
    .description('List configured MCP servers')
    .action(() => {
      const servers = loadServers();
      if (servers.length === 0) {
        console.log('No MCP servers configured');
        return;
      }

      console.log('Configured MCP servers:');
      servers.forEach((server) => {
        console.log(`  ${server.id} (${server.type})`);
        if (server.command) {
          console.log(`    Command: ${server.command} ${server.args?.join(' ') || ''}`);
        }
        if (server.url) {
          console.log(`    URL: ${server.url}`);
        }
      });
    });

  // Add server
  mcp
    .command('add <name>')
    .description('Add a new MCP server')
    .option('-t, --transport <transport>', 'transport type (stdio, http, sse)', 'stdio')
    .option('-u, --url <url>', 'server URL (for remote servers)')
    .argument('[command...]', 'command to run (for local servers)')
    .action((name: string, command: string[], options: { transport?: string; url?: string }) => {
      const servers = loadServers();

      // Check if server already exists
      if (servers.find((s) => s.id === name)) {
        console.error(`Server "${name}" already exists`);
        process.exit(1);
      }

      const server: McpServer = {
        id: name,
        type: 'local',
        transport: options.transport as 'stdio' | 'http' | 'sse' | undefined
      };

      if (options.url) {
        server.type = 'remote';
        server.url = options.url;
      } else if (command.length > 0) {
        // Check if it's an npx command
        if (command[0] === 'npx') {
          server.type = 'npx';
          server.command = command[0];
          server.args = command.slice(1);
        } else {
          server.command = command[0];
          server.args = command.slice(1);
        }
      } else {
        console.error('Either URL or command must be specified');
        process.exit(1);
      }

      servers.push(server);
      saveServers(servers);
      console.log(`Added MCP server "${name}"`);
    });

  // Remove server
  mcp
    .command('remove <name>')
    .description('Remove an MCP server')
    .action((name: string) => {
      const servers = loadServers();
      const index = servers.findIndex((s) => s.id === name);

      if (index === -1) {
        console.error(`Server "${name}" not found`);
        process.exit(1);
      }

      servers.splice(index, 1);
      saveServers(servers);
      console.log(`Removed MCP server "${name}"`);
    });
}

function getConfigPath(): string {
  return join(homedir(), '.hatago', 'servers.json');
}

function loadServers(): McpServer[] {
  const configPath = getConfigPath();
  if (!existsSync(configPath)) {
    return [];
  }

  try {
    const content = readFileSync(configPath, 'utf-8');
    return JSON.parse(content) as McpServer[];
  } catch (error) {
    console.error('Error loading server configuration:', error);
    return [];
  }
}

function saveServers(servers: McpServer[]): void {
  const configPath = getConfigPath();
  const configDir = join(homedir(), '.hatago');

  // Create directory if it doesn't exist
  if (!existsSync(configDir)) {
    mkdirSync(configDir, { recursive: true });
  }

  try {
    writeFileSync(configPath, JSON.stringify(servers, null, 2));
  } catch (error) {
    console.error('Error saving server configuration:', error);
    process.exit(1);
  }
}
