/**
 * Environment Variable Expander for Hatago
 *
 * Claude Code compatible environment variable expansion
 * Supports:
 * - ${VAR} - expands to the value of VAR
 * - ${VAR:-default} - expands to VAR if set, otherwise uses default
 */

declare const process:
  | {
      env: Record<string, string | undefined>;
    }
  | undefined;

/**
 * Type for environment variable getter function
 */
export type GetEnv = (key: string) => string | undefined;

/**
 * Default environment getter for Node.js
 * Uses dynamic check to prevent bundler static replacement
 */
const defaultGetEnv: GetEnv = (key) => {
  if (typeof process !== 'undefined' && process?.env) {
    return process.env[key];
  }
  return undefined;
};

/**
 * Expand environment variables in a string
 * @param value - String containing environment variable placeholders
 * @param getEnv - Function to get environment variable values
 * @returns Expanded string
 * @throws Error if required variable is undefined
 */
export function expandEnvironmentVariables(value: string, getEnv: GetEnv = defaultGetEnv): string {
  // Pattern matches ${VAR} or ${VAR:-default}
  const pattern = /\$\{([^}:]+)(?::-([^}]*))?\}/g;

  return value.replace(pattern, (_match, varName: string, defaultValue?: string) => {
    const envValue = getEnv(varName);

    if (envValue !== undefined) {
      return envValue;
    }

    if (defaultValue !== undefined) {
      return defaultValue;
    }

    // Required variable is not defined and no default provided
    throw new Error(
      `Environment variable '${varName}' is not defined and no default value provided`
    );
  });
}

/**
 * Recursively expand environment variables in configuration object
 * Only processes specific fields: command, args, env, url, headers
 * @param config - Configuration object
 * @param getEnv - Function to get environment variable values
 * @returns Configuration with expanded environment variables
 */
export function expandConfig(config: unknown, getEnv: GetEnv = defaultGetEnv): unknown {
  if (!config || typeof config !== 'object') {
    return config;
  }

  // Deep clone to avoid mutating original
  const expanded = JSON.parse(JSON.stringify(config)) as Record<string, unknown>;

  // Process mcpServers if present
  if (expanded.mcpServers && typeof expanded.mcpServers === 'object') {
    const mcpServers = expanded.mcpServers as Record<string, unknown>;
    for (const serverName in mcpServers) {
      const server = mcpServers[serverName];
      if (typeof server === 'object' && server !== null) {
        mcpServers[serverName] = expandServerConfig(server, getEnv);
      }
    }
  }

  // Process servers if present (VS Code compatibility)
  if (expanded.servers && typeof expanded.servers === 'object') {
    const servers = expanded.servers as Record<string, unknown>;
    for (const serverName in servers) {
      const server = servers[serverName];
      if (typeof server === 'object' && server !== null) {
        servers[serverName] = expandServerConfig(server, getEnv);
      }
    }
  }

  return expanded;
}

/**
 * Expand environment variables in a single server configuration
 * @param server - Server configuration object
 * @param getEnv - Function to get environment variable values
 * @returns Server configuration with expanded variables
 */
function expandServerConfig(server: unknown, getEnv: GetEnv): unknown {
  const expanded = { ...(server as Record<string, unknown>) };

  // Expand command field
  if (typeof expanded.command === 'string') {
    expanded.command = expandEnvironmentVariables(expanded.command, getEnv);
  }

  // Expand args array
  if (Array.isArray(expanded.args)) {
    expanded.args = expanded.args.map((arg: unknown) =>
      typeof arg === 'string' ? expandEnvironmentVariables(arg, getEnv) : arg
    );
  }

  // Expand env object values
  if (expanded.env && typeof expanded.env === 'object') {
    const expandedEnv: Record<string, string> = {};
    for (const [key, value] of Object.entries(expanded.env as Record<string, unknown>)) {
      if (typeof value === 'string') {
        expandedEnv[key] = expandEnvironmentVariables(value, getEnv);
      } else {
        expandedEnv[key] = value as string;
      }
    }
    expanded.env = expandedEnv;
  }

  // Expand url field
  if (typeof expanded.url === 'string') {
    expanded.url = expandEnvironmentVariables(expanded.url, getEnv);
  }

  // Expand headers object values
  if (expanded.headers && typeof expanded.headers === 'object') {
    const expandedHeaders: Record<string, string> = {};
    for (const [key, value] of Object.entries(expanded.headers as Record<string, unknown>)) {
      if (typeof value === 'string') {
        expandedHeaders[key] = expandEnvironmentVariables(value, getEnv);
      } else {
        expandedHeaders[key] = value as string;
      }
    }
    expanded.headers = expandedHeaders;
  }

  return expanded;
}

/**
 * Validate that all required environment variables are present
 * This is a dry-run that doesn't actually expand, just checks
 * @param config - Configuration to validate
 * @param getEnv - Function to get environment variable values
 * @throws Error listing all missing required variables
 */
export function validateEnvironmentVariables(
  config: unknown,
  getEnv: GetEnv = defaultGetEnv
): void {
  const missingVars = new Set<string>();

  function checkValue(value: string) {
    const pattern = /\$\{([^}:]+)(?::-([^}]*))?\}/g;
    let match;

    while ((match = pattern.exec(value)) !== null) {
      const [, varName, defaultValue] = match;
      if (varName && defaultValue === undefined && getEnv(varName) === undefined) {
        missingVars.add(varName);
      }
    }
  }

  function checkServer(server: unknown) {
    const serverConfig = server as Record<string, unknown>;
    if (typeof serverConfig.command === 'string') {
      checkValue(serverConfig.command);
    }

    if (Array.isArray(serverConfig.args)) {
      (serverConfig.args as unknown[]).forEach((arg: unknown) => {
        if (typeof arg === 'string') checkValue(arg);
      });
    }

    if (serverConfig.env && typeof serverConfig.env === 'object') {
      Object.values(serverConfig.env as Record<string, unknown>).forEach((value: unknown) => {
        if (typeof value === 'string') checkValue(value);
      });
    }

    if (typeof serverConfig.url === 'string') {
      checkValue(serverConfig.url);
    }

    if (serverConfig.headers && typeof serverConfig.headers === 'object') {
      Object.values(serverConfig.headers as Record<string, unknown>).forEach((value: unknown) => {
        if (typeof value === 'string') checkValue(value);
      });
    }
  }

  // Check mcpServers
  const configObj = config as Record<string, unknown>;
  if (configObj.mcpServers && typeof configObj.mcpServers === 'object') {
    Object.values(configObj.mcpServers as Record<string, unknown>).forEach((server: unknown) => {
      if (typeof server === 'object' && server !== null) {
        checkServer(server);
      }
    });
  }

  // Check servers (VS Code compatibility)
  if (configObj.servers && typeof configObj.servers === 'object') {
    Object.values(configObj.servers as Record<string, unknown>).forEach((server: unknown) => {
      if (typeof server === 'object' && server !== null) {
        checkServer(server);
      }
    });
  }

  if (missingVars.size > 0) {
    const varList = Array.from(missingVars).sort().join(', ');
    throw new Error(`Missing required environment variables: ${varList}`);
  }
}
