/**
 * Tests for environment variable expansion in configuration
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { vol, fs } from 'memfs';
import { loadConfig } from './config.js';
import { Logger } from './logger.js';

// Mock file system
vi.mock('node:fs', () => ({
  ...fs,
  default: fs
}));
vi.mock('node:fs/promises', () => ({
  ...fs.promises,
  default: fs.promises
}));

describe('Configuration env expansion', () => {
  const logger = new Logger('error');
  const backupEnv = { ...process.env };

  beforeEach(() => {
    vol.reset();
  });

  afterEach(() => {
    // Restore env
    for (const k of Object.keys(process.env)) delete (process.env as Record<string, string>)[k];
    Object.assign(process.env, backupEnv);
    vi.clearAllMocks();
  });

  it('expands ${VAR} and ${VAR:-default} across fields', async () => {
    // Prepare env
    process.env.TOKEN = 'secret-token';
    process.env.BIN = 'node';
    process.env.SCRIPT = './tool.js';
    process.env.LOG_LEVEL = 'debug';
    // Note: API_BASE is intentionally undefined → default should be used

    vol.fromJSON({
      '/cfg.json': JSON.stringify({
        version: 1,
        logLevel: '${LOG_LEVEL:-info}',
        mcpServers: {
          api: {
            url: '${API_BASE:-https://api.example.com}/mcp',
            headers: { Authorization: 'Bearer ${TOKEN}' }
          },
          cli: {
            command: '${BIN:-node}',
            args: ['${SCRIPT:-./script.js}', '--flag=${FLAG:-x}']
          }
        }
      })
    });

    const result = await loadConfig('/cfg.json', logger);
    const cfg = result.data as unknown as {
      logLevel?: string;
      mcpServers: Record<string, any>;
    };

    expect(cfg.logLevel).toBe('debug');
    expect(cfg.mcpServers.api.url).toBe('https://api.example.com/mcp');
    expect(cfg.mcpServers.api.headers.Authorization).toBe('Bearer secret-token');
    expect(cfg.mcpServers.cli.command).toBe('node');
    expect(cfg.mcpServers.cli.args).toEqual(['./tool.js', '--flag=x']);
  });
});
