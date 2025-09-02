/**
 * Tests for configuration inheritance feature
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { vol } from 'memfs';
import { homedir } from 'node:os';
import { loadConfig } from './config.js';
import { createLogger } from './logger.js';

// Mock file system
vi.mock('node:fs');
vi.mock('node:fs/promises');
vi.mock('node:os');

describe('Configuration Inheritance', () => {
  const mockLogger = createLogger({ level: 'error' });
  const mockHomedir = '/home/user';

  beforeEach(() => {
    vi.mocked(homedir).mockReturnValue(mockHomedir);
    vol.reset();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('single inheritance', () => {
    it('should inherit from parent config', async () => {
      // Parent config
      vol.fromJSON({
        '/base/parent.json': JSON.stringify({
          logLevel: 'debug',
          mcpServers: {
            github: {
              command: 'npx',
              args: ['-y', '@modelcontextprotocol/server-github'],
              env: { GITHUB_TOKEN: 'parent_token' }
            }
          }
        }),
        // Child config
        '/project/config.json': JSON.stringify({
          extends: '../base/parent.json',
          mcpServers: {
            local: {
              command: 'node',
              args: ['./server.js']
            }
          }
        })
      });

      const result = await loadConfig('/project/config.json', mockLogger);

      expect(result.exists).toBe(true);
      expect(result.data.logLevel).toBe('debug');
      expect(result.data.mcpServers.github).toBeDefined();
      expect(result.data.mcpServers.local).toBeDefined();
    });

    it('should override parent values with child values', async () => {
      vol.fromJSON({
        '/parent.json': JSON.stringify({
          logLevel: 'info',
          mcpServers: {
            server1: {
              command: 'old-command',
              env: { VAR1: 'parent' }
            }
          }
        }),
        '/child.json': JSON.stringify({
          extends: './parent.json',
          logLevel: 'debug',
          mcpServers: {
            server1: {
              command: 'new-command',
              env: { VAR1: 'child' }
            }
          }
        })
      });

      const result = await loadConfig('/child.json', mockLogger);

      expect(result.data.logLevel).toBe('debug');
      expect(result.data.mcpServers.server1.command).toBe('new-command');
      expect(result.data.mcpServers.server1.env?.VAR1).toBe('child');
    });
  });

  describe('multiple inheritance', () => {
    it('should inherit from multiple parents in order', async () => {
      vol.fromJSON({
        '/base1.json': JSON.stringify({
          logLevel: 'info',
          mcpServers: {
            server1: { command: 'cmd1' }
          }
        }),
        '/base2.json': JSON.stringify({
          logLevel: 'debug',
          mcpServers: {
            server2: { command: 'cmd2' }
          }
        }),
        '/child.json': JSON.stringify({
          extends: ['./base1.json', './base2.json'],
          mcpServers: {
            server3: { command: 'cmd3' }
          }
        })
      });

      const result = await loadConfig('/child.json', mockLogger);

      expect(result.data.logLevel).toBe('debug'); // base2 overrides base1
      expect(result.data.mcpServers.server1).toBeDefined();
      expect(result.data.mcpServers.server2).toBeDefined();
      expect(result.data.mcpServers.server3).toBeDefined();
    });
  });

  describe('multi-level inheritance', () => {
    it('should handle deep inheritance chains', async () => {
      vol.fromJSON({
        '/level1.json': JSON.stringify({
          logLevel: 'error',
          mcpServers: {
            server1: { command: 'cmd1' }
          }
        }),
        '/level2.json': JSON.stringify({
          extends: './level1.json',
          logLevel: 'warn',
          mcpServers: {
            server2: { command: 'cmd2' }
          }
        }),
        '/level3.json': JSON.stringify({
          extends: './level2.json',
          logLevel: 'info',
          mcpServers: {
            server3: { command: 'cmd3' }
          }
        })
      });

      const result = await loadConfig('/level3.json', mockLogger);

      expect(result.data.logLevel).toBe('info');
      expect(result.data.mcpServers.server1).toBeDefined();
      expect(result.data.mcpServers.server2).toBeDefined();
      expect(result.data.mcpServers.server3).toBeDefined();
    });
  });

  describe('home directory expansion', () => {
    it('should expand ~ in extends path', async () => {
      vol.fromJSON({
        [`${mockHomedir}/.hatago/base.json`]: JSON.stringify({
          logLevel: 'debug',
          mcpServers: {
            global: { command: 'global-cmd' }
          }
        }),
        '/project/config.json': JSON.stringify({
          extends: '~/.hatago/base.json',
          mcpServers: {
            local: { command: 'local-cmd' }
          }
        })
      });

      const result = await loadConfig('/project/config.json', mockLogger);

      expect(result.data.mcpServers.global).toBeDefined();
      expect(result.data.mcpServers.local).toBeDefined();
    });
  });

  describe('env field merging', () => {
    it('should merge env fields with null deletion support', async () => {
      vol.fromJSON({
        '/parent.json': JSON.stringify({
          mcpServers: {
            server1: {
              command: 'cmd',
              env: {
                VAR1: 'value1',
                VAR2: 'value2',
                VAR3: 'value3'
              }
            }
          }
        }),
        '/child.json': JSON.stringify({
          extends: './parent.json',
          mcpServers: {
            server1: {
              env: {
                VAR2: 'updated',
                VAR3: null, // Delete VAR3
                VAR4: 'new'
              }
            }
          }
        })
      });

      const result = await loadConfig('/child.json', mockLogger);
      const env = result.data.mcpServers.server1.env;

      expect(env?.VAR1).toBe('value1');
      expect(env?.VAR2).toBe('updated');
      expect(env?.VAR3).toBeUndefined();
      expect(env?.VAR4).toBe('new');
    });
  });

  describe('error handling', () => {
    it('should detect circular references', async () => {
      vol.fromJSON({
        '/config1.json': JSON.stringify({
          extends: './config2.json',
          logLevel: 'info'
        }),
        '/config2.json': JSON.stringify({
          extends: './config1.json',
          logLevel: 'debug'
        })
      });

      await expect(loadConfig('/config1.json', mockLogger)).rejects.toThrow(
        /Circular reference detected/
      );
    });

    it('should enforce maximum inheritance depth', async () => {
      // Create a chain longer than MAX_DEPTH (10)
      const configs: Record<string, string> = {};
      for (let i = 1; i <= 12; i++) {
        configs[`/config${i}.json`] = JSON.stringify({
          extends: i > 1 ? `./config${i - 1}.json` : undefined,
          [`level${i}`]: true
        });
      }
      vol.fromJSON(configs);

      await expect(loadConfig('/config12.json', mockLogger)).rejects.toThrow(
        /Maximum configuration inheritance depth/
      );
    });

    it('should handle missing parent config', async () => {
      vol.fromJSON({
        '/child.json': JSON.stringify({
          extends: './nonexistent.json',
          logLevel: 'info'
        })
      });

      await expect(loadConfig('/child.json', mockLogger)).rejects.toThrow(
        /Configuration file not found/
      );
    });

    it('should handle invalid extends value', async () => {
      vol.fromJSON({
        '/config.json': JSON.stringify({
          extends: 123, // Invalid: not a string or array
          logLevel: 'info'
        })
      });

      await expect(loadConfig('/config.json', mockLogger)).rejects.toThrow(/Invalid extends value/);
    });
  });

  describe('array replacement behavior', () => {
    it('should replace arrays entirely, not concatenate', async () => {
      vol.fromJSON({
        '/parent.json': JSON.stringify({
          mcpServers: {
            server1: {
              command: 'cmd',
              args: ['arg1', 'arg2', 'arg3']
            }
          }
        }),
        '/child.json': JSON.stringify({
          extends: './parent.json',
          mcpServers: {
            server1: {
              args: ['new-arg1', 'new-arg2']
            }
          }
        })
      });

      const result = await loadConfig('/child.json', mockLogger);
      const args = result.data.mcpServers.server1.args;

      expect(args).toEqual(['new-arg1', 'new-arg2']);
      expect(args).not.toContain('arg1');
    });
  });
});
