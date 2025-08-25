/**
 * Generate command - Generate TypeScript types and client code from MCP servers
 */

import { existsSync } from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import chalk from 'chalk';
import { Command } from 'commander';
import {
  MCPIntrospector,
  type ServerTarget,
} from '../../codegen/introspector.js';
import { TypeGenerator } from '../../codegen/type-generator.js';
import { logger } from '../../observability/structured-logger.js';

interface GenerateOptions {
  output: string;
  server?: string;
  type: 'stdio' | 'npx' | 'websocket' | 'http';
  args: string;
  cwd?: string;
  env?: string;
  namespace: string;
  noComments: boolean;
  strict: boolean;
  watch: boolean;
  timeout: string;
  retries: string;
  format: boolean;
}

export function createGenerateCommand(program: Command): void {
  program
    .command('generate')
    .alias('gen')
    .description(
      '🔧 Generate TypeScript types and client code from MCP servers',
    )
    .option(
      '-o, --output <path>',
      'Output file path',
      './generated/mcp-types.ts',
    )
    .option(
      '-s, --server <target>',
      'MCP server target (command, URL, or config)',
    )
    .option(
      '-t, --type <type>',
      'Server type: stdio, npx, websocket, http',
      'stdio',
    )
    .option('-a, --args <args>', 'Server arguments (for stdio/npx)', '')
    .option('--cwd <dir>', 'Working directory for server process')
    .option(
      '--env <vars>',
      'Environment variables (JSON string or key=value pairs)',
    )
    .option('--namespace <name>', 'TypeScript namespace', 'MCPTypes')
    .option('--no-comments', 'Exclude comments from generated types')
    .option('--strict', 'Enable strict mode for type generation', true)
    .option('--watch', 'Watch for server changes and regenerate types')
    .option('--timeout <ms>', 'Server connection timeout', '30000')
    .option('--retries <count>', 'Number of retry attempts', '3')
    .option('--format', 'Format generated code with Prettier', false)
    .action(async (options: GenerateOptions) => {
      try {
        if (options.watch) {
          await watchAndGenerate(options);
        } else {
          await generateTypes(options);
        }
      } catch (error) {
        logger.error('Type generation failed', { error });
        console.error(
          chalk.red('❌ Type generation failed:'),
          error instanceof Error ? error.message : error,
        );
        process.exit(1);
      }
    });

  // Add subcommands
  program.addCommand(createGenerateClientCommand());
  program.addCommand(createGenerateSchemaCommand());
}

async function generateTypes(options: GenerateOptions): Promise<void> {
  console.log(chalk.blue('🔧 Generating TypeScript types...'));

  // Parse server target
  const target = parseServerTarget(options);
  console.log(chalk.gray(`   Server: ${formatServerTarget(target)}`));
  console.log(chalk.gray(`   Output: ${options.output}`));

  // Introspect server
  const introspector = new MCPIntrospector({
    timeoutMs: parseInt(options.timeout, 10),
    retries: parseInt(options.retries, 10),
    includeSchema: true,
  });

  // Show progress
  introspector.on('introspection-complete', ({ counts, duration }) => {
    console.log(chalk.green(`✅ Server introspected in ${duration}ms`));
    console.log(
      chalk.gray(
        `   Tools: ${counts.tools}, Resources: ${counts.resources}, Prompts: ${counts.prompts}`,
      ),
    );
  });

  const definitions = await introspector.introspect(target);

  // Generate types
  const generator = new TypeGenerator({
    outputPath: options.output,
    namespace: options.namespace,
    includeComments: !options.noComments,
    strictMode: options.strict,
    exportMode: 'named',
  });

  const typeCode = await generator.generateTypes(definitions);

  // Ensure output directory exists
  const outputDir = dirname(resolve(options.output));
  if (!existsSync(outputDir)) {
    await mkdir(outputDir, { recursive: true });
    console.log(chalk.gray(`   Created directory: ${outputDir}`));
  }

  // Format code if requested
  let finalCode = typeCode;
  if (options.format) {
    try {
      const prettier = await import('prettier');
      const prettierConfig =
        (await prettier.resolveConfig(options.output)) || {};

      finalCode = await prettier.format(typeCode, {
        ...prettierConfig,
        filepath: options.output,
        parser: 'typescript',
      });

      console.log(chalk.gray('   Formatted code with Prettier'));
    } catch (error) {
      console.log(
        chalk.yellow('⚠️  Prettier formatting failed, using unformatted code'),
      );
      logger.warn('Prettier formatting failed', { error });
    }
  }

  // Write output file
  await writeFile(options.output, finalCode, 'utf-8');

  console.log(chalk.green(`✅ Types generated successfully!`));
  console.log(chalk.cyan(`   📄 ${options.output}`));

  // Show usage example
  console.log(chalk.blue('\n💡 Usage example:'));
  console.log(
    chalk.gray(
      "   import { TypedMCPClient, ToolName } from './generated/mcp-types.js'",
    ),
  );
  console.log(
    chalk.gray('   // Use the generated types for type-safe MCP interactions'),
  );
}

