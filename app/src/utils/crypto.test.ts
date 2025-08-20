/**
 * Tests for crypto utilities
 */

import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  base64urlDecode,
  base64urlEncode,
  calculateIntegrity,
  createAAD,
  decrypt,
  deriveKey,
  detectSecretFormat,
  type EncryptedSecret,
  encrypt,
  generateRandomBytes,
  MasterKeyManager,
  type PlainSecret,
  validateSecretDocument,
  verifyIntegrity,
} from './crypto.js';

describe('Crypto Utilities', () => {
  describe('base64url encoding', () => {
    it('should encode and decode correctly', () => {
      const buffer = Buffer.from('hello world');
      const encoded = base64urlEncode(buffer);
      const decoded = base64urlDecode(encoded);

      expect(encoded).toBe('aGVsbG8gd29ybGQ');
      expect(decoded.toString()).toBe('hello world');
    });

    it('should handle binary data', () => {
      const buffer = generateRandomBytes(32);
      const encoded = base64urlEncode(buffer);
      const decoded = base64urlDecode(encoded);

      expect(decoded).toEqual(buffer);
    });
  });

  describe('random bytes generation', () => {
    it('should generate random bytes of correct length', () => {
      const bytes = generateRandomBytes(16);
      expect(bytes).toBeInstanceOf(Buffer);
      expect(bytes.length).toBe(16);
    });

    it('should generate different values', () => {
      const bytes1 = generateRandomBytes(16);
      const bytes2 = generateRandomBytes(16);
      expect(bytes1).not.toEqual(bytes2);
    });
  });

  describe('key derivation', () => {
    it('should derive consistent keys', () => {
      const masterKey = 'test-master-key';
      const salt = Buffer.from('test-salt');

      const key1 = deriveKey(masterKey, salt);
      const key2 = deriveKey(masterKey, salt);

      expect(key1).toEqual(key2);
      expect(key1.length).toBe(32);
    });

    it('should derive different keys with different salts', () => {
      const masterKey = 'test-master-key';
      const salt1 = Buffer.from('salt1');
      const salt2 = Buffer.from('salt2');

      const key1 = deriveKey(masterKey, salt1);
      const key2 = deriveKey(masterKey, salt2);

      expect(key1).not.toEqual(key2);
    });
  });

  describe('AAD creation', () => {
    it('should create consistent AAD', () => {
      const doc = {
        type: 'hatago/secret' as const,
        version: 1 as const,
        enc: 'A256GCM' as const,
        created_at: '2025-08-20T00:00:00Z',
      };

      const aad1 = createAAD(doc);
      const aad2 = createAAD(doc);

      expect(aad1).toEqual(aad2);
    });

    it('should sort keys consistently', () => {
      const doc1 = {
        version: 1 as const,
        type: 'hatago/secret' as const,
        enc: 'A256GCM' as const,
        created_at: '2025-08-20T00:00:00Z',
      };

      const doc2 = {
        type: 'hatago/secret' as const,
        version: 1 as const,
        enc: 'A256GCM' as const,
        created_at: '2025-08-20T00:00:00Z',
      };

      const aad1 = createAAD(doc1);
      const aad2 = createAAD(doc2);

      expect(aad1).toEqual(aad2);
    });
  });

  describe('encryption and decryption', () => {
    it('should encrypt and decrypt data correctly', () => {
      const data = { API_KEY: 'secret-value-123' };
      const key = generateRandomBytes(32);

      const encrypted = encrypt(data, key);
      expect(encrypted.iv).toBeDefined();
      expect(encrypted.tag).toBeDefined();
      expect(encrypted.ct).toBeDefined();

      const doc: EncryptedSecret = {
        type: 'hatago/secret',
        version: 1,
        enc: 'A256GCM',
        iv: encrypted.iv,
        tag: encrypted.tag,
        ct: encrypted.ct,
        created_at: new Date().toISOString(),
      };

      const decrypted = decrypt(doc, key);
      expect(decrypted).toEqual(data);
    });

    it('should fail with wrong key', () => {
      const data = { API_KEY: 'secret-value-123' };
      const key1 = generateRandomBytes(32);
      const key2 = generateRandomBytes(32);

      const encrypted = encrypt(data, key1);
      const doc: EncryptedSecret = {
        type: 'hatago/secret',
        version: 1,
        enc: 'A256GCM',
        iv: encrypted.iv,
        tag: encrypted.tag,
        ct: encrypted.ct,
        created_at: new Date().toISOString(),
      };

      expect(() => decrypt(doc, key2)).toThrow('Failed to decrypt data');
    });
  });

  describe('integrity checks', () => {
    it('should calculate consistent integrity hash', () => {
      const data = { KEY: 'value' };
      const hash1 = calculateIntegrity(data);
      const hash2 = calculateIntegrity(data);

      expect(hash1).toBe(hash2);
    });

    it('should verify integrity correctly', () => {
      const data = { KEY: 'value' };
      const hash = calculateIntegrity(data);

      expect(verifyIntegrity(data, hash)).toBe(true);
      expect(verifyIntegrity({ KEY: 'different' }, hash)).toBe(false);
    });
  });

  describe('document validation', () => {
    it('should validate plain secret', () => {
      const doc: PlainSecret = {
        type: 'hatago/secret',
        version: 1,
        enc: 'none',
        data: { KEY: 'value' },
        created_at: '2025-08-20T00:00:00Z',
      };

      expect(validateSecretDocument(doc)).toBe(true);
    });

    it('should validate encrypted secret', () => {
      const doc: EncryptedSecret = {
        type: 'hatago/secret',
        version: 1,
        enc: 'A256GCM',
        iv: 'base64url',
        tag: 'base64url',
        ct: 'base64url',
        created_at: '2025-08-20T00:00:00Z',
      };

      expect(validateSecretDocument(doc)).toBe(true);
    });

    it('should reject invalid documents', () => {
      expect(validateSecretDocument(null)).toBe(false);
      expect(validateSecretDocument({})).toBe(false);
      expect(validateSecretDocument({ type: 'wrong' })).toBe(false);
      expect(
        validateSecretDocument({
          type: 'hatago/secret',
          version: 2,
          enc: 'none',
          data: {},
          created_at: '2025',
        }),
      ).toBe(false);
    });
  });

  describe('format detection', () => {
    it('should detect plain format', () => {
      const doc: PlainSecret = {
        type: 'hatago/secret',
        version: 1,
        enc: 'none',
        data: {},
        created_at: '2025-08-20T00:00:00Z',
      };

      expect(detectSecretFormat(doc)).toBe('plain');
    });

    it('should detect encrypted format', () => {
      const doc: EncryptedSecret = {
        type: 'hatago/secret',
        version: 1,
        enc: 'A256GCM',
        iv: 'iv',
        tag: 'tag',
        ct: 'ct',
        created_at: '2025-08-20T00:00:00Z',
      };

      expect(detectSecretFormat(doc)).toBe('encrypted');
    });
  });
});

describe('MasterKeyManager', () => {
  let tempDir: string;
  let manager: MasterKeyManager;

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), 'hatago-test-'));
    manager = new MasterKeyManager(tempDir);
  });

  afterEach(async () => {
    await rm(tempDir, { recursive: true });
  });

  it('should generate and save master key', async () => {
    const exists1 = await manager.exists();
    expect(exists1).toBe(false);

    const key = await manager.loadOrGenerate();
    expect(key).toBeDefined();
    expect(key.length).toBeGreaterThan(0);

    const exists2 = await manager.exists();
    expect(exists2).toBe(true);
  });

  it('should load existing master key', async () => {
    const key1 = await manager.loadOrGenerate();
    const key2 = await manager.loadOrGenerate();
    expect(key1).toBe(key2);
  });

  it('should derive encryption key', async () => {
    const masterKey = await manager.loadOrGenerate();
    const encKey = await manager.deriveEncryptionKey(masterKey);
    expect(encKey).toBeInstanceOf(Buffer);
    expect(encKey.length).toBe(32);
  });

  it('should delete master key', async () => {
    await manager.loadOrGenerate();
    expect(await manager.exists()).toBe(true);

    await manager.delete();
    expect(await manager.exists()).toBe(false);
  });
});
