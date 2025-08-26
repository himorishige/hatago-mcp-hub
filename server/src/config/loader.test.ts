import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  createDefaultConfig,
  expandEnvVars,
  findConfigFile,
  generateSampleConfig,
  loadConfig,
  mergeConfig,
} from './loader.js';
import type { HatagoConfig } from './types.js';

// Mock fs module
vi.mock('node:fs', () => ({
  existsSync: vi.fn(),
  readFileSync: vi.fn(),
  writeFileSync: vi.fn(),
  mkdirSync: vi.fn(),
}));

vi.mock('node:fs/promises', () => ({
  readFile: vi.fn(),
  writeFile: vi.fn(),
  mkdir: vi.fn(),
  access: vi.fn(),
}));

describe('config/loader', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Reset environment variables
    delete process.env.TEST_VAR;
    delete process.env.API_KEY;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('expandEnvVars', () => {
    it('should expand environment variables', () => {
      process.env.TEST_VAR = 'test-value';
      process.env.API_KEY = 'secret-key';

      const result = expandEnvVars(
        '$' + '{env:TEST_VAR}/path/$' + '{env:API_KEY}',
      );
      expect(result).toBe('test-value/path/secret-key');
    });

    it('should return empty string for undefined variables', () => {
      const result = expandEnvVars('$' + '{env:UNDEFINED_VAR}');
      expect(result).toBe('');
    });

    it('should handle multiple variables in one string', () => {
      process.env.HOST = 'localhost';
      process.env.PORT = '3000';

      const result = expandEnvVars(
        'http://$' + '{env:HOST}:$' + '{env:PORT}/api',
      );
      expect(result).toBe('http://localhost:3000/api');
    });

    it('should leave non-env placeholders unchanged', () => {
      delete process.env.TEST;
      const result = expandEnvVars('$' + '{other:value} $' + '{env:TEST}');
      expect(result).toBe('$' + '{other:value} ');
    });
  });

  describe('createDefaultConfig', () => {
    it('should create a valid default configuration', () => {
      const config = createDefaultConfig();

      expect(config).toHaveProperty('version');
      expect(config).toHaveProperty('http');
      expect(config).toHaveProperty('toolNaming');
      expect(config).toHaveProperty('session');
      expect(config).toHaveProperty('timeouts');
      expect(config).toHaveProperty('concurrency');
      expect(config).toHaveProperty('security');
      // servers field removed - using mcpServers instead

      expect(config.http.port).toBe(3000);
      // servers field removed - using mcpServers instead
      expect(config.mcpServers).toEqual({});
    });

    it('should have valid default timeout values', () => {
      const config = createDefaultConfig();

      expect(config.timeouts.spawnMs).toBe(8000);
      expect(config.timeouts.healthcheckMs).toBe(2000);
      expect(config.timeouts.toolCallMs).toBe(20000);
    });

    it('should have valid default security settings', () => {
      const config = createDefaultConfig();

      expect(config.security.redactKeys).toContain('password');
      expect(config.security.redactKeys).toContain('apiKey');
      expect(config.security.allowNet).toBeUndefined();
    });
  });

  describe('mergeConfig', () => {
    it('should merge configurations correctly', () => {
      const base = createDefaultConfig();
      const override: Partial<HatagoConfig> = {
        http: {
          port: 4000,
          host: '0.0.0.0',
        },
        servers: [
          {
            id: 'test-server',
            type: 'local',
            command: 'test',
            start: 'eager',
          },
        ],
      };

      const merged = mergeConfig(base, override);

      expect(merged.http.port).toBe(4000);
      expect(merged.http.host).toBe('0.0.0.0');
      expect(merged.servers).toHaveLength(1);
      expect(merged.servers?.[0].id).toBe('test-server');
    });

    it('should preserve base values not in override', () => {
      const base = createDefaultConfig();
      const override: Partial<HatagoConfig> = {
        http: {
          port: 5000,
        },
      };

      const merged = mergeConfig(base, override);

      expect(merged.http.port).toBe(5000);
      expect(merged.http.host).toBe(base.http.host);
      expect(merged.timeouts).toEqual(base.timeouts);
    });

    it('should deep merge nested objects', () => {
      const base = createDefaultConfig();
      const override: Partial<HatagoConfig> = {
        toolNaming: {
          strategy: 'error',
        },
        session: {
          ttlSeconds: 7200,
        },
      };

      const merged = mergeConfig(base, override);

      expect(merged.toolNaming.strategy).toBe('error');
      expect(merged.toolNaming.separator).toBe(base.toolNaming.separator);
      expect(merged.session.ttlSeconds).toBe(7200);
    });

    it('should completely replace servers array', () => {
      const base = createDefaultConfig();
      base.servers = [
        {
          id: 'old-server',
          type: 'local',
          command: 'old',
          start: 'lazy',
        },
      ];

      const override: Partial<HatagoConfig> = {
        servers: [
          {
            id: 'new-server',
            type: 'local',
            command: 'new',
            start: 'eager',
          },
        ],
      };

      const merged = mergeConfig(base, override);

      expect(merged.servers).toHaveLength(1);
      expect(merged.servers?.[0].id).toBe('new-server');
    });
  });

  describe('generateSampleConfig', () => {
    it('should generate a sample configuration', () => {
      const sample = generateSampleConfig();

      expect(sample).toContain('version');
      expect(sample).toContain('http');
      expect(sample).toContain('servers');
      expect(sample).toContain('// Port number for the HTTP server');
    });

    it('should be valid JSONC format', () => {
      const sample = generateSampleConfig();

      // Check that it contains valid JSON structure
      expect(sample).toContain('"version"');
      expect(sample).toContain('"http"');
      expect(sample).toContain('"mcpServers"');
    });

    it('should include example server configurations', () => {
      const sample = generateSampleConfig();

      expect(sample).toContain('filesystem');
      expect(sample).toContain('@modelcontextprotocol/server-filesystem');
      expect(sample).toContain('example-local');
    });
  });

  describe('findConfigFile', () => {
    it('should find config file in current directory', async () => {
      const fs = await import('node:fs');
      vi.mocked(fs.existsSync).mockReturnValue(true);

      const result = await findConfigFile();

      expect(result).toBeTruthy();
      expect(result).toMatch(/hatago/);
    });

    it('should check multiple config file names', async () => {
      const fs = await import('node:fs');
      vi.mocked(fs.existsSync)
        .mockReturnValueOnce(false)
        .mockReturnValueOnce(false)
        .mockReturnValueOnce(true);

      const result = await findConfigFile();

      expect(result).toBeTruthy();
      expect(result).toMatch(/hatago/);
      expect(vi.mocked(fs.existsSync)).toHaveBeenCalledTimes(3);
    });

    it('should return undefined if no config file found', async () => {
      const fs = await import('node:fs');
      vi.mocked(fs.existsSync).mockReturnValue(false);

      const result = await findConfigFile();

      expect(result).toBeUndefined();
    });

    it('should search in parent directories', async () => {
      const fs = await import('node:fs');
      vi.mocked(fs.existsSync)
        .mockReturnValueOnce(false) // current dir
        .mockReturnValueOnce(false)
        .mockReturnValueOnce(false)
        .mockReturnValueOnce(false)
        .mockReturnValueOnce(false) // home dir
        .mockReturnValueOnce(true); // found in home

      const result = await findConfigFile();

      expect(result).toBeTruthy();
    });
  });

  describe('loadConfig', () => {
    it('should load config from specified path', async () => {
      const fs = await import('node:fs');
      const fsPromises = await import('node:fs/promises');

      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fsPromises.readFile).mockResolvedValue(
        JSON.stringify(createDefaultConfig()),
      );

      const config = await loadConfig('/path/to/config.json');

      expect(config).toHaveProperty('version');
      expect(vi.mocked(fsPromises.readFile)).toHaveBeenCalledWith(
        expect.stringContaining('config.json'),
        'utf-8',
      );
    });

    it('should load profile config when profile option is provided', async () => {
      const fs = await import('node:fs');
      const fsPromises = await import('node:fs/promises');

      vi.mocked(fs.existsSync).mockReturnValue(true);
      const defaultConfig = createDefaultConfig();
      vi.mocked(fsPromises.readFile).mockResolvedValue(
        JSON.stringify(defaultConfig),
      );

      const config = await loadConfig(undefined, { profile: 'development' });

      expect(config).toHaveProperty('version');
      expect(vi.mocked(fs.existsSync)).toHaveBeenCalledWith(
        expect.stringContaining('profiles/development.jsonc'),
      );
    });

    it('should reject invalid profile names', async () => {
      await expect(
        loadConfig(undefined, { profile: '../../../etc/passwd' }),
      ).rejects.toThrow();
    });

    it('should use default config when no config file found', async () => {
      const fs = await import('node:fs');
      const fsPromises = await import('node:fs/promises');

      vi.mocked(fs.existsSync).mockReturnValue(false);
      vi.mocked(fsPromises.access).mockRejectedValue(new Error('Not found'));

      const config = await loadConfig();

      expect(config.version).toBe(1);
      // servers field removed - using mcpServers instead
      expect(config.mcpServers).toEqual({});
    });

    it('should not log when quiet option is true', async () => {
      const fs = await import('node:fs');
      const fsPromises = await import('node:fs/promises');
      const logSpy = vi.spyOn(console, 'info').mockImplementation(() => {});

      vi.mocked(fs.existsSync).mockReturnValue(false);
      vi.mocked(fsPromises.access).mockRejectedValue(new Error('Not found'));

      await loadConfig(undefined, { quiet: true });

      expect(logSpy).not.toHaveBeenCalled();
      logSpy.mockRestore();
    });
  });
});
