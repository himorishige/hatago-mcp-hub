import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { SecretManagerOptions } from './secret-manager.js';
import { SecretManager } from './secret-manager.js';

// Mock fs module
vi.mock('node:fs/promises', () => ({
  readFile: vi.fn(),
  writeFile: vi.fn(),
  mkdir: vi.fn(),
  access: vi.fn(),
  rm: vi.fn(),
}));

// Mock crypto module
vi.mock('node:crypto', () => ({
  randomBytes: vi.fn().mockReturnValue(Buffer.from('random-bytes')),
  createCipheriv: vi.fn().mockReturnValue({
    update: vi.fn().mockReturnValue(Buffer.from('encrypted')),
    final: vi.fn().mockReturnValue(Buffer.from('')),
  }),
  createDecipheriv: vi.fn().mockReturnValue({
    update: vi.fn().mockReturnValue(Buffer.from('decrypted')),
    final: vi.fn().mockReturnValue(Buffer.from('')),
  }),
  scryptSync: vi.fn().mockReturnValue(Buffer.from('derived-key')),
  pbkdf2Sync: vi.fn().mockReturnValue(Buffer.from('derived-key')),
}));

describe('SecretManager', () => {
  let manager: SecretManager;
  const mockOptions: SecretManagerOptions = {
    baseDir: '/test/.hatago',
    plainMode: false,
    allowPlain: false,
  };

  beforeEach(() => {
    vi.clearAllMocks();
    manager = new SecretManager(mockOptions);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('initialize', () => {
    it('should initialize directories and load storage', async () => {
      const fs = await import('node:fs/promises');
      vi.mocked(fs.access).mockResolvedValue(undefined);
      vi.mocked(fs.readFile).mockResolvedValue('{"version":1,"secrets":{}}');

      await manager.initialize();

      expect(fs.mkdir).toHaveBeenCalled();
      expect(fs.readFile).toHaveBeenCalled();
    });

    it('should create new storage if file does not exist', async () => {
      const fs = await import('node:fs/promises');
      vi.mocked(fs.access).mockRejectedValue(new Error('ENOENT'));
      vi.mocked(fs.readFile).mockRejectedValue(new Error('ENOENT'));

      await manager.initialize();

      expect(fs.writeFile).toHaveBeenCalled();
    });
  });

  describe('set', () => {
    it('should store a secret', async () => {
      const fs = await import('node:fs/promises');
      vi.mocked(fs.readFile).mockResolvedValue('{"version":1,"secrets":{}}');
      vi.mocked(fs.writeFile).mockResolvedValue(undefined);

      await manager.initialize();
      await manager.set('API_KEY', 'secret-value');

      expect(fs.writeFile).toHaveBeenCalled();
    });

    it('should check policy before storing', async () => {
      const fs = await import('node:fs/promises');
      vi.mocked(fs.readFile).mockResolvedValue(
        JSON.stringify({
          rules: [
            {
              pattern: 'API_*',
              required: true,
              format: '^[A-Z0-9]+$',
            },
          ],
        }),
      );

      await manager.initialize();

      // This should fail format validation
      await expect(manager.set('API_KEY', 'invalid-format')).rejects.toThrow();
    });

    it('should reject storing in plain mode when not allowed', async () => {
      manager = new SecretManager({
        ...mockOptions,
        plainMode: true,
        allowPlain: false,
      });

      await manager.initialize();

      await expect(manager.set('SECRET', 'value')).rejects.toThrow();
    });
  });

  describe('get', () => {
    it('should retrieve a stored secret', async () => {
      const fs = await import('node:fs/promises');
      vi.mocked(fs.readFile).mockResolvedValue(
        JSON.stringify({
          version: 1,
          secrets: {
            API_KEY: {
              encrypted: 'encrypted-value',
              salt: 'salt',
              iv: 'iv',
              tag: 'tag',
            },
          },
        }),
      );

      await manager.initialize();
      const value = await manager.get('API_KEY');

      expect(value).toBeDefined();
    });

    it('should return undefined for non-existent secret', async () => {
      const fs = await import('node:fs/promises');
      vi.mocked(fs.readFile).mockResolvedValue('{"version":1,"secrets":{}}');

      await manager.initialize();
      const value = await manager.get('NON_EXISTENT');

      expect(value).toBeUndefined();
    });
  });

  describe('remove', () => {
    it('should remove a secret', async () => {
      const fs = await import('node:fs/promises');
      vi.mocked(fs.readFile).mockResolvedValue(
        JSON.stringify({
          version: 1,
          secrets: {
            API_KEY: {
              encrypted: 'encrypted-value',
            },
          },
        }),
      );

      await manager.initialize();
      const result = await manager.remove('API_KEY');

      expect(result).toBe(true);
      expect(fs.writeFile).toHaveBeenCalled();
    });

    it('should return false for non-existent secret', async () => {
      const fs = await import('node:fs/promises');
      vi.mocked(fs.readFile).mockResolvedValue('{"version":1,"secrets":{}}');

      await manager.initialize();
      const result = await manager.remove('NON_EXISTENT');

      expect(result).toBe(false);
    });
  });

  describe('list', () => {
    it('should list all secret keys', async () => {
      const fs = await import('node:fs/promises');
      vi.mocked(fs.readFile).mockResolvedValue(
        JSON.stringify({
          version: 1,
          secrets: {
            API_KEY: { encrypted: 'value1' },
            DB_PASSWORD: { encrypted: 'value2' },
          },
        }),
      );

      await manager.initialize();
      const keys = await manager.list();

      expect(keys).toContain('API_KEY');
      expect(keys).toContain('DB_PASSWORD');
      expect(keys).toHaveLength(2);
    });

    it('should return empty array when no secrets', async () => {
      const fs = await import('node:fs/promises');
      vi.mocked(fs.readFile).mockResolvedValue('{"version":1,"secrets":{}}');

      await manager.initialize();
      const keys = await manager.list();

      expect(keys).toHaveLength(0);
    });
  });

  describe('clear', () => {
    it('should clear all secrets', async () => {
      const fs = await import('node:fs/promises');
      vi.mocked(fs.readFile).mockResolvedValue(
        JSON.stringify({
          version: 1,
          secrets: {
            API_KEY: { encrypted: 'value1' },
            DB_PASSWORD: { encrypted: 'value2' },
          },
        }),
      );

      await manager.initialize();
      await manager.clear();

      expect(fs.writeFile).toHaveBeenCalledWith(
        expect.any(String),
        expect.stringContaining('{}'),
        'utf-8',
      );
    });
  });

  describe('export', () => {
    it('should export secrets', async () => {
      const fs = await import('node:fs/promises');
      vi.mocked(fs.readFile).mockResolvedValue(
        JSON.stringify({
          version: 1,
          secrets: {
            API_KEY: { plain: 'value1' },
          },
        }),
      );

      manager = new SecretManager({
        ...mockOptions,
        plainMode: true,
        allowPlain: true,
      });

      await manager.initialize();
      const exported = await manager.export();

      expect(exported).toHaveProperty('API_KEY', 'value1');
    });

    it('should throw when exporting encrypted secrets', async () => {
      const fs = await import('node:fs/promises');
      vi.mocked(fs.readFile).mockResolvedValue(
        JSON.stringify({
          version: 1,
          secrets: {
            API_KEY: { encrypted: 'value' },
          },
        }),
      );

      await manager.initialize();

      await expect(manager.export()).rejects.toThrow();
    });
  });

  describe('import', () => {
    it('should import secrets', async () => {
      const fs = await import('node:fs/promises');
      vi.mocked(fs.readFile).mockResolvedValue('{"version":1,"secrets":{}}');

      await manager.initialize();
      await manager.import({
        API_KEY: 'imported-value',
        DB_PASSWORD: 'imported-password',
      });

      expect(fs.writeFile).toHaveBeenCalled();
    });

    it('should merge with existing secrets', async () => {
      const fs = await import('node:fs/promises');
      vi.mocked(fs.readFile).mockResolvedValue(
        JSON.stringify({
          version: 1,
          secrets: {
            EXISTING_KEY: { plain: 'existing' },
          },
        }),
      );

      await manager.initialize();
      await manager.import(
        {
          NEW_KEY: 'new-value',
        },
        false,
      );

      // Should have called writeFile with both keys
      expect(fs.writeFile).toHaveBeenCalled();
    });
  });

  describe('getStats', () => {
    it('should return statistics', async () => {
      const fs = await import('node:fs/promises');
      vi.mocked(fs.readFile).mockResolvedValue(
        JSON.stringify({
          version: 1,
          secrets: {
            API_KEY: { encrypted: 'value1' },
            DB_PASSWORD: { plain: 'value2' },
          },
        }),
      );

      await manager.initialize();
      const stats = manager.getStats();

      expect(stats.total).toBe(2);
      expect(stats.encrypted).toBe(1);
      expect(stats.plain).toBe(1);
    });
  });
});
