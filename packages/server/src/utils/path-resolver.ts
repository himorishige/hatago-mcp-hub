/**
 * Path resolution utilities for configuration files
 */

import { homedir } from 'node:os';
import { resolve, dirname, isAbsolute, relative } from 'node:path';
import { realpathSync } from 'node:fs';

/**
 * Resolve configuration file path
 *
 * Resolution rules:
 * - ~ at the beginning expands to home directory
 * - Relative paths are resolved from the base file's directory
 * - Absolute paths are used as-is
 * - Symbolic links are resolved to real paths
 *
 * @param filePath Path to resolve
 * @param basePath Base file path for relative resolution (optional)
 * @returns Resolved absolute path
 */
export function resolveConfigPath(filePath: string, basePath?: string): string {
  // Handle empty path
  if (!filePath) {
    throw new Error(
      'Configuration path cannot be empty. Expected: string path to configuration file'
    );
  }

  // Expand ~ to home directory (only at the beginning)
  let p = filePath;
  if (p.startsWith('~/')) {
    const home = homedir();
    p = home + p.slice(1);
  }

  // Handle relative paths
  if (!isAbsolute(p)) {
    if (basePath) {
      // Resolve relative to the directory of the base file
      const baseDir = dirname(basePath);
      p = resolve(baseDir, p);
    } else {
      // Resolve relative to current working directory
      const cwd = process.cwd();
      p = resolve(cwd, p);
    }
  }

  // Try to resolve symbolic links
  try {
    return realpathSync(p);
  } catch {
    // If file doesn't exist yet, return the normalized path
    // This allows for better error messages later
    return resolve(p);
  }
}

/**
 * Check if a path is safe to access
 *
 * @param filePath Path to check
 * @returns True if path is safe
 */
export function isSafePath(filePath: string, baseDir?: string): boolean {
  // Reject paths with null bytes
  if (filePath.includes('\0')) {
    return false;
  }

  // Reject URL encoded traversal patterns
  if (/%2e/i.test(filePath) || /%2f/i.test(filePath) || /%5c/i.test(filePath)) {
    return false;
  }

  // Decode and normalize the path
  let normalized: string;
  try {
    normalized = decodeURIComponent(filePath).replace(/[/\\]+/g, '/');
  } catch {
    // If decoding fails, the path is likely malformed
    return false;
  }

  // Check for null bytes in decoded path
  if (normalized.includes('\0')) {
    return false;
  }

  // If a base directory is provided, ensure the resolved target stays within it
  if (baseDir) {
    const base = resolve(baseDir);
    const target = isAbsolute(normalized) ? resolve(normalized) : resolve(base, normalized);
    const rel = relative(base, target);
    // relative() starts with '..' when target is outside base
    if (rel === '' || (!rel.startsWith('..') && !isAbsolute(rel))) {
      return true;
    }
    return false;
  }

  // Without a base, be conservative: reject explicit parent traversal tokens
  const segments = normalized.split(/[/\\]/);
  return !segments.includes('..');
}

/**
 * Get a relative path for display purposes
 *
 * @param filePath Absolute path
 * @param baseDir Base directory for relative display
 * @returns Display-friendly path
 */
export function getDisplayPath(filePath: string, baseDir?: string): string {
  const home = homedir();

  // Make relative to base directory if provided (check this first)
  if (baseDir && filePath.startsWith(baseDir)) {
    const relativePath = filePath.slice(baseDir.length);
    return relativePath.startsWith('/') ? '.' + relativePath : './' + relativePath;
  }

  // Replace home directory with ~
  if (filePath.startsWith(home)) {
    return '~' + filePath.slice(home.length);
  }

  return filePath;
}
