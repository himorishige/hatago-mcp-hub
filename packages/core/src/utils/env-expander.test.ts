import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  expandConfig,
  expandEnvironmentVariables,
  validateEnvironmentVariables
} from './env-expander.js';

describe('env-expander', () => {
  // Save original env
  const originalEnv = process.env;

  beforeEach(() => {
    // Reset env for each test
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    // Restore original env
    process.env = originalEnv;
  });

  describe('expandEnvironmentVariables', () => {
    it('should expand simple environment variable', () => {
      process.env.TEST_VAR = 'test_value';
      const result = expandEnvironmentVariables('${TEST_VAR}');
      expect(result).toBe('test_value');
    });

    it('should use custom getEnv function', () => {
      const customEnv: Record<string, string> = { MY_VAR: 'custom_value' };
      const getEnv = (key: string) => customEnv[key];

      const result = expandEnvironmentVariables('${MY_VAR}', getEnv);
      expect(result).toBe('custom_value');
    });

    it('should work with Workers-style env bindings', () => {
      // Simulate Cloudflare Workers environment
      const workersEnv = {
        API_KEY: 'secret-key-123',
        BASE_URL: 'https://api.example.com'
      };
      const getEnv = (key: string) => workersEnv[key as keyof typeof workersEnv];

      const result = expandEnvironmentVariables('${BASE_URL}/api?key=${API_KEY}', getEnv);
      expect(result).toBe('https://api.example.com/api?key=secret-key-123');
    });

    it('should expand multiple environment variables', () => {
      process.env.BASE_URL = 'https://api.example.com';
      process.env.VERSION = 'v1';
      const result = expandEnvironmentVariables('${BASE_URL}/api/${VERSION}');
      expect(result).toBe('https://api.example.com/api/v1');
    });

    it('should use default value when variable is not defined', () => {
      delete process.env.UNDEFINED_VAR;
      const result = expandEnvironmentVariables('${UNDEFINED_VAR:-default_value}');
      expect(result).toBe('default_value');
    });

    it('should use environment variable over default when defined', () => {
      process.env.DEFINED_VAR = 'actual_value';
      const result = expandEnvironmentVariables('${DEFINED_VAR:-default_value}');
      expect(result).toBe('actual_value');
    });

    it('should handle empty string as valid value', () => {
      process.env.EMPTY_VAR = '';
      const result = expandEnvironmentVariables('${EMPTY_VAR:-default}');
      expect(result).toBe('');
    });

    it('should handle empty default value', () => {
      delete process.env.UNDEFINED_VAR;
      const result = expandEnvironmentVariables('${UNDEFINED_VAR:-}');
      expect(result).toBe('');
    });

    it('should throw error for undefined variable without default', () => {
      delete process.env.REQUIRED_VAR;
      expect(() => expandEnvironmentVariables('${REQUIRED_VAR}')).toThrow(
        "Environment variable 'REQUIRED_VAR' is not defined and no default value provided"
      );
    });

    it('should handle variables with underscores and numbers', () => {
      process.env.API_KEY_2 = 'secret123';
      const result = expandEnvironmentVariables('${API_KEY_2}');
      expect(result).toBe('secret123');
    });

    it('should not expand patterns without proper syntax', () => {
      // $$ is not a valid placeholder syntax, so it shouldn't be expanded
      const result = expandEnvironmentVariables('$$HOME');
      expect(result).toBe('$$HOME');

      // Missing closing brace
      const result2 = expandEnvironmentVariables('${HOME');
      expect(result2).toBe('${HOME');

      // Extra $ at the beginning doesn't make it a placeholder
      const _result3 = expandEnvironmentVariables('$${HOME}');
      // This actually becomes $ + the value of HOME, since ${HOME} is valid
      process.env.HOME = '/home/user';
      expect(expandEnvironmentVariables('$${HOME}')).toBe('$/home/user');
    });

    it('should handle text before and after variables', () => {
      process.env.HOST = 'localhost';
      process.env.PORT = '3000';
      const result = expandEnvironmentVariables('http://${HOST}:${PORT}/api');
      expect(result).toBe('http://localhost:3000/api');
    });
  });

  describe('expandConfig', () => {
    it('should expand top-level logLevel', () => {
      delete process.env.LOG_LEVEL;
      const config = { logLevel: '${LOG_LEVEL:-debug}' };
      const result = expandConfig(config) as any;
      expect(result.logLevel).toBe('debug');
    });

    it('should expand command field', () => {
      process.env.MCP_PATH = '/usr/local/bin';
      const config = {
        mcpServers: {
          test: {
            command: '${MCP_PATH}/server'
          }
        }
      };
      const result = expandConfig(config);
      expect(result.mcpServers.test.command).toBe('/usr/local/bin/server');
    });

    it('should expand args array', () => {
      process.env.API_TOKEN = 'secret-token';
      const config = {
        mcpServers: {
          test: {
            args: ['--token', '${API_TOKEN}', '--port', '3000']
          }
        }
      };
      const result = expandConfig(config);
      expect(result.mcpServers.test.args).toEqual(['--token', 'secret-token', '--port', '3000']);
    });

    it('should expand env object values', () => {
      process.env.BASE_PATH = '/app';
      const config = {
        mcpServers: {
          test: {
            env: {
              PATH: '${BASE_PATH}/bin:${PATH:-/usr/bin}',
              NODE_ENV: 'production'
            }
          }
        }
      };
      const result = expandConfig(config);
      expect(result.mcpServers.test.env.PATH).toMatch(/^\/app\/bin:/);
      expect(result.mcpServers.test.env.NODE_ENV).toBe('production');
    });

    it('should expand url field', () => {
      process.env.API_BASE = 'https://api.example.com';
      const config = {
        mcpServers: {
          test: {
            url: '${API_BASE}/mcp'
          }
        }
      };
      const result = expandConfig(config);
      expect(result.mcpServers.test.url).toBe('https://api.example.com/mcp');
    });

    it('should expand headers object values', () => {
      process.env.AUTH_TOKEN = 'Bearer abc123';
      const config = {
        mcpServers: {
          test: {
            headers: {
              Authorization: '${AUTH_TOKEN}',
              'Content-Type': 'application/json'
            }
          }
        }
      };
      const result = expandConfig(config);
      expect(result.mcpServers.test.headers.Authorization).toBe('Bearer abc123');
      expect(result.mcpServers.test.headers['Content-Type']).toBe('application/json');
    });

    it('should support VS Code servers key', () => {
      process.env.GITHUB_TOKEN = 'ghp_xxx';
      const config = {
        servers: {
          github: {
            command: 'github-server',
            args: ['--token', '${GITHUB_TOKEN}']
          }
        }
      };
      const result = expandConfig(config);
      expect(result.servers.github.args[1]).toBe('ghp_xxx');
    });

    it('should handle both mcpServers and servers keys', () => {
      process.env.TOKEN1 = 'token1';
      process.env.TOKEN2 = 'token2';
      const config = {
        mcpServers: {
          server1: {
            args: ['${TOKEN1}']
          }
        },
        servers: {
          server2: {
            args: ['${TOKEN2}']
          }
        }
      };
      const result = expandConfig(config);
      expect(result.mcpServers.server1.args[0]).toBe('token1');
      expect(result.servers.server2.args[0]).toBe('token2');
    });

    it('should not mutate original config', () => {
      process.env.TEST = 'value';
      const config = {
        mcpServers: {
          test: {
            command: '${TEST}'
          }
        }
      };
      const original = JSON.stringify(config);
      expandConfig(config);
      expect(JSON.stringify(config)).toBe(original);
    });

    it('should handle missing server configs gracefully', () => {
      const config = {
        mcpServers: {
          test: null
        }
      };
      const result = expandConfig(config);
      expect(result.mcpServers.test).toBeNull();
    });

    it('should use custom getEnv for config expansion', () => {
      const customEnv = {
        CUSTOM_PATH: '/custom/path',
        CUSTOM_TOKEN: 'secret-token'
      };
      const getEnv = (key: string) => customEnv[key as keyof typeof customEnv];

      const config = {
        mcpServers: {
          test: {
            command: '${CUSTOM_PATH}/server',
            args: ['--token', '${CUSTOM_TOKEN}']
          }
        }
      };

      const result = expandConfig(config, getEnv);
      expect(result.mcpServers.test.command).toBe('/custom/path/server');
      expect(result.mcpServers.test.args[1]).toBe('secret-token');
    });
  });

  describe('validateEnvironmentVariables', () => {
    it('should pass when all required variables are defined', () => {
      process.env.REQUIRED1 = 'value1';
      process.env.REQUIRED2 = 'value2';
      const config = {
        mcpServers: {
          test: {
            command: '${REQUIRED1}',
            args: ['${REQUIRED2}']
          }
        }
      };
      expect(() => validateEnvironmentVariables(config)).not.toThrow();
    });

    it('should pass when using default values for undefined variables', () => {
      delete process.env.OPTIONAL;
      const config = {
        mcpServers: {
          test: {
            command: '${OPTIONAL:-/usr/bin/default}'
          }
        }
      };
      expect(() => validateEnvironmentVariables(config)).not.toThrow();
    });

    it('should throw with list of all missing variables', () => {
      delete process.env.MISSING1;
      delete process.env.MISSING2;
      delete process.env.MISSING3;
      const config = {
        mcpServers: {
          test: {
            command: '${MISSING1}',
            args: ['${MISSING2}', '${MISSING3}'],
            env: {
              VAR: '${MISSING1}' // Duplicate should only appear once
            }
          }
        }
      };
      expect(() => validateEnvironmentVariables(config)).toThrow(
        'Missing required environment variables: MISSING1, MISSING2, MISSING3'
      );
    });

    it('should check all expandable fields', () => {
      delete process.env.CMD_VAR;
      delete process.env.ARG_VAR;
      delete process.env.ENV_VAR;
      delete process.env.URL_VAR;
      delete process.env.HEADER_VAR;
      const config = {
        mcpServers: {
          test: {
            command: '${CMD_VAR}',
            args: ['${ARG_VAR}'],
            env: { TEST: '${ENV_VAR}' },
            url: '${URL_VAR}',
            headers: { Auth: '${HEADER_VAR}' }
          }
        }
      };
      expect(() => validateEnvironmentVariables(config)).toThrow(
        'Missing required environment variables: ARG_VAR, CMD_VAR, ENV_VAR, HEADER_VAR, URL_VAR'
      );
    });

    it('should validate VS Code servers key', () => {
      delete process.env.VS_CODE_VAR;
      const config = {
        servers: {
          test: {
            command: '${VS_CODE_VAR}'
          }
        }
      };
      expect(() => validateEnvironmentVariables(config)).toThrow(
        'Missing required environment variables: VS_CODE_VAR'
      );
    });

    it('should validate with custom getEnv', () => {
      const customEnv = { CUSTOM_VAR: 'value' };
      const getEnv = (key: string) => customEnv[key as keyof typeof customEnv];

      const config = {
        mcpServers: {
          test: {
            command: '${CUSTOM_VAR}'
          }
        }
      };

      // Should pass with custom env
      expect(() => validateEnvironmentVariables(config, getEnv)).not.toThrow();

      // Should fail with empty custom env
      const emptyGetEnv = () => undefined;
      expect(() => validateEnvironmentVariables(config, emptyGetEnv)).toThrow(
        'Missing required environment variables: CUSTOM_VAR'
      );
    });
  });
});
