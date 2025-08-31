/**
 * Config command - Manage Hatago configuration
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import type { Command } from 'commander';

interface HatagoConfig {
  port?: number;
  host?: string;
  servers?: unknown[];
  session?: {
    timeout?: number;
    maxSessions?: number;
  };
}

export function setupConfigCommand(program: Command): void {
  const config = program.command('config').description('Manage Hatago configuration');

  // Show config
  config
    .command('show')
    .description('Show current configuration')
    .action(() => {
      const config = loadConfig();
      console.log('Current configuration:');
      console.log(JSON.stringify(config, null, 2));
    });

  // Set config value
  config
    .command('set <key> <value>')
    .description('Set a configuration value')
    .action((key: string, value: string) => {
      const config = loadConfig();

      // Parse nested keys
      const keys = key.split('.');
      let target: Record<string, unknown> = config as Record<string, unknown>;

      for (let i = 0; i < keys.length - 1; i++) {
        const k = keys[i];
        if (!k) continue;
        if (!(k in target)) {
          target[k] = {};
        }
        target = target[k] as Record<string, unknown>;
      }

      const lastKey = keys[keys.length - 1];
      if (!lastKey) {
        console.error('Invalid key path');
        process.exit(1);
      }

      // Try to parse value as JSON
      try {
        target[lastKey] = JSON.parse(value);
      } catch {
        // If not valid JSON, treat as string
        target[lastKey] = value;
      }

      saveConfig(config);
      console.log(`Set ${key} = ${value}`);
    });

  // Get config value
  config
    .command('get <key>')
    .description('Get a configuration value')
    .action((key: string) => {
      const config = loadConfig();

      // Parse nested keys
      const keys = key.split('.');
      let value: unknown = config;

      for (const k of keys) {
        if (value && typeof value === 'object' && k in value) {
          value = (value as Record<string, unknown>)[k];
        } else {
          console.log(`Key "${key}" not found`);
          return;
        }
      }

      // Output primitive values directly, objects/arrays as JSON
      if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
        console.log(String(value));
      } else {
        console.log(JSON.stringify(value, null, 2));
      }
    });

  // Reset config
  config
    .command('reset')
    .description('Reset configuration to defaults')
    .action(() => {
      const defaultConfig: HatagoConfig = {
        port: 3000,
        host: '127.0.0.1',
        servers: [],
        session: {
          timeout: 3600000,
          maxSessions: 100
        }
      };

      saveConfig(defaultConfig);
      console.log('Configuration reset to defaults');
    });
}

function getConfigPath(): string {
  return join(homedir(), '.hatago', 'config.json');
}

function loadConfig(): HatagoConfig {
  const configPath = getConfigPath();
  if (!existsSync(configPath)) {
    return {
      port: 3000,
      host: '127.0.0.1',
      servers: [],
      session: {
        timeout: 3600000,
        maxSessions: 100
      }
    };
  }

  try {
    const content = readFileSync(configPath, 'utf-8');
    return JSON.parse(content);
  } catch (error) {
    console.error('Error loading configuration:', error);
    return {};
  }
}

function saveConfig(config: HatagoConfig): void {
  const configPath = getConfigPath();
  const configDir = join(homedir(), '.hatago');

  // Create directory if it doesn't exist
  if (!existsSync(configDir)) {
    mkdirSync(configDir, { recursive: true });
  }

  try {
    writeFileSync(configPath, JSON.stringify(config, null, 2));
  } catch (error) {
    console.error('Error saving configuration:', error);
    process.exit(1);
  }
}
