import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { HatagoConfig, ServerConfig } from './types.js';
import { printValidationResult, validateProfileConfig } from './validator.js';

// Mock the logger module
vi.mock('../utils/logger.js', () => {
  const mockLogger = {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  };

  return {
    createLogger: vi.fn(() => mockLogger),
  };
});

describe('config/validator', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('validateProfileConfig', () => {
    it('should validate complete config', () => {
      const config: HatagoConfig = {
        version: 1,
        logLevel: 'info',
        servers: [
          {
            id: 'test',
            type: 'local',
            command: 'node',
            start: 'lazy',
          },
        ],
      };

      const result = validateProfileConfig(config);

      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should validate all servers in config', () => {
      const config: HatagoConfig = {
        version: 1,
        servers: [
          {
            id: 'valid',
            type: 'local',
            command: 'node',
            start: 'lazy',
          },
          {
            id: 'invalid!',
            type: 'local',
            command: 'node',
            start: 'lazy',
          },
        ],
      };

      const result = validateProfileConfig(config);

      expect(result.valid).toBe(false);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0].path).toContain('servers[1]');
    });

    it('should warn about missing servers', () => {
      const config: HatagoConfig = {
        version: 1,
        servers: [],
      };

      const result = validateProfileConfig(config);

      expect(result.valid).toBe(true);
      expect(result.warnings).toHaveLength(1);
      expect(result.warnings[0].message).toContain('No servers configured');
    });

    it('should warn about unsupported version', () => {
      const config: HatagoConfig = {
        version: 2 as unknown as 1,
        servers: [],
      };

      const result = validateProfileConfig(config);

      expect(result.warnings.length).toBeGreaterThan(0);
      expect(result.warnings[0].message).toContain(
        'Unsupported config version',
      );
    });

    it('should validate port number', () => {
      const config: HatagoConfig = {
        version: 1,
        http: {
          port: 70000,
          host: 'localhost',
        },
        servers: [],
      };

      const result = validateProfileConfig(config);

      expect(result.valid).toBe(false);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0].message).toContain('Invalid port number');
    });

    it('should warn about privileged ports on Unix', () => {
      const config: HatagoConfig = {
        version: 1,
        http: {
          port: 80,
          host: 'localhost',
        },
        servers: [],
      };

      const result = validateProfileConfig(config);

      if (process.platform !== 'win32') {
        expect(result.warnings.length).toBeGreaterThan(0);
        const portWarning = result.warnings.find((w) => w.path === 'http.port');
        expect(portWarning?.message).toContain('requires root privileges');
      }
    });

    it('should validate server with missing required fields', () => {
      const config: HatagoConfig = {
        version: 1,
        servers: [
          {
            id: 'test',
            type: 'local',
            start: 'lazy',
          } as unknown as ServerConfig, // Missing 'command' field
        ],
      };

      const result = validateProfileConfig(config);

      expect(result.valid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
      expect(result.errors[0].message).toContain('requires a command');
    });

    it('should validate npx server config', () => {
      const config: HatagoConfig = {
        version: 1,
        servers: [
          {
            id: 'npx_test',
            type: 'npx',
            package: '@modelcontextprotocol/server-filesystem',
            start: 'lazy',
          },
        ],
      };

      const result = validateProfileConfig(config);

      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should validate remote server config', () => {
      const config: HatagoConfig = {
        version: 1,
        servers: [
          {
            id: 'remote_test',
            type: 'remote',
            url: 'https://api.example.com',
            transport: 'http',
            start: 'lazy',
          },
        ],
      };

      const result = validateProfileConfig(config);

      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should validate security.allowNet hosts', () => {
      const config: HatagoConfig = {
        version: 1,
        security: {
          allowNet: ['localhost', '192.168.1.1', 'example.com'],
        },
        servers: [],
      };

      const result = validateProfileConfig(config);

      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should reject invalid hosts in allowNet', () => {
      const config: HatagoConfig = {
        version: 1,
        security: {
          allowNet: ['not_a_valid_host!'],
        },
        servers: [],
      };

      const result = validateProfileConfig(config);

      expect(result.valid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
      expect(result.errors[0].message).toContain('Invalid host');
    });
  });

  describe('printValidationResult', () => {
    let mockLogger: ReturnType<typeof vi.fn>;

    beforeEach(async () => {
      vi.clearAllMocks();
      // Get the mocked logger
      const { createLogger } = await import('../utils/logger.js');
      mockLogger = createLogger();
    });

    it('should print validation errors', () => {
      const result = {
        valid: false,
        errors: [{ path: 'test.path', message: 'Error message' }],
        warnings: [],
      };

      printValidationResult(result);

      expect(mockLogger.error).toHaveBeenCalledWith('Configuration errors:');
      expect(mockLogger.error).toHaveBeenCalledWith(
        '  - test.path: Error message',
      );
      expect(mockLogger.error).toHaveBeenCalledWith('Configuration is invalid');
    });

    it('should print validation warnings', () => {
      const result = {
        valid: true,
        errors: [],
        warnings: [{ path: 'test.warning', message: 'Warning message' }],
      };

      printValidationResult(result);

      expect(mockLogger.warn).toHaveBeenCalledWith('Configuration warnings:');
      expect(mockLogger.warn).toHaveBeenCalledWith(
        '  - test.warning: Warning message',
      );
      expect(mockLogger.info).toHaveBeenCalledWith('Configuration is valid');
    });

    it('should handle valid result', () => {
      const result = {
        valid: true,
        errors: [],
        warnings: [],
      };

      printValidationResult(result);

      expect(mockLogger.info).toHaveBeenCalledWith('Configuration is valid');
    });

    it('should handle invalid result with both errors and warnings', () => {
      const result = {
        valid: false,
        errors: [{ path: 'error.path', message: 'Error message' }],
        warnings: [{ path: 'warning.path', message: 'Warning message' }],
      };

      printValidationResult(result);

      expect(mockLogger.error).toHaveBeenCalledWith('Configuration errors:');
      expect(mockLogger.error).toHaveBeenCalledWith(
        '  - error.path: Error message',
      );
      expect(mockLogger.warn).toHaveBeenCalledWith('Configuration warnings:');
      expect(mockLogger.warn).toHaveBeenCalledWith(
        '  - warning.path: Warning message',
      );
      expect(mockLogger.error).toHaveBeenCalledWith('Configuration is invalid');
    });
  });
});
