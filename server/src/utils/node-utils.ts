/**
 * Node.js utilities for Hatago Hub
 * Simplified from the runtime abstraction layer
 */

import { spawn } from 'node:child_process';
import { randomBytes as nodeRandomBytes } from 'node:crypto';
import { promises as fs } from 'node:fs';

/**
 * Generate a unique ID
 * @param length Optional length of the ID (default: 21 for nanoid compatibility)
 */
export async function generateId(length = 21): Promise<string> {
  // Use crypto.randomUUID() for cryptographically secure IDs
  if (
    typeof globalThis.crypto !== 'undefined' &&
    globalThis.crypto.randomUUID
  ) {
    // Remove hyphens for nanoid-like format if needed
    const uuid = globalThis.crypto.randomUUID().replace(/-/g, '');
    // Return requested length (UUID is 32 chars without hyphens)
    return uuid.substring(0, Math.min(length, 32));
  }

  // Fallback to Node.js crypto with proper rejection sampling
  const alphabet =
    '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz_-';
  const alphabetSize = alphabet.length;
  const maxValidValue = Math.floor(256 / alphabetSize) * alphabetSize;

  let id = '';
  let attempts = 0;
  const maxAttempts = length * 10; // Prevent infinite loops

  while (id.length < length && attempts < maxAttempts) {
    const bytes = nodeRandomBytes(Math.ceil((length - id.length) * 1.5));

    for (let i = 0; i < bytes.length && id.length < length; i++) {
      const byte = bytes[i];
      // Rejection sampling to avoid modulo bias
      if (byte < maxValidValue) {
        id += alphabet[byte % alphabetSize];
      }
    }
    attempts++;
  }

  if (id.length < length) {
    throw new Error(`Failed to generate ID after ${maxAttempts} attempts`);
  }

  return id;
}

/**
 * File system operations
 */
export const fileSystem = {
  readFile: fs.readFile,
  writeFile: fs.writeFile,
  mkdir: fs.mkdir,
  rm: fs.rm,
  stat: fs.stat,
  readdir: fs.readdir,
  access: fs.access,
};

/**
 * Process operations
 */
export const processOps = {
  spawn,
  exit: (code?: number) => process.exit(code),
  onSignal: (signal: string, handler: () => void) => {
    process.on(signal, handler);
  },
  removeSignalHandler: (signal: string, handler: () => void) => {
    process.removeListener(signal, handler);
  },
};

/**
 * Generate random bytes
 */
export function randomBytes(size: number): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    nodeRandomBytes(size, (err, buf) => {
      if (err) reject(err);
      else resolve(buf);
    });
  });
}
