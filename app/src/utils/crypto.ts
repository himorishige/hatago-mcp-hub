/**
 * Cryptographic utilities for secret management
 */

import {
  createCipheriv,
  createDecipheriv,
  createHash,
  pbkdf2Sync,
  randomBytes,
} from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

/**
 * Secret document base interface
 */
export interface SecretDocument {
  type: 'hatago/secret';
  version: 1;
  enc: 'none' | 'A256GCM';
  created_at: string;
  updated_at?: string;
  labels?: string[];
}

/**
 * Plain text secret format
 */
export interface PlainSecret extends SecretDocument {
  enc: 'none';
  data: Record<string, string>;
  integrity?: string; // Optional SHA-256 hash
}

/**
 * Encrypted secret format
 */
export interface EncryptedSecret extends SecretDocument {
  enc: 'A256GCM';
  kid?: string; // Key ID for future KMS support
  iv: string; // Base64url encoded (12 bytes)
  tag: string; // Base64url encoded (16 bytes)
  ct: string; // Base64url encoded ciphertext
}

/**
 * Crypto configuration
 */
export interface CryptoConfig {
  algorithm: 'aes-256-gcm';
  ivLength: 12; // 96 bits for GCM
  tagLength: 16; // 128 bits
  saltLength: 32; // 256 bits
  iterations: 100000; // PBKDF2 iterations
  keyLength: 32; // 256 bits
}

const DEFAULT_CONFIG: CryptoConfig = {
  algorithm: 'aes-256-gcm',
  ivLength: 12,
  tagLength: 16,
  saltLength: 32,
  iterations: 600000, // NIST SP 800-63B recommendation
  keyLength: 32,
};

/**
 * Base64url encode (no padding)
 */
export function base64urlEncode(buffer: Buffer): string {
  return buffer.toString('base64url');
}

/**
 * Base64url decode
 */
export function base64urlDecode(str: string): Buffer {
  return Buffer.from(str, 'base64url');
}

/**
 * Generate cryptographically secure random bytes
 */
export function generateRandomBytes(length: number): Buffer {
  return randomBytes(length);
}

/**
 * Derive key from master key using PBKDF2
 */
export function deriveKey(
  masterKey: string,
  salt: Buffer,
  config = DEFAULT_CONFIG,
): Buffer {
  return pbkdf2Sync(
    masterKey,
    salt,
    config.iterations,
    config.keyLength,
    'sha256',
  );
}

/**
 * Create AAD (Additional Authenticated Data) from document header
 */
export function createAAD(doc: Partial<SecretDocument>): Buffer {
  // Create a canonical representation of header fields
  const aadObject = {
    type: doc.type,
    version: doc.version,
    enc: doc.enc,
    created_at: doc.created_at,
    labels: doc.labels,
  };

  // Remove undefined values and sort keys
  const cleanedObject = Object.keys(aadObject)
    .sort()
    .reduce(
      (acc, key) => {
        const value = aadObject[key as keyof typeof aadObject];
        if (value !== undefined) {
          acc[key] = value;
        }
        return acc;
      },
      {} as Record<string, unknown>,
    );

  return Buffer.from(JSON.stringify(cleanedObject), 'utf-8');
}

/**
 * Encrypt data using AES-256-GCM
 */
export function encrypt(
  data: Record<string, string>,
  key: Buffer,
  config = DEFAULT_CONFIG,
): {
  iv: string;
  tag: string;
  ct: string;
  aad: Buffer;
} {
  // Generate random IV
  const iv = generateRandomBytes(config.ivLength);

  // Create cipher
  const cipher = createCipheriv(config.algorithm, key, iv);

  // Create AAD
  const aad = createAAD({
    type: 'hatago/secret',
    version: 1,
    enc: 'A256GCM',
    created_at: new Date().toISOString(),
  });

  // Set AAD
  cipher.setAAD(aad);

  // Encrypt data
  const plaintext = JSON.stringify(data);
  const encrypted = Buffer.concat([
    cipher.update(plaintext, 'utf8'),
    cipher.final(),
  ]);

  // Get auth tag
  const tag = cipher.getAuthTag();

  return {
    iv: base64urlEncode(iv),
    tag: base64urlEncode(tag),
    ct: base64urlEncode(encrypted),
    aad,
  };
}

/**
 * Decrypt data using AES-256-GCM
 */
