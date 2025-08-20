/**
 * Path validation utilities for security
 */

import { existsSync, realpathSync } from 'node:fs';
import { isAbsolute, normalize, relative, resolve } from 'node:path';
import { detectThreats, isContentSafe } from '@himorishige/noren';

/**
 * Path validation result
 */
export interface PathValidationResult {
  valid: boolean;
  normalized: string;
  issues: string[];
}

/**
 * Validate and sanitize a file path
 */
export async function validatePath(
  inputPath: string,
  options?: {
    basePath?: string;
    allowAbsolute?: boolean;
    checkExists?: boolean;
    allowSymlinks?: boolean;
  },
): Promise<PathValidationResult> {
  const issues: string[] = [];

  // Check for basic path safety with noren
  const pathSafe = await isContentSafe(inputPath);
  if (!pathSafe) {
    const threats = await detectThreats(inputPath);
    if (threats.risk > 0.3) {
      issues.push(
        `Path contains potentially unsafe content (risk: ${threats.risk})`,
      );
    }
  }

  // Check for null bytes (path injection)
  if (inputPath.includes('\0')) {
    issues.push('Path contains null bytes');
    return {
      valid: false,
      normalized: '',
      issues,
    };
  }

  // Check for control characters
  // biome-ignore lint/suspicious/noControlCharactersInRegex: We need to detect control characters for security
  if (/[\x00-\x1f\x7f]/.test(inputPath)) {
    issues.push('Path contains control characters');
  }

  // Normalize the path to remove . and .. segments
  const normalized = normalize(inputPath);

  // Check for directory traversal attempts
  if (normalized.includes('..')) {
    issues.push('Path contains directory traversal sequences');
  }

  // Check for absolute paths if not allowed
  if (!options?.allowAbsolute && isAbsolute(normalized)) {
    issues.push('Absolute paths are not allowed');
  }

  // If a base path is provided, ensure the path stays within it
  if (options?.basePath) {
    const resolvedBase = resolve(options.basePath);
    const resolvedPath = resolve(resolvedBase, normalized);

    // Check if the resolved path is within the base path
    const relativePath = relative(resolvedBase, resolvedPath);
    if (relativePath.startsWith('..')) {
      issues.push('Path escapes the base directory');
    }

    // Check for symlink escape if symlinks are not allowed
    if (
      !options?.allowSymlinks &&
      options?.checkExists &&
      existsSync(resolvedPath)
    ) {
      try {
        const realPath = realpathSync(resolvedPath);
        const realRelative = relative(resolvedBase, realPath);
        if (realRelative.startsWith('..')) {
          issues.push('Symlink escapes the base directory');
        }
      } catch (_error) {
        // Path doesn't exist or other error
        if (options.checkExists) {
          issues.push('Path does not exist or cannot be accessed');
        }
      }
    }
  }

  // Check if file exists when required
  if (options?.checkExists) {
    const fullPath = options.basePath
      ? resolve(options.basePath, normalized)
      : resolve(normalized);

    if (!existsSync(fullPath)) {
      issues.push('Path does not exist');
    }
  }

  // Check for suspicious patterns
  const suspiciousPatterns = [
    { pattern: /^\.\w+|\/\.\w+/, message: 'Hidden file/directory access' },
    {
      pattern: /\.(sh|bat|exe|cmd|ps1)$/i,
      message: 'Executable file extension',
    },
    {
      pattern: /\.(env|config|key|pem|crt)$/i,
      message: 'Sensitive file extension',
    },
  ];

  for (const { pattern, message } of suspiciousPatterns) {
    if (pattern.test(normalized)) {
      issues.push(message);
    }
  }

  return {
    valid: issues.length === 0,
    normalized,
    issues,
  };
}

/**
 * Validate a command path for execution
 */
