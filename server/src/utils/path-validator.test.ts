import { describe, expect, it } from 'vitest';
import {
  generateSafeFilename,
  isPathSafeForOperation,
  sanitizePath,
  validateCommandPath,
  validatePath,
} from './path-validator.js';

describe('Path Validator', () => {
  describe('validatePath', () => {
    it('should accept safe paths', async () => {
      const result = await validatePath('src/index.ts');
      expect(result.valid).toBe(true);
      expect(result.issues).toHaveLength(0);
    });

    it('should reject paths with null bytes', async () => {
      const result = await validatePath('file\0name.txt');
      expect(result.valid).toBe(false);
      expect(result.issues).toContain('Path contains null bytes');
    });

    it('should reject paths with directory traversal', async () => {
      const result = await validatePath('../../../etc/passwd');
      expect(result.valid).toBe(false);
      expect(result.issues).toContain(
        'Path contains directory traversal sequences',
      );
    });

    it('should reject absolute paths when not allowed', async () => {
      const result = await validatePath('/etc/passwd', {
        allowAbsolute: false,
      });
      expect(result.valid).toBe(false);
      expect(result.issues).toContain('Absolute paths are not allowed');
    });

    it('should reject paths escaping base directory', async () => {
      const result = await validatePath('../../outside', {
        basePath: '/safe/dir',
      });
      expect(result.valid).toBe(false);
      expect(result.issues).toContain('Path escapes the base directory');
    });

    it('should detect hidden files', async () => {
      const result = await validatePath('.hidden');
      expect(result.valid).toBe(false);
      expect(result.issues).toContain('Hidden file/directory access');
    });

    it('should detect executable extensions', async () => {
      const result = await validatePath('script.sh');
      expect(result.valid).toBe(false);
      expect(result.issues).toContain('Executable file extension');
    });

    it('should detect sensitive file extensions', async () => {
      const result = await validatePath('config.env');
      expect(result.valid).toBe(false);
      expect(result.issues).toContain('Sensitive file extension');
    });
  });

  describe('validateCommandPath', () => {
    it('should reject commands with shell injection characters', async () => {
      const result = await validateCommandPath('rm -rf /; echo "pwned"');
      expect(result.valid).toBe(false);
      expect(result.issues.some((i) => i.includes('dangerous character'))).toBe(
        true,
      );
    });

    it('should reject dangerous commands', async () => {
      const result = await validateCommandPath('rm');
      expect(result.valid).toBe(false);
      expect(result.issues).toContain('Potentially dangerous command: rm');
    });

    it('should enforce allowed commands list', async () => {
      const result = await validateCommandPath('node', {
        allowedCommands: ['python', 'npm'],
      });
      expect(result.valid).toBe(false);
      expect(result.issues).toContain('Command not in allowed list: node');
    });

    it('should accept allowed commands', async () => {
      const result = await validateCommandPath('node', {
        allowedCommands: ['node', 'npm'],
      });
      expect(result.valid).toBe(true);
    });
  });

  describe('sanitizePath', () => {
    it('should remove null bytes', () => {
      const result = sanitizePath('file\0name.txt');
      expect(result).toBe('filename.txt');
    });

    it('should remove control characters', () => {
      const result = sanitizePath('file\x00\x1fname.txt');
      expect(result).toBe('filename.txt');
    });

    it('should normalize paths', () => {
      const result = sanitizePath('./foo/../bar/./baz');
      expect(result).toBe('bar/baz');
    });

    it('should restrict to base path', () => {
      const result = sanitizePath('../../etc/passwd', '/safe/dir');
      expect(result).toBe('/safe/dir');
    });
  });

  describe('isPathSafeForOperation', () => {
    it('should allow safe read operations', async () => {
      const result = await isPathSafeForOperation('src/index.ts', 'read', {
        allowedExtensions: ['ts', 'js'],
      });
      expect(result).toBe(true);
    });

    it('should block write to critical files', async () => {
      const result = await isPathSafeForOperation('package.json', 'write');
      expect(result).toBe(false);
    });

    it('should block execution of config files', async () => {
      const result = await isPathSafeForOperation('config.json', 'execute');
      expect(result).toBe(false);
    });

    it('should respect extension restrictions', async () => {
      const result = await isPathSafeForOperation('script.py', 'read', {
        allowedExtensions: ['js', 'ts'],
      });
      expect(result).toBe(false);
    });

    it('should block blacklisted extensions', async () => {
      const result = await isPathSafeForOperation('file.exe', 'read', {
        blockedExtensions: ['exe', 'dll'],
      });
      expect(result).toBe(false);
    });
  });

  describe('generateSafeFilename', () => {
    it('should sanitize special characters', () => {
      const result = generateSafeFilename('file<>:|?.txt');
      expect(result).toBe('file_____.txt');
    });

    it('should replace spaces', () => {
      const result = generateSafeFilename('my file name.txt');
      expect(result).toBe('my_file_name.txt');
    });

    it('should handle multiple dots', () => {
      const result = generateSafeFilename('file...txt');
      expect(result).toBe('file_txt');
    });

    it('should not start with dot', () => {
      const result = generateSafeFilename('.hidden');
      expect(result).toBe('_hidden');
    });

    it('should truncate long names', () => {
      const longName = `${'a'.repeat(300)}.txt`;
      const result = generateSafeFilename(longName, 255);
      expect(result.length).toBeLessThanOrEqual(255);
      expect(result.endsWith('.txt')).toBe(true);
    });

    it('should handle empty input', () => {
      const result = generateSafeFilename('');
      expect(result).toBe('file');
    });
  });
});