export function decrypt(
  encrypted: EncryptedSecret,
  key: Buffer,
  config = DEFAULT_CONFIG,
): Record<string, string> {
  // Decode base64url values
  const iv = base64urlDecode(encrypted.iv);
  const tag = base64urlDecode(encrypted.tag);
  const ct = base64urlDecode(encrypted.ct);

  // Create decipher
  const decipher = createDecipheriv(config.algorithm, key, iv);

  // Create AAD from document header
  const aad = createAAD(encrypted);

  // Set AAD
  decipher.setAAD(aad);

  // Set auth tag
  decipher.setAuthTag(tag);

  // Decrypt
  try {
    const decrypted = Buffer.concat([decipher.update(ct), decipher.final()]);
    return JSON.parse(decrypted.toString('utf8'));
  } catch (_error) {
    // Return generic error to avoid timing attacks
    throw new Error('Failed to decrypt data');
  }
}

/**
 * Calculate SHA-256 hash for integrity check
 */
export function calculateIntegrity(data: Record<string, string>): string {
  const hash = createHash('sha256');
  hash.update(JSON.stringify(data));
  return base64urlEncode(hash.digest());
}

/**
 * Verify integrity hash
 */
export function verifyIntegrity(
  data: Record<string, string>,
  integrity: string,
): boolean {
  const calculated = calculateIntegrity(data);
  return calculated === integrity;
}

/**
 * Master key management
 */
export class MasterKeyManager {
  private baseDir: string;
  private keyPath: string;
  private saltPath: string;
  private salt?: Buffer;

  constructor(baseDir = '.hatago') {
    this.baseDir = join(process.cwd(), baseDir);
    this.keyPath = join(this.baseDir, 'master.key');
    this.saltPath = join(this.baseDir, 'master.salt');
  }

  /**
   * Load or generate master key
   */
  async loadOrGenerate(): Promise<string> {
    try {
      // Try to load existing key
      const key = await readFile(this.keyPath, 'utf-8');
      return key.trim();
    } catch {
      // Ensure directory exists
      const { dirname } = await import('node:path');
      const { mkdir } = await import('node:fs/promises');
      await mkdir(dirname(this.keyPath), { recursive: true });

      // Generate new key
      const key = base64urlEncode(generateRandomBytes(32));
      await this.save(key);
      return key;
    }
  }

  /**
   * Save master key
   */
  async save(key: string): Promise<void> {
    await writeFile(this.keyPath, key, {
      mode: 0o600, // Owner read/write only
      encoding: 'utf-8',
    });
  }

  /**
   * Load or generate salt
   */
  private async loadOrGenerateSalt(): Promise<Buffer> {
    try {
      const salt = await readFile(this.saltPath);
      return salt;
    } catch {
      // Generate new salt
      const salt = generateRandomBytes(32);
      await writeFile(this.saltPath, salt, {
        mode: 0o600,
        encoding: null,
      });
      return salt;
    }
  }

  /**
   * Derive encryption key from master key
   */
  async deriveEncryptionKey(masterKey: string): Promise<Buffer> {
    if (!this.salt) {
      this.salt = await this.loadOrGenerateSalt();
    }
    return deriveKey(masterKey, this.salt);
  }

  /**
   * Check if master key exists
   */
  async exists(): Promise<boolean> {
    try {
      await readFile(this.keyPath);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Delete master key
   */
  async delete(): Promise<void> {
    const { unlink } = await import('node:fs/promises');
    try {
      await unlink(this.keyPath);
    } catch {
      // Ignore if file doesn't exist
    }
  }
}

/**
 * Validate secret document format
 */
export function validateSecretDocument(
  doc: unknown,
): doc is PlainSecret | EncryptedSecret {
  if (!doc || typeof doc !== 'object') {
    return false;
  }

  const obj = doc as Record<string, unknown>;

  // Check required fields
  if (
    obj.type !== 'hatago/secret' ||
    obj.version !== 1 ||
    !['none', 'A256GCM'].includes(obj.enc) ||
    !obj.created_at
  ) {
    return false;
  }

  // Check format-specific fields
  if (obj.enc === 'none') {
    return typeof obj.data === 'object' && obj.data !== null;
  }

  if (obj.enc === 'A256GCM') {
    return (
      typeof obj.iv === 'string' &&
      typeof obj.tag === 'string' &&
      typeof obj.ct === 'string'
    );
  }

  return false;
}

/**
 * Detect secret format from document
 */
export function detectSecretFormat(
  doc: PlainSecret | EncryptedSecret,
): 'plain' | 'encrypted' {
  return doc.enc === 'none' ? 'plain' : 'encrypted';
}