export async function validateCommandPath(
  command: string,
  options?: {
    allowedCommands?: string[];
    allowedPaths?: string[];
  },
): Promise<PathValidationResult> {
  const issues: string[] = [];

  // Check command safety with noren
  const commandSafe = await isContentSafe(command);
  if (!commandSafe) {
    const threats = await detectThreats(command);
    if (threats.risk > 0.4) {
      issues.push(
        `Command contains potentially unsafe content (risk: ${threats.risk})`,
      );
    }
  }

  // Check for shell injection characters
  const dangerousChars = [
    ';',
    '|',
    '&',
    '>',
    '<',
    '`',
    '$',
    '(',
    ')',
    '{',
    '}',
    '[',
    ']',
    '!',
    '\\n',
    '\\r',
  ];
  for (const char of dangerousChars) {
    if (command.includes(char)) {
      issues.push(`Command contains dangerous character: ${char}`);
    }
  }

  // Normalize the command path
  const normalized = normalize(command);

  // Check against allowed commands list
  if (options?.allowedCommands && options.allowedCommands.length > 0) {
    const commandName = normalized.split(/[\\/]/).pop() || '';
    if (!options.allowedCommands.includes(commandName)) {
      issues.push(`Command not in allowed list: ${commandName}`);
    }
  }

  // Check against allowed paths
  if (options?.allowedPaths && options.allowedPaths.length > 0) {
    const isInAllowedPath = options.allowedPaths.some((allowedPath) => {
      const resolvedAllowed = resolve(allowedPath);
      const resolvedCommand = resolve(normalized);
      const rel = relative(resolvedAllowed, resolvedCommand);
      return !rel.startsWith('..');
    });

    if (!isInAllowedPath) {
      issues.push('Command path not in allowed directories');
    }
  }

  // Check for dangerous command patterns
  const dangerousCommands = [
    'rm',
    'rmdir',
    'del',
    'format',
    'fdisk',
    'dd',
    'mkfs',
    'kill',
    'killall',
    'shutdown',
    'reboot',
    'curl',
    'wget',
    'nc',
    'netcat',
  ];

  const commandName = normalized.split(/[\\/]/).pop() || '';
  if (dangerousCommands.includes(commandName.toLowerCase())) {
    issues.push(`Potentially dangerous command: ${commandName}`);
  }

  return {
    valid: issues.length === 0,
    normalized,
    issues,
  };
}

/**
 * Sanitize a path for safe usage
 */
export function sanitizePath(inputPath: string, basePath?: string): string {
  // Remove null bytes
  let sanitized = inputPath.replace(/\0/g, '');

  // Remove control characters
  // biome-ignore lint/suspicious/noControlCharactersInRegex: We need to remove control characters for sanitization
  sanitized = sanitized.replace(/[\x00-\x1f\x7f]/g, '');

  // Normalize the path
  sanitized = normalize(sanitized);

  // If base path is provided, resolve relative to it
  if (basePath) {
    const resolved = resolve(basePath, sanitized);
    const relative = resolve(basePath, resolved);

    // Ensure we don't escape the base path
    if (!relative.startsWith(basePath)) {
      return basePath;
    }

    return relative;
  }

  return sanitized;
}

/**
 * Check if a path is safe for a specific operation
 */
export async function isPathSafeForOperation(
  path: string,
  operation: 'read' | 'write' | 'execute' | 'delete',
  options?: {
    basePath?: string;
    allowedExtensions?: string[];
    blockedExtensions?: string[];
  },
): Promise<boolean> {
  // First validate the path
  const validation = await validatePath(path, {
    basePath: options?.basePath,
    allowAbsolute: false,
    checkExists: operation === 'read' || operation === 'delete',
  });

  if (!validation.valid) {
    return false;
  }

  // Check file extension restrictions
  const ext = path.split('.').pop()?.toLowerCase();

  if (
    options?.blockedExtensions &&
    ext &&
    options.blockedExtensions.includes(ext)
  ) {
    return false;
  }

  if (
    options?.allowedExtensions &&
    ext &&
    !options.allowedExtensions.includes(ext)
  ) {
    return false;
  }

  // Additional checks based on operation
  switch (operation) {
    case 'execute': {
      // Don't allow execution of files with sensitive extensions
      const sensitiveExts = [
        'env',
        'config',
        'key',
        'pem',
        'crt',
        'json',
        'yaml',
        'yml',
      ];
      if (ext && sensitiveExts.includes(ext)) {
        return false;
      }
      break;
    }

    case 'write':
    case 'delete': {
      // Don't allow modification of critical files
      const criticalPatterns = [
        /^\.git/,
        /^node_modules/,
        /package\.json$/,
        /package-lock\.json$/,
        /tsconfig\.json$/,
        /\.hatago\/config/,
      ];

      const normalizedPath = normalize(path);
      for (const pattern of criticalPatterns) {
        if (pattern.test(normalizedPath)) {
          return false;
        }
      }
      break;
    }
  }

  return true;
}

/**
 * Generate a safe filename from user input
 */
export function generateSafeFilename(input: string, maxLength = 255): string {
  // Remove or replace dangerous characters
  let safe = input
    .replace(/[^a-zA-Z0-9._-]/g, '_') // Replace non-alphanumeric with underscore
    .replace(/\.{2,}/g, '_') // Replace multiple dots
    .replace(/^\./, '_') // Don't start with dot
    .replace(/\s+/g, '_'); // Replace spaces

  // Truncate if too long
  if (safe.length > maxLength) {
    const ext = safe.split('.').pop();
    if (ext && ext.length < 10) {
      safe = `${safe.substring(0, maxLength - ext.length - 1)}.${ext}`;
    } else {
      safe = safe.substring(0, maxLength);
    }
  }

  // Ensure not empty
  if (!safe) {
    safe = 'file';
  }

  return safe;
}