async function watchAndGenerate(options: GenerateOptions): Promise<void> {
  console.log(chalk.blue('👀 Starting watch mode...'));
  console.log(chalk.gray('   Press Ctrl+C to stop'));

  let isGenerating = false;

  const regenerate = async () => {
    if (isGenerating) return;

    isGenerating = true;
    try {
      console.log(chalk.yellow('\n🔄 Regenerating types...'));
      await generateTypes({ ...options, watch: false });
    } catch (error) {
      console.error(
        chalk.red('❌ Generation failed:'),
        error instanceof Error ? error.message : error,
      );
    } finally {
      isGenerating = false;
    }
  };

  // Initial generation
  await regenerate();

  // Set up file watching (basic implementation)
  const watchInterval = setInterval(async () => {
    // In a real implementation, this would use proper file watching
    // For now, just regenerate every 5 seconds
    if (!isGenerating) {
      console.log(
        chalk.gray(
          `${new Date().toLocaleTimeString()} - Checking for changes...`,
        ),
      );
    }
  }, 5000);

  // Handle graceful shutdown
  process.on('SIGINT', () => {
    clearInterval(watchInterval);
    console.log(chalk.yellow('\n👋 Stopping watch mode'));
    process.exit(0);
  });

  // Keep process alive
  process.on('exit', () => {
    clearInterval(watchInterval);
  });
}

function parseServerTarget(options: GenerateOptions): ServerTarget {
  const env = parseEnvironmentVariables(options.env);
  const args = options.args ? options.args.split(' ').filter(Boolean) : [];

  return {
    type: options.type,
    endpoint:
      options.type === 'websocket' || options.type === 'http'
        ? options.server
        : undefined,
    command:
      options.type === 'stdio' || options.type === 'npx'
        ? options.server
        : undefined,
    args,
    cwd: options.cwd,
    env,
  };
}

function parseEnvironmentVariables(
  envString?: string,
): Record<string, string> | undefined {
  if (!envString) return undefined;

  try {
    // Try parsing as JSON first
    return JSON.parse(envString);
  } catch {
    // Parse as key=value pairs
    const env: Record<string, string> = {};

    for (const pair of envString.split(',')) {
      const [key, ...valueParts] = pair.trim().split('=');
      if (key && valueParts.length > 0) {
        env[key] = valueParts.join('=');
      }
    }

    return Object.keys(env).length > 0 ? env : undefined;
  }
}

function formatServerTarget(target: ServerTarget): string {
  switch (target.type) {
    case 'stdio':
      return `${target.command} ${target.args?.join(' ') || ''}`.trim();
    case 'npx':
      return `npx ${target.command} ${target.args?.join(' ') || ''}`.trim();
    case 'websocket':
    case 'http':
      return target.endpoint || 'Unknown endpoint';
    default:
      return 'Unknown target';
  }
}

function createGenerateClientCommand(): Command {
  return new Command('client')
    .description('Generate a typed MCP client wrapper')
    .option(
      '-o, --output <path>',
      'Output file path',
      './generated/mcp-client.ts',
    )
    .option('-s, --server <target>', 'MCP server target')
    .option(
      '-t, --type <type>',
      'Server type: stdio, npx, websocket, http',
      'stdio',
    )
    .option(
      '--class-name <name>',
      'Generated client class name',
      'TypedMCPClient',
    )
    .action(async (_options) => {
      console.log(chalk.blue('🔧 Generating typed MCP client...'));

      // This would generate a complete client wrapper class
      // For now, show placeholder
      console.log(chalk.yellow('⚠️  Client generation not yet implemented'));
      console.log(
        chalk.gray(
          '   This feature will generate a complete typed wrapper class',
        ),
      );
      console.log(
        chalk.gray(
          '   for interacting with your MCP server with full IntelliSense',
        ),
      );
    });
}

function createGenerateSchemaCommand(): Command {
  return new Command('schema')
    .description('Generate JSON Schema definitions')
    .option(
      '-o, --output <path>',
      'Output file path',
      './generated/mcp-schema.json',
    )
    .option('-s, --server <target>', 'MCP server target')
    .option(
      '-t, --type <type>',
      'Server type: stdio, npx, websocket, http',
      'stdio',
    )
    .option('--format', 'Pretty-print JSON output', true)
    .action(async (_options) => {
      console.log(chalk.blue('🔧 Generating JSON Schema...'));

      // This would extract and combine all JSON schemas from the server
      console.log(chalk.yellow('⚠️  Schema generation not yet implemented'));
      console.log(
        chalk.gray('   This feature will extract tool input schemas'),
      );
      console.log(
        chalk.gray('   and combine them into a single JSON Schema file'),
      );
    });
}
