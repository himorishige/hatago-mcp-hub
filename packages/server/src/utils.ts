/**
 * Utility Functions
 */

/**
 * Parsed command-line arguments
 */
export type ParsedArgs = {
  command?: string;
  flags: Record<string, string | boolean>;
  positional: string[];
};

/**
 * Simple command-line argument parser with command support
 */
export function parseArgs(args: string[]): ParsedArgs {
  const result: ParsedArgs = {
    flags: {},
    positional: []
  };

  let i = 0;

  // First non-flag argument is the command
  const firstArg = args[0];
  if (args.length > 0 && firstArg && !firstArg.startsWith('--')) {
    result.command = firstArg;
    i = 1;
  }

  // Parse remaining arguments
  for (; i < args.length; i++) {
    const arg = args[i];
    if (arg === undefined) continue;

    if (arg.startsWith('--')) {
      const key = arg.slice(2);
      const nextArg = args[i + 1];

      // Check if next argument is a value (not another flag)
      if (nextArg && !nextArg.startsWith('--')) {
        result.flags[key] = nextArg;
        i++; // Skip next argument
      } else {
        // Boolean flag
        result.flags[key] = true;
      }
    } else {
      // Positional argument
      result.positional.push(arg);
    }
  }

  return result;
}

/**
 * Generate a default hatago.config.json file following the schema
 */
export function generateDefaultConfig(): string {
  const defaultConfig = {
    $schema:
      'https://raw.githubusercontent.com/himorishige/hatago-mcp-hub/main/schemas/config.schema.json',
    version: 1,
    mcpServers: {
      deepwiki: {
        url: 'https://mcp.deepwiki.com/sse',
        type: 'sse' as const
      }
    }
  };

  return JSON.stringify(defaultConfig, null, 2);
}
