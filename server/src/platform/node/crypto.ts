/**
 * Node.js Crypto implementation
 */
import {
  randomBytes as nodeRandomBytes,
  randomUUID as nodeRandomUUID,
} from 'node:crypto';
import type { Crypto } from '../types.js';

/**
 * Node.js native crypto implementation
 */
export class NodeCrypto implements Crypto {
  randomUUID(): string {
    return nodeRandomUUID();
  }

  randomBytes(size: number): Uint8Array {
    return new Uint8Array(nodeRandomBytes(size));
  }

  async sha256(data: Uint8Array): Promise<Uint8Array> {
    // Use Web Crypto API (available in Node.js 16+)
    const hashBuffer = await crypto.subtle.digest('SHA-256', Buffer.from(data));
    return new Uint8Array(hashBuffer);
  }

  async hash(algorithm: string, data: Uint8Array): Promise<Uint8Array> {
    // Convert algorithm name to Web Crypto format
    const webCryptoAlgorithm = algorithm.toUpperCase().replace('SHA', 'SHA-');
    const hashBuffer = await crypto.subtle.digest(
      webCryptoAlgorithm,
      Buffer.from(data),
    );
    return new Uint8Array(hashBuffer);
  }
}

/**
 * Web Crypto API implementation (works in both Node.js and Workers)
 */
export class WebCrypto implements Crypto {
  randomUUID(): string {
    return crypto.randomUUID();
  }

  randomBytes(size: number): Uint8Array {
    const buffer = new Uint8Array(size);
    crypto.getRandomValues(buffer);
    return buffer;
  }

  async sha256(data: Uint8Array): Promise<Uint8Array> {
    const hashBuffer = await crypto.subtle.digest('SHA-256', Buffer.from(data));
    return new Uint8Array(hashBuffer);
  }

  async hash(algorithm: string, data: Uint8Array): Promise<Uint8Array> {
    // Convert algorithm name to Web Crypto format
    const webCryptoAlgorithm = algorithm.toUpperCase().replace('SHA', 'SHA-');
    const hashBuffer = await crypto.subtle.digest(
      webCryptoAlgorithm,
      Buffer.from(data),
    );
    return new Uint8Array(hashBuffer);
  }
}
