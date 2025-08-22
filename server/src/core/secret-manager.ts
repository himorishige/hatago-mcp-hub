/**
 * Secret manager for Hatago
 */

import { existsSync } from 'node:fs';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { isAbsolute, join } from 'node:path';
import type { Logger } from 'pino';
import {
  calculateIntegrity,
  decrypt,
  detectSecretFormat,
  type EncryptedSecret,
  encrypt,
  MasterKeyManager,
  type PlainSecret,
  validateSecretDocument,
  verifyIntegrity,
} from '../utils/crypto.js';
import { ErrorHelpers } from '../utils/errors.js';

/**
 * Secret storage format
 */
export interface SecretStorage {
  version: 1;
  secrets: Record<string, PlainSecret | EncryptedSecret>;
}

/**
 * Secret manager options
 */
export interface SecretManagerOptions {
  baseDir?: string;
  plainMode?: boolean;
  allowPlain?: boolean;
  logger?: Logger;
}

/**
 * Secret policy
 */
export interface SecretPolicy {
  allowPlain: boolean;
  requireEncryption?: string[]; // Keys that must be encrypted
  maxSecrets?: number;
  allowedLabels?: string[];
}

/**
 * Secret manager
 */
export class SecretManager {
  private baseDir: string;
  private secretsPath: string;
  private policyPath: string;
  private plainMode: boolean;
  private allowPlain: boolean;
  private logger?: Logger;
  private keyManager: MasterKeyManager;
  private masterKey?: string;
  private encryptionKey?: Buffer;
  private storage?: SecretStorage;

  constructor(options: SecretManagerOptions = {}) {
    const baseDir = options.baseDir || '.hatago';
    // Use baseDir as-is if it's absolute, otherwise resolve from cwd
    this.baseDir = isAbsolute(baseDir) ? baseDir : join(process.cwd(), baseDir);
    this.secretsPath = join(this.baseDir, 'secrets.json');
    this.policyPath = join(this.baseDir, 'secrets.policy.json');
    this.plainMode = options.plainMode || false;
    this.allowPlain = options.allowPlain !== false; // Default true
    this.logger = options.logger;
    // Pass the resolved baseDir to MasterKeyManager
    this.keyManager = new MasterKeyManager(this.baseDir);
  }

  /**
   * Initialize secret manager
   */
  async initialize(options: { plain?: boolean } = {}): Promise<void> {
    // Create directory if not exists
    if (!existsSync(this.baseDir)) {
      await mkdir(this.baseDir, { recursive: true });
    }

    // Create .gitignore in .hatago directory if not exists
    await this.ensureGitignore();

    // Set mode
    if (options.plain) {
      this.plainMode = true;
    }

    // Load or generate master key (if not in plain mode)
    if (!this.plainMode) {
      this.masterKey = await this.keyManager.loadOrGenerate();
      this.encryptionKey = await this.keyManager.deriveEncryptionKey(
        this.masterKey,
      );
      this.logger?.info('Secret manager initialized with encryption');
    } else {
      this.logger?.info('Secret manager initialized in plain mode');
    }

    // Load existing storage
    await this.loadStorage();

    // Check policy
    await this.checkPolicy();
  }

