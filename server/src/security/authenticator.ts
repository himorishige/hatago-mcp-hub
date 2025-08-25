/**
 * Authentication
 *
 * Bearer token and API key authentication.
 */

import { createHash, randomBytes } from 'node:crypto';
import { incrementCounter, METRICS } from '../observability/metrics.js';
import type { LogContext } from '../observability/structured-logger.js';
import { logger } from '../observability/structured-logger.js';

export interface AuthToken {
  id: string;
  type: 'bearer' | 'api-key';
  value: string;
  hashedValue: string;
  scopes: string[];
  metadata: {
    name?: string;
    description?: string;
    createdAt: number;
    expiresAt?: number;
    lastUsed?: number;
    usageCount: number;
  };
}

export interface AuthContext {
  tokenId: string;
  type: 'bearer' | 'api-key';
  scopes: string[];
  metadata: AuthToken['metadata'];
}

export interface AuthenticatorOptions {
  hashAlgorithm?: string;
  bearerPrefix?: string;
  apiKeyPrefix?: string;
}

export class Authenticator {
  private tokens = new Map<string, AuthToken>();
  private readonly options: Required<AuthenticatorOptions>;

  constructor(options: AuthenticatorOptions = {}) {
    this.options = {
      hashAlgorithm: options.hashAlgorithm ?? 'sha256',
      bearerPrefix: options.bearerPrefix ?? 'htg_',
      apiKeyPrefix: options.apiKeyPrefix ?? 'hak_',
    };
  }

  /**
   * Generate a new Bearer token
   */
  generateBearerToken(
    scopes: string[],
    metadata: Partial<AuthToken['metadata']> = {},
  ): AuthToken {
    const id = this.generateTokenId();
    const value = `${this.options.bearerPrefix}${this.generateTokenValue()}`;
    const hashedValue = this.hashToken(value);

    const token: AuthToken = {
      id,
      type: 'bearer',
      value,
      hashedValue,
      scopes,
      metadata: {
        name: metadata.name,
        description: metadata.description,
        createdAt: Date.now(),
        expiresAt: metadata.expiresAt,
        usageCount: 0,
      },
    };

    this.tokens.set(hashedValue, token);

    logger.security({
      event: 'auth_success',
      reason: 'token_created',
      tokenId: id,
      tokenType: 'bearer',
      scopes: scopes.join(','),
    });

    return token;
  }

  /**
   * Generate a new API key
   */
  generateApiKey(
    scopes: string[],
    metadata: Partial<AuthToken['metadata']> = {},
  ): AuthToken {
    const id = this.generateTokenId();
    const value = `${this.options.apiKeyPrefix}${this.generateTokenValue()}`;
    const hashedValue = this.hashToken(value);

    const token: AuthToken = {
      id,
      type: 'api-key',
      value,
      hashedValue,
      scopes,
      metadata: {
        name: metadata.name,
        description: metadata.description,
        createdAt: Date.now(),
        expiresAt: metadata.expiresAt,
        usageCount: 0,
      },
    };

    this.tokens.set(hashedValue, token);

    logger.security({
      event: 'auth_success',
      reason: 'api_key_created',
      tokenId: id,
      tokenType: 'api-key',
      scopes: scopes.join(','),
    });

    return token;
  }

  /**
   * Authenticate a token
   */
  authenticate(
    tokenValue: string,
    context: LogContext = {},
  ): AuthContext | null {
    const hashedValue = this.hashToken(tokenValue);
    const token = this.tokens.get(hashedValue);

    if (!token) {
      logger.security({
        event: 'auth_failure',
        reason: 'invalid_token',
        ...context,
      });

      incrementCounter(METRICS.REQUESTS_TOTAL, 1, {
        status: 'unauthorized',
        reason: 'invalid_token',
      });

      return null;
    }

    // Check if token is expired
    if (token.metadata.expiresAt && Date.now() > token.metadata.expiresAt) {
      logger.security({
        event: 'auth_failure',
        reason: 'token_expired',
        tokenId: token.id,
        ...context,
      });

      incrementCounter(METRICS.REQUESTS_TOTAL, 1, {
        status: 'unauthorized',
        reason: 'token_expired',
      });

      return null;
    }

    // Update usage statistics
    token.metadata.lastUsed = Date.now();
    token.metadata.usageCount++;

    logger.security({
      event: 'auth_success',
      reason: 'token_valid',
      tokenId: token.id,
      tokenType: token.type,
      ...context,
    });

    incrementCounter(METRICS.REQUESTS_TOTAL, 1, {
      status: 'authorized',
      token_type: token.type,
    });

    return {
      tokenId: token.id,
      type: token.type,
      scopes: token.scopes,
      metadata: token.metadata,
    };
  }

  /**
   * Revoke a token
   */
  revokeToken(tokenId: string): boolean {
    for (const [hashedValue, token] of this.tokens) {
      if (token.id === tokenId) {
        this.tokens.delete(hashedValue);

        logger.security({
          event: 'auth_success',
          reason: 'token_revoked',
          tokenId,
          tokenType: token.type,
        });

        return true;
      }
    }

    return false;
  }

  /**
   * List all tokens (without sensitive values)
   */
  listTokens(): Array<Omit<AuthToken, 'value' | 'hashedValue'>> {
    return Array.from(this.tokens.values()).map((token) => ({
      id: token.id,
      type: token.type,
      scopes: token.scopes,
      metadata: token.metadata,
    }));
  }

  /**
   * Get token info by ID
   */
  getTokenInfo(
    tokenId: string,
  ): Omit<AuthToken, 'value' | 'hashedValue'> | null {
    for (const token of this.tokens.values()) {
      if (token.id === tokenId) {
        return {
          id: token.id,
          type: token.type,
          scopes: token.scopes,
          metadata: token.metadata,
        };
      }
    }
    return null;
  }

  /**
   * Clean up expired tokens
   */
  cleanupExpiredTokens(): number {
    const now = Date.now();
    let cleaned = 0;

    for (const [hashedValue, token] of this.tokens) {
      if (token.metadata.expiresAt && now > token.metadata.expiresAt) {
        this.tokens.delete(hashedValue);
        cleaned++;

        logger.security({
          event: 'auth_success',
          reason: 'token_expired_cleanup',
          tokenId: token.id,
          tokenType: token.type,
        });
      }
    }

    return cleaned;
  }

  /**
   * Import tokens from configuration
   */
  importTokens(
    tokensConfig: Array<{
      value: string;
      type: 'bearer' | 'api-key';
      scopes: string[];
      metadata?: Partial<AuthToken['metadata']>;
    }>,
  ): void {
    for (const config of tokensConfig) {
      const id = this.generateTokenId();
      const hashedValue = this.hashToken(config.value);

      const token: AuthToken = {
        id,
        type: config.type,
        value: config.value,
        hashedValue,
        scopes: config.scopes,
        metadata: {
          name: config.metadata?.name,
          description: config.metadata?.description,
          createdAt: config.metadata?.createdAt ?? Date.now(),
          expiresAt: config.metadata?.expiresAt,
          usageCount: 0,
        },
      };

      this.tokens.set(hashedValue, token);
    }
  }

  private generateTokenId(): string {
    return randomBytes(16).toString('hex');
  }

  private generateTokenValue(): string {
    return randomBytes(32).toString('base64url');
  }

  private hashToken(token: string): string {
    return createHash(this.options.hashAlgorithm).update(token).digest('hex');
  }
}
