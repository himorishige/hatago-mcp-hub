/**
 * Cloudflare Workers Crypto implementation
 */
import type { Crypto } from '../types.js';

/**
 * Web Crypto API implementation for Workers
 * Workers has native crypto support
 */
export class WorkersCrypto implements Crypto {
  async randomBytes(length: number): Promise<Uint8Array> {
    const buffer = new Uint8Array(length);
    crypto.getRandomValues(buffer);
    return buffer;
  }

  async hash(algorithm: string, data: Uint8Array): Promise<Uint8Array> {
    // Convert algorithm name to Web Crypto format
    const webCryptoAlgorithm = algorithm.toUpperCase().replace('SHA', 'SHA-');
    const hashBuffer = await crypto.subtle.digest(webCryptoAlgorithm, data);
    return new Uint8Array(hashBuffer);
  }
}
