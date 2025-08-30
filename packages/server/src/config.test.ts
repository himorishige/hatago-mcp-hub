/**
 * Tests for Configuration Loader
 */

import * as fs from 'node:fs';
import * as fsPromises from 'node:fs/promises';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { loadConfig } from './config.js';
import type { Logger } from './logger.js';

// Mock node modules
vi.mock('node:fs');
vi.mock('node:fs/promises');

// Mock @hatago/core
vi.mock('@hatago/core', () => ({
  expandConfig: vi.fn((data) => data),
  formatConfigError: vi.fn((_error) => 'Formatted error'),
  safeParseConfig: vi.fn((data) => ({ success: true, data })),
  validateEnvironmentVariables: vi.fn(),
}));

describe('loadConfig', () => {
  let mockLogger: Logger;

  beforeEach(() => {
    mockLogger = {
      debug: vi.fn(),
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
    };

    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.resetModules();
  });

  describe('File Loading', () => {
    it('should load configuration from existing file', async () => {
      const configContent = JSON.stringify({
        version: 1,
        mcpServers: {
          test: {
            command: 'test-cmd',
            args: ['arg1'],
          },
        },
      });

      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fsPromises.readFile).mockResolvedValue(configContent);

      const result = await loadConfig('test.config.json', mockLogger);

      expect(result.path).toContain('test.config.json');
      expect(result.exists).toBe(true);
      expect(result.data).toBeDefined();
      expect(mockLogger.debug).toHaveBeenCalledWith(
        expect.stringContaining('Loaded, expanded, and validated config'),
      );
    });

    it('should return defaults when file does not exist', async () => {
      vi.mocked(fs.existsSync).mockReturnValue(false);

      const result = await loadConfig('missing.config.json', mockLogger);

      expect(result.path).toContain('missing.config.json');
      expect(result.exists).toBe(false);
      expect(result.data).toBeDefined();
      expect(mockLogger.debug).toHaveBeenCalledWith(
        expect.stringContaining('Config file not found'),
      );
    });

    it('should handle absolute paths', async () => {
      const absolutePath = '/absolute/path/config.json';
      vi.mocked(fs.existsSync).mockReturnValue(false);

      const result = await loadConfig(absolutePath, mockLogger);

      expect(result.path).toBe(absolutePath);
    });

    it('should handle relative paths', async () => {
      const relativePath = './config.json';
      vi.mocked(fs.existsSync).mockReturnValue(false);

      const result = await loadConfig(relativePath, mockLogger);

      expect(result.path).toContain('config.json');
      expect(result.path).not.toBe(relativePath);
    });
  });

  describe('JSON Parsing', () => {
    it('should parse valid JSON', async () => {
      const configContent = '{"version": 1, "mcpServers": {}}';
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fsPromises.readFile).mockResolvedValue(configContent);

      const result = await loadConfig('config.json', mockLogger);

      expect(result.exists).toBe(true);
      expect(result.data).toBeDefined();
    });

    it('should parse JSONC with comments', async () => {
      const configContent = `{
        // This is a comment
        "version": 1,
        /* Multi-line
           comment */
        "mcpServers": {
          "test": {
            "command": "test", // inline comment
          }
        }
      }`;
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fsPromises.readFile).mockResolvedValue(configContent);

      const result = await loadConfig('config.jsonc', mockLogger);

      expect(result.exists).toBe(true);
      expect(result.data).toBeDefined();
    });

    it('should handle invalid JSON', async () => {
      const invalidJson = '{ invalid json }';
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fsPromises.readFile).mockResolvedValue(invalidJson);

      await expect(loadConfig('config.json', mockLogger)).rejects.toThrow(
        'Invalid JSON in configuration file',
      );
      expect(mockLogger.error).toHaveBeenCalled();
    });

    it('should handle trailing commas', async () => {
      const jsonWithTrailingComma = `{
        "version": 1,
        "mcpServers": {
          "test": {
            "command": "test",
          },
        },
      }`;
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fsPromises.readFile).mockResolvedValue(jsonWithTrailingComma);

      const result = await loadConfig('config.json', mockLogger);

      expect(result.exists).toBe(true);
      expect(result.data).toBeDefined();
    });
  });

  describe('Validation', () => {
    it('should validate environment variables', async () => {
      const { validateEnvironmentVariables } = await import('@hatago/core');
      const configContent = '{"version": 1}';

      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fsPromises.readFile).mockResolvedValue(configContent);
      vi.mocked(validateEnvironmentVariables).mockImplementation(() => {
        throw new Error('Missing env var: TEST_VAR');
      });

      await expect(loadConfig('config.json', mockLogger)).rejects.toThrow(
        'Missing env var: TEST_VAR',
      );
      expect(mockLogger.error).toHaveBeenCalledWith(
        expect.stringContaining('Environment variable validation failed'),
      );
    });

    it('should expand environment variables', async () => {
      const { expandConfig, validateEnvironmentVariables } = await import(
        '@hatago/core'
      );
      const configContent = '{"version": 1, "test": "${TEST_VAR}"}';
      const expandedData = { version: 1, test: 'expanded-value' };

      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fsPromises.readFile).mockResolvedValue(configContent);
      vi.mocked(validateEnvironmentVariables).mockImplementation(() => {}); // Pass validation
      vi.mocked(expandConfig).mockReturnValue(expandedData);

      const result = await loadConfig('config.json', mockLogger);

      expect(expandConfig).toHaveBeenCalledWith(
        expect.objectContaining({ test: '${TEST_VAR}' }),
      );
      expect(result.data).toEqual(expandedData);
    });

    it('should handle validation errors', async () => {
      const {
        safeParseConfig,
        formatConfigError,
        validateEnvironmentVariables,
      } = await import('@hatago/core');
      const configContent = '{"version": 1}';

      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fsPromises.readFile).mockResolvedValue(configContent);
      vi.mocked(validateEnvironmentVariables).mockImplementation(() => {}); // Pass validation
      vi.mocked(safeParseConfig).mockReturnValue({
        success: false,
        error: new Error('Validation failed'),
      } as any);
      vi.mocked(formatConfigError).mockReturnValue(
        'Formatted validation error',
      );

      await expect(loadConfig('config.json', mockLogger)).rejects.toThrow(
        'Formatted validation error',
      );
      expect(mockLogger.error).toHaveBeenCalledWith(
        'Formatted validation error',
      );
    });
  });

  describe('Error Handling', () => {
    it('should handle file read errors', async () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fsPromises.readFile).mockRejectedValue(
        new Error('Permission denied'),
      );

      await expect(loadConfig('config.json', mockLogger)).rejects.toThrow(
        'Permission denied',
      );
      expect(mockLogger.error).toHaveBeenCalledWith(
        expect.stringContaining('Failed to load config'),
        expect.any(Error),
      );
    });

    it('should handle unexpected errors', async () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fsPromises.readFile).mockResolvedValue('{}');

      // Force an unexpected error
      const { expandConfig, validateEnvironmentVariables } = await import(
        '@hatago/core'
      );
      vi.mocked(validateEnvironmentVariables).mockImplementation(() => {}); // Pass validation
      vi.mocked(expandConfig).mockImplementation(() => {
        throw new Error('Unexpected error');
      });

      await expect(loadConfig('config.json', mockLogger)).rejects.toThrow(
        'Unexpected error',
      );
    });
  });
});
