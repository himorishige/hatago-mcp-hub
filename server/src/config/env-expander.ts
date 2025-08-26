/**
 * Environment variable expansion utilities
 */

// import { detectThreats, isContentSafe } from '@himorishige/noren';
import { ErrorHelpers } from '../utils/errors.js';

/**
 * Check if an environment variable name is safe
 */
async function isEnvVarNameSafe(name: string): Promise<boolean> {
  // Dangerous environment variables that can affect program execution
  const dangerousVars = [
    'LD_PRELOAD',
    'LD_LIBRARY_PATH',
    'DYLD_INSERT_LIBRARIES',
    'DYLD_LIBRARY_PATH',
    'PATH',
    'PYTHONPATH',
    'NODE_PATH',
    'PERL5LIB',
    'RUBYLIB',
  ];

  if (dangerousVars.includes(name.toUpperCase())) {
    return false;
  }

  // Basic safety check (simplified version without noren)
  // Check for suspicious patterns
  const suspiciousPatterns = [
    /\$\{.*\}/, // Template injection
    /`.*`/, // Command substitution
    /\|/, // Pipe
    /[;&]/, // Command chaining
    /[<>]/, // Redirection
  ];

  return !suspiciousPatterns.some((pattern) => pattern.test(name));
}

/**
 * Validate environment variable value for safety
 */
async function validateEnvVarValue(
  value: string,
): Promise<{ safe: boolean; sanitized?: string }> {
  // Check for command injection patterns
  const dangerousPatterns = [
    /;.*&&/, // Command chaining
    /\|/, // Pipe
    /`[^`]+`/, // Command substitution
    /\$\([^)]+\)/, // Command substitution
    /\.\.\//, // Directory traversal
    /^\/etc\//, // System config access
    /^\/usr\/bin\//, // Direct binary execution
  ];

  for (const pattern of dangerousPatterns) {
    if (pattern.test(value)) {
      return { safe: false };
    }
  }

  // Basic safety check (simplified version without noren)
  const suspiciousPatterns = [
    /\$\{.*\}/, // Template injection
    /`.*`/, // Command substitution
    /\|/, // Pipe
    /[;&]/, // Command chaining
    /[<>]/, // Redirection
  ];

  if (suspiciousPatterns.some((pattern) => pattern.test(value))) {
    return { safe: false };
  }

  return { safe: true, sanitized: value };
}

/**
 * Expand environment variables in configuration values
 * Supports ${VAR} and ${VAR:-default} syntax
 */
export function expandEnvironmentVariables(value: unknown): unknown {
  if (typeof value === 'string') {
    return expandString(value);
  }

  if (Array.isArray(value)) {
    return value.map(expandEnvironmentVariables);
  }

  if (value && typeof value === 'object') {
    const expanded: Record<string, unknown> = {};
    for (const [key, val] of Object.entries(value)) {
      expanded[key] = expandEnvironmentVariables(val);
    }
    return expanded;
  }

  return value;
}

/**
 * Expand environment variables in a string
 * Supports:
 * - ${VAR} - simple variable expansion
 * - ${VAR:-default} - with default value
 * - ${VAR:?error} - error if not set
 */
function expandString(str: string): string {
  return str.replace(/\$\{([^}]+)\}/g, (_match, expr) => {
    // Parse expression (VAR, VAR:-default, VAR:?error)
    const colonIndex = expr.indexOf(':');
    let varName: string;
    let operator: string | null = null;
    let operand: string | null = null;

    if (colonIndex === -1) {
      varName = expr.trim();
    } else {
      varName = expr.substring(0, colonIndex).trim();
      const rest = expr.substring(colonIndex + 1);
      if (rest.startsWith('-')) {
        operator = ':-';
        operand = rest.substring(1);
      } else if (rest.startsWith('?')) {
        operator = ':?';
        operand = rest.substring(1);
      }
    }

    // Get environment variable value
    const value = process.env[varName];

    if (value !== undefined && value !== '') {
      return value;
    }

    // Handle operators
    if (operator === ':-' && operand !== null) {
      // Use default value
      return operand;
    }

    if (operator === ':?' && operand !== null) {
      // Throw error with custom message
      throw operand
        ? ErrorHelpers.operationFailed('Environment expansion', operand)
        : ErrorHelpers.envVariableNotSet(varName);
    }

    // Return empty string if no operator
    return '';
  });
}

/**
 * Validate that required environment variables are set
 */
export function validateEnvVars(requiredVars: string[]): void {
  const missing: string[] = [];

  for (const varName of requiredVars) {
    if (!process.env[varName]) {
      missing.push(varName);
    }
  }

  if (missing.length > 0) {
    throw ErrorHelpers.operationFailed(
      'Environment validation',
      `Missing required environment variables: ${missing.join(', ')}`,
    );
  }
}

/**
 * Get environment variable with type checking and safety validation
 */
export async function getEnvVar(
  name: string,
  defaultValue?: string,
  options?: { skipSafetyCheck?: boolean },
): Promise<string> {
  // Check if variable name is safe
  if (!options?.skipSafetyCheck) {
    const nameSafe = await isEnvVarNameSafe(name);
    if (!nameSafe) {
      throw ErrorHelpers.unsafeEnvVariableName(name);
    }
  }

  const value = process.env[name];
  if (value === undefined) {
    if (defaultValue !== undefined) {
      return defaultValue;
    }
    throw ErrorHelpers.envVariableNotSet(name);
  }

  // Validate value safety
  if (!options?.skipSafetyCheck) {
    const validation = await validateEnvVarValue(value);
    if (!validation.safe) {
      throw ErrorHelpers.operationFailed(
        'Environment variable validation',
        `${name} contains potentially unsafe content`,
      );
    }
  }

  return value;
}

/**
 * Get environment variable synchronously (legacy compatibility)
 */
export function getEnvVarSync(name: string, defaultValue?: string): string {
  const value = process.env[name];
  if (value === undefined) {
    if (defaultValue !== undefined) {
      return defaultValue;
    }
    throw ErrorHelpers.envVariableNotSet(name);
  }
  return value;
}

/**
 * Get boolean environment variable
 */
export function getEnvBool(name: string, defaultValue = false): boolean {
  const value = process.env[name];
  if (value === undefined) {
    return defaultValue;
  }
  return value.toLowerCase() === 'true' || value === '1';
}

/**
 * Get numeric environment variable
 */
export function getEnvNumber(name: string, defaultValue?: number): number {
  const value = process.env[name];
  if (value === undefined) {
    if (defaultValue !== undefined) {
      return defaultValue;
    }
    throw ErrorHelpers.envVariableNotSet(name);
  }

  const num = Number(value);
  if (Number.isNaN(num)) {
    throw ErrorHelpers.invalidInput(
      `Environment variable ${name}`,
      `Not a valid number: ${value}`,
    );
  }
  return num;
}
