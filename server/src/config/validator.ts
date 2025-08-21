/**
 * Configuration validation utilities
 */

import { createLogger } from '../utils/logger.js';
import type { HatagoConfig, ServerConfig } from './types.js';

const logger = createLogger({
  component: 'config-validator',
  destination: process.stderr, // Always use stderr to avoid stdout contamination
});

export interface ValidationError {
  path: string;
  message: string;
}

export interface ValidationResult {
  valid: boolean;
  errors: ValidationError[];
  warnings: ValidationError[];
}

/**
 * Validate profile configuration
 */
export function validateProfileConfig(config: HatagoConfig): ValidationResult {
  const errors: ValidationError[] = [];
  const warnings: ValidationError[] = [];

  // Check version
  if (config.version !== 1) {
    warnings.push({
      path: 'version',
      message: `Unsupported config version: ${config.version}`,
    });
  }

  // Validate servers
  if (config.servers.length === 0) {
    warnings.push({
      path: 'servers',
      message: 'No servers configured',
    });
  }

  config.servers.forEach((server, index) => {
    const serverErrors = validateServerConfig(server, `servers[${index}]`);
    errors.push(...serverErrors.errors);
    warnings.push(...serverErrors.warnings);
  });

  // Check for port conflicts in HTTP mode
  if (config.http?.port) {
    const port = config.http.port;
    if (port < 1024 && process.platform !== 'win32') {
      warnings.push({
        path: 'http.port',
        message: `Port ${port} requires root privileges on Unix systems`,
      });
    }
    if (port > 65535) {
      errors.push({
        path: 'http.port',
        message: `Invalid port number: ${port}`,
      });
    }
  }

  // Validate security settings
  if (config.security) {
    if (config.security.allowNet) {
      config.security.allowNet.forEach((host, index) => {
        if (!isValidHost(host)) {
          errors.push({
            path: `security.allowNet[${index}]`,
            message: `Invalid host: ${host}`,
          });
        }
      });
    }
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
  };
}

/**
 * Validate server configuration
 */
function validateServerConfig(
  server: ServerConfig,
  path: string,
): ValidationResult {
  const errors: ValidationError[] = [];
  const warnings: ValidationError[] = [];

  // Check server ID format
  if (!/^[a-zA-Z0-9_-]+$/.test(server.id)) {
    errors.push({
      path: `${path}.id`,
      message: `Invalid server ID: ${server.id}. Use only alphanumeric characters, hyphens, and underscores.`,
    });
  }

  // Type-specific validation
  switch (server.type) {
    case 'npx':
      if (!server.package) {
        errors.push({
          path: `${path}.package`,
          message: 'NPX server requires a package name',
        });
      }
      break;

    case 'remote':
      if (!server.url) {
        errors.push({
          path: `${path}.url`,
          message: 'Remote server requires a URL',
        });
      } else if (!isValidUrl(server.url)) {
        errors.push({
          path: `${path}.url`,
          message: `Invalid URL: ${server.url}`,
        });
      }
      break;

    case 'local':
      if (!server.command) {
        errors.push({
          path: `${path}.command`,
          message: 'Local server requires a command',
        });
      }
      break;
  }

  // Check for environment variable placeholders
  if (server.env) {
    Object.entries(server.env).forEach(([key, value]) => {
      if (
        typeof value === 'string' &&
        value.includes('${') &&
        !value.includes(':-')
      ) {
        warnings.push({
          path: `${path}.env.${key}`,
          message: `Environment variable ${key} has no default value`,
        });
      }
    });
  }

  // Validate tool filters
  if (server.tools) {
    if (server.tools.include && server.tools.exclude) {
      if (
        server.tools.include.includes('*') &&
        server.tools.exclude.length > 0
      ) {
        warnings.push({
          path: `${path}.tools`,
          message:
            'Using both include["*"] and exclude list may cause confusion',
        });
      }
    }
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
  };
}

/**
 * Check if a URL is valid
 */
function isValidUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    return ['http:', 'https:', 'ws:', 'wss:'].includes(parsed.protocol);
  } catch {
    return false;
  }
}

/**
 * Check if a host is valid
 */
function isValidHost(host: string): boolean {
  // If it's a URL, extract the hostname
  if (host.startsWith('http://') || host.startsWith('https://')) {
    try {
      const url = new URL(host);
      host = url.hostname;
    } catch {
      return false;
    }
  }

  // Allow localhost, IP addresses, and domain names
  const patterns = [
    /^localhost$/i,
    /^127\.0\.0\.1$/,
    /^::1$/,
    /^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}$/,
    /^[a-z0-9]+([-.]{1}[a-z0-9]+)*\.[a-z]{2,}$/i,
  ];

  return patterns.some((pattern) => pattern.test(host));
}

/**
 * Print validation result
 */
export function printValidationResult(result: ValidationResult): void {
  if (result.errors.length > 0) {
    logger.error('Configuration errors:');
    result.errors.forEach((error) => {
      logger.error(`  - ${error.path}: ${error.message}`);
    });
  }

  if (result.warnings.length > 0) {
    logger.warn('Configuration warnings:');
    result.warnings.forEach((warning) => {
      logger.warn(`  - ${warning.path}: ${warning.message}`);
    });
  }

  if (result.valid) {
    logger.info('Configuration is valid');
  } else {
    logger.error('Configuration is invalid');
  }
}
