/**
 * Environment variable expansion utilities
 */

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
      throw new Error(operand || `Environment variable ${varName} is not set`);
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
    throw new Error(
      `Missing required environment variables: ${missing.join(', ')}`,
    );
  }
}

/**
 * Get environment variable with type checking
 */
export function getEnvVar(name: string, defaultValue?: string): string {
  const value = process.env[name];
  if (value === undefined) {
    if (defaultValue !== undefined) {
      return defaultValue;
    }
    throw new Error(`Environment variable ${name} is not set`);
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
    throw new Error(`Environment variable ${name} is not set`);
  }

  const num = Number(value);
  if (Number.isNaN(num)) {
    throw new Error(
      `Environment variable ${name} is not a valid number: ${value}`,
    );
  }
  return num;
}