  /**
   * Load storage from disk
   */
  private async loadStorage(): Promise<void> {
    try {
      const data = await readFile(this.secretsPath, 'utf-8');
      const parsed = JSON.parse(data);

      if (parsed.version !== 1) {
        throw ErrorHelpers.unsupportedStorageVersion(String(parsed.version));
      }

      // Validate all secrets
      for (const [key, secret] of Object.entries(parsed.secrets)) {
        if (!validateSecretDocument(secret)) {
          throw ErrorHelpers.invalidSecretFormat(key);
        }
      }

      this.storage = parsed as SecretStorage;
    } catch (error) {
      // Initialize empty storage if file doesn't exist
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        this.storage = {
          version: 1,
          secrets: {},
        };
      } else {
        throw error;
      }
    }
  }

  /**
   * Save storage to disk
   */
  private async saveStorage(): Promise<void> {
    if (!this.storage) {
      throw ErrorHelpers.storageNotInitialized();
    }

    await writeFile(this.secretsPath, JSON.stringify(this.storage, null, 2), {
      mode: 0o600, // Owner read/write only
      encoding: 'utf-8',
    });
  }

  /**
   * Ensure .gitignore exists in .hatago directory
   */
  private async ensureGitignore(): Promise<void> {
    const gitignorePath = join(this.baseDir, '.gitignore');

    try {
      await readFile(gitignorePath, 'utf-8');
      // File exists, no need to create
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        // Create .gitignore with security-critical files
        const gitignoreContent = `# SECURITY WARNING: Never commit these files!
# They contain encryption keys and secrets

# Master encryption key - NEVER share or commit this
master.key

# Salt for key derivation - Keep this secret
master.salt

# Encrypted secrets storage
secrets.json

# Secret management policy
secrets.policy.json

# Any backup files
*.backup
*.bak
*~

# Temporary files
*.tmp
*.temp
`;

        await writeFile(gitignorePath, gitignoreContent, {
          encoding: 'utf-8',
          mode: 0o644,
        });

        this.logger?.info(
          'Created .gitignore in .hatago directory for security',
        );
      } else {
        // Other error, ignore
      }
    }
  }

  /**
   * Check policy
   */
  private async checkPolicy(): Promise<void> {
    try {
      const data = await readFile(this.policyPath, 'utf-8');
      const policy: SecretPolicy = JSON.parse(data);

      // Apply policy
      if (!policy.allowPlain && this.plainMode) {
        throw ErrorHelpers.plainModeNotAllowed();
      }

      this.allowPlain = policy.allowPlain;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
        throw error;
      }
      // No policy file, use defaults
    }
  }

  /**
   * Set a secret
   */
  async set(
    key: string,
    value: string,
    options: {
      plain?: boolean;
      labels?: string[];
    } = {},
  ): Promise<void> {
    if (!this.storage) {
      throw ErrorHelpers.secretManagerNotInitialized();
    }

    // Validate key
    if (!key || typeof key !== 'string') {
      throw ErrorHelpers.invalidKey();
    }

    if (!value || typeof value !== 'string') {
      throw ErrorHelpers.invalidValue();
    }

    const now = new Date().toISOString();
    const usePlain = options.plain || this.plainMode;

    // Check if plain mode is allowed
    if (usePlain && !this.allowPlain) {
      throw ErrorHelpers.plainTextStorageNotAllowed();
    }

    let secret: PlainSecret | EncryptedSecret;

    if (usePlain) {
      // Create plain secret
      const data = { [key]: value };
      secret = {
        type: 'hatago/secret',
        version: 1,
        enc: 'none',
        data,
        created_at: this.storage.secrets[key]?.created_at || now,
        updated_at: now,
        labels: options.labels,
        integrity: calculateIntegrity(data),
      };
    } else {
      // Create encrypted secret
      if (!this.encryptionKey) {
        throw ErrorHelpers.encryptionKeyNotAvailable();
      }

      const data = { [key]: value };
      const encrypted = encrypt(data, this.encryptionKey);

      secret = {
        type: 'hatago/secret',
        version: 1,
        enc: 'A256GCM',
        iv: encrypted.iv,
        tag: encrypted.tag,
        ct: encrypted.ct,
        created_at: this.storage.secrets[key]?.created_at || now,
        updated_at: now,
        labels: options.labels,
      };
    }

    // Store secret
    this.storage.secrets[key] = secret;
    await this.saveStorage();

    this.logger?.info({ key, encrypted: !usePlain }, 'Secret stored');
  }

  /**
   * Get a secret
   */
  async get(key: string): Promise<string | undefined> {
    if (!this.storage) {
      throw ErrorHelpers.secretManagerNotInitialized();
    }

    const secret = this.storage.secrets[key];
    if (!secret) {
      return undefined;
    }

    const format = detectSecretFormat(secret);

    if (format === 'plain') {
      const plainSecret = secret as PlainSecret;

      // Verify integrity if present
      if (plainSecret.integrity) {
        if (!verifyIntegrity(plainSecret.data, plainSecret.integrity)) {
          throw ErrorHelpers.integrityCheckFailed();
        }
      }

      return plainSecret.data[key];
    } else {
      // Decrypt
      if (!this.encryptionKey) {
        throw ErrorHelpers.encryptionKeyNotAvailable();
      }

      const encryptedSecret = secret as EncryptedSecret;
      const decrypted = decrypt(encryptedSecret, this.encryptionKey);
      return decrypted[key];
    }
  }

  /**
   * Get all secret keys
   */
  async list(): Promise<
    Array<{
      key: string;
      encrypted: boolean;
      created_at: string;
      updated_at?: string;
      labels?: string[];
    }>
  > {
    if (!this.storage) {
      throw ErrorHelpers.secretManagerNotInitialized();
    }

    return Object.keys(this.storage.secrets).map((key) => {
      const secret = this.storage?.secrets[key];
      return {
        key,
        encrypted: secret.enc !== 'none',
        created_at: secret.created_at,
        updated_at: secret.updated_at,
        labels: secret.labels,
      };
    });
  }

  /**
   * Remove a secret
   */
  async remove(key: string): Promise<boolean> {
    if (!this.storage) {
      throw ErrorHelpers.secretManagerNotInitialized();
    }

    if (!this.storage.secrets[key]) {
      return false;
    }

    delete this.storage.secrets[key];
    await this.saveStorage();

    this.logger?.info({ key }, 'Secret removed');
    return true;
  }

  /**
   * Clear all secrets
   */
  async clear(): Promise<void> {
    if (!this.storage) {
      throw ErrorHelpers.secretManagerNotInitialized();
    }

    this.storage.secrets = {};
    await this.saveStorage();

    this.logger?.info('All secrets cleared');
  }

  /**
   * Export secrets
   */
  async export(
    options: { plain?: boolean; format?: 'json' | 'env' } = {},
  ): Promise<string> {
    if (!this.storage) {
      throw ErrorHelpers.secretManagerNotInitialized();
    }

    const secrets: Record<string, string> = {};

    // Collect all secrets
    for (const key of Object.keys(this.storage.secrets)) {
      const value = await this.get(key);
      if (value !== undefined) {
        secrets[key] = value;
      }
    }

    // Format output
    if (options.format === 'env') {
      return Object.entries(secrets)
        .map(([key, value]) => `${key}=${value}`)
        .join('\n');
    }

    return JSON.stringify(secrets, null, 2);
  }

  /**
   * Import secrets from file
   */
  async import(
    data: string,
    options: {
      format?: 'json' | 'env';
      plain?: boolean;
    } = {},
  ): Promise<number> {
    let secrets: Record<string, string>;

    if (options.format === 'env' || data.includes('=')) {
      // Parse env format
      secrets = {};
      const lines = data.split('\n');
      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith('#')) {
          continue;
        }
        const [key, ...valueParts] = trimmed.split('=');
        if (key) {
          secrets[key.trim()] = valueParts.join('=').trim();
        }
      }
    } else {
      // Parse JSON format
      secrets = JSON.parse(data);
    }

    // Import each secret
    let count = 0;
    for (const [key, value] of Object.entries(secrets)) {
      await this.set(key, value, { plain: options.plain });
      count++;
    }

    return count;
  }

  /**
   * Rotate encryption keys
   */
  async rotate(): Promise<void> {
    if (!this.storage) {
      throw ErrorHelpers.secretManagerNotInitialized();
    }

    if (this.plainMode) {
      throw ErrorHelpers.cannotRotateKeysInPlainMode();
    }

    // Generate new master key
    const { base64urlEncode, generateRandomBytes } = await import(
      '../utils/crypto.js'
    );
    const newMasterKey = base64urlEncode(generateRandomBytes(32));
    const newEncryptionKey =
      await this.keyManager.deriveEncryptionKey(newMasterKey);

    // Re-encrypt all secrets
    const newSecrets: Record<string, PlainSecret | EncryptedSecret> = {};

    for (const [key, secret] of Object.entries(this.storage.secrets)) {
      if (secret.enc === 'none') {
        // Keep plain secrets as-is
        newSecrets[key] = secret;
      } else {
        // Decrypt with old key and re-encrypt with new key
        const value = await this.get(key);
        if (value !== undefined) {
          const data = { [key]: value };
          const encrypted = encrypt(data, newEncryptionKey);

          newSecrets[key] = {
            ...secret,
            iv: encrypted.iv,
            tag: encrypted.tag,
            ct: encrypted.ct,
            updated_at: new Date().toISOString(),
          } as EncryptedSecret;
        }
      }
    }

    // Update storage
    this.storage.secrets = newSecrets;
    await this.saveStorage();

    // Save new master key
    await this.keyManager.save(newMasterKey);
    this.masterKey = newMasterKey;
    this.encryptionKey = newEncryptionKey;

    this.logger?.info('Encryption keys rotated successfully');
  }

  /**
   * Get storage statistics
   */
  getStats(): {
    total: number;
    encrypted: number;
    plain: number;
  } {
    if (!this.storage) {
      return { total: 0, encrypted: 0, plain: 0 };
    }

    let encrypted = 0;
    let plain = 0;

    for (const secret of Object.values(this.storage.secrets)) {
      if (secret.enc === 'none') {
        plain++;
      } else {
        encrypted++;
      }
    }

    return {
      total: encrypted + plain,
      encrypted,
      plain,
    };
  }
}
