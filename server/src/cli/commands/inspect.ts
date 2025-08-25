/**
 * Inspect command - Inspect MCP server capabilities and details
 */

import chalk from 'chalk';
import cliTable from 'cli-table3';
import { Command } from 'commander';
import {
  MCPIntrospector,
  type ServerTarget,
} from '../../codegen/introspector.js';
import { logger } from '../../observability/structured-logger.js';

interface InspectOptions {
  type: 'stdio' | 'npx' | 'websocket' | 'http';
  args: string;
  cwd?: string;
  env?: string;
  format: 'table' | 'json' | 'yaml' | 'summary';
  tools: boolean;
  resources: boolean;
  prompts: boolean;
  schemas: boolean;
  timeout: string;
  retries: string;
}

interface ServerDefinitions {
  serverInfo: {
    name: string;
    version: string;
    capabilities: Record<string, unknown>;
  };
  tools: Record<string, ToolDefinition>;
  resources: Record<string, ResourceDefinition>;
  prompts: Record<string, PromptDefinition>;
}

interface ToolDefinition {
  name: string;
  description?: string;
  inputSchema?: {
    type: string;
    properties?: Record<string, unknown>;
    required?: string[];
  };
}

interface ResourceDefinition {
  uri: string;
  name?: string;
  description?: string;
  mimeType?: string;
}

interface PromptDefinition {
  name: string;
  description?: string;
  arguments?: Array<{ name: string; description?: string; required?: boolean }>;
}

export function createInspectCommand(program: Command): void {
  program
    .command('inspect')
    .description('🔍 Inspect MCP server capabilities and details')
    .argument('<target>', 'MCP server target (command, URL, or package name)')
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
    .option(
      '--format <format>',
      'Output format: table, json, yaml, summary',
      'summary',
    )
    .option('--tools', 'Show only tools')
    .option('--resources', 'Show only resources')
    .option('--prompts', 'Show only prompts')
    .option('--schemas', 'Include JSON schemas in output')
    .option('--timeout <ms>', 'Server connection timeout', '30000')
    .option('--retries <count>', 'Number of retry attempts', '3')
    .action(async (target: string, options: InspectOptions) => {
      try {
        await inspectServer(target, options);
      } catch (error) {
        logger.error('Server inspection failed', { error });
        console.error(
          chalk.red('❌ Server inspection failed:'),
          error instanceof Error ? error.message : error,
        );
        process.exit(1);
      }
    });

  // Add subcommands for specific inspection tasks
  program.addCommand(createInspectToolsCommand());
  program.addCommand(createInspectResourcesCommand());
  program.addCommand(createInspectPromptsCommand());
}

async function inspectServer(
  target: string,
  options: InspectOptions,
): Promise<void> {
  console.log(chalk.blue('🔍 Inspecting MCP server...'));

  // Parse server target
  const serverTarget = parseServerTarget(target, options);
  console.log(chalk.gray(`   Server: ${formatServerTarget(serverTarget)}`));

  // Create introspector
  const introspector = new MCPIntrospector({
    timeoutMs: parseInt(options.timeout, 10),
    retries: parseInt(options.retries, 10),
    includeSchema: options.schemas,
  });

  // Show progress
  const _startTime = Date.now();
  introspector.on('introspection-complete', ({ duration }) => {
    console.log(chalk.green(`✅ Server introspected in ${duration}ms`));
  });

  introspector.on('introspection-error', ({ error }) => {
    console.error(chalk.red('❌ Introspection failed:'), error.message);
  });

  // Perform introspection
  const definitions = await introspector.introspect(serverTarget);

  // Filter output based on options
  if (options.tools) {
    await displayTools(definitions, options);
  } else if (options.resources) {
    await displayResources(definitions, options);
  } else if (options.prompts) {
    await displayPrompts(definitions, options);
  } else {
    await displaySummary(definitions, options);
  }
}

async function displaySummary(
  definitions: ServerDefinitions,
  options: InspectOptions,
): Promise<void> {
  const { serverInfo, tools, resources, prompts } = definitions;

  console.log(chalk.cyan('\n📋 Server Summary'));
  console.log(chalk.bold(`   Name: ${serverInfo.name}`));
  if (serverInfo.version) {
    console.log(chalk.gray(`   Version: ${serverInfo.version}`));
  }

  // Count summary
  const toolCount = Object.keys(tools).length;
  const resourceCount = Object.keys(resources).length;
  const promptCount = Object.keys(prompts).length;

  console.log(chalk.blue('\n📊 Capabilities'));
  console.log(`   🔧 Tools: ${toolCount}`);
  console.log(`   📁 Resources: ${resourceCount}`);
  console.log(`   💬 Prompts: ${promptCount}`);

  if (options.format === 'json') {
    console.log(`\n${JSON.stringify(definitions, null, 2)}`);
    return;
  }

  if (options.format === 'yaml') {
    // Would use a YAML library here
    console.log(chalk.yellow('⚠️  YAML output not yet implemented'));
    return;
  }

  // Show detailed summary
  if (toolCount > 0) {
    console.log(chalk.blue('\n🔧 Available Tools:'));
    for (const [name, tool] of Object.entries(tools)) {
      console.log(
        `   • ${chalk.bold(name)}${tool.description ? ` - ${tool.description}` : ''}`,
      );
    }
  }

  if (resourceCount > 0) {
    console.log(chalk.blue('\n📁 Available Resources:'));
    for (const [uri, resource] of Object.entries(resources)) {
      console.log(
        `   • ${chalk.bold(uri)}${resource.name ? ` (${resource.name})` : ''}`,
      );
      if (resource.description) {
        console.log(chalk.gray(`     ${resource.description}`));
      }
    }
  }

  if (promptCount > 0) {
    console.log(chalk.blue('\n💬 Available Prompts:'));
    for (const [name, prompt] of Object.entries(prompts)) {
      console.log(
        `   • ${chalk.bold(name)}${prompt.description ? ` - ${prompt.description}` : ''}`,
      );
      if (prompt.arguments && prompt.arguments.length > 0) {
        const argNames = prompt.arguments.map((arg) => arg.name).join(', ');
        console.log(chalk.gray(`     Arguments: ${argNames}`));
      }
    }
  }
}

async function displayTools(
  definitions: ServerDefinitions,
  options: InspectOptions,
): Promise<void> {
  const { tools } = definitions;

  if (options.format === 'json') {
    console.log(JSON.stringify(tools, null, 2));
    return;
  }

  if (options.format === 'table') {
    const table = new cliTable({
      head: ['Tool Name', 'Description', 'Required Args', 'Optional Args'],
      colWidths: [20, 40, 20, 20],
    });

    for (const [name, tool] of Object.entries(tools)) {
      const schema = tool.inputSchema;
      let requiredArgs = '';
      let optionalArgs = '';

      if (schema?.properties) {
        const required = schema.required || [];
        const allProps = Object.keys(schema.properties);

        requiredArgs = required.join(', ');
        optionalArgs = allProps
          .filter((p: string) => !required.includes(p))
          .join(', ');
      }

      table.push([
        name,
        tool.description || 'No description',
        requiredArgs || 'None',
        optionalArgs || 'None',
      ]);
    }

    console.log('\n🔧 Tools:\n');
    console.log(table.toString());
    return;
  }

  // Default detailed view
  console.log(chalk.blue('\n🔧 Tools Detailed View:'));

  for (const [name, tool] of Object.entries(tools)) {
    console.log(`\n   ${chalk.bold.cyan(name)}`);
    if (tool.description) {
      console.log(chalk.gray(`      Description: ${tool.description}`));
    }

    if (options.schemas && tool.inputSchema) {
      console.log(chalk.gray('      Input Schema:'));
      console.log(
        chalk.gray(
          `      ${JSON.stringify(tool.inputSchema, null, 2).replace(/\n/g, '\n      ')}`,
        ),
      );
    } else if (tool.inputSchema?.properties) {
      const required = tool.inputSchema.required || [];
      const properties = tool.inputSchema.properties;

      console.log(chalk.gray('      Arguments:'));
      for (const [propName, propSchema] of Object.entries(properties)) {
        const isRequired = required.includes(propName);
        const requiredLabel = isRequired
          ? chalk.red('*required')
          : chalk.gray('optional');
        console.log(
          chalk.gray(
            `        • ${propName} (${propSchema.type || 'any'}) - ${requiredLabel}`,
          ),
        );
        if (propSchema.description) {
          console.log(chalk.gray(`          ${propSchema.description}`));
        }
      }
    }
  }
}

async function displayResources(
  definitions: ServerDefinitions,
  options: InspectOptions,
): Promise<void> {
  const { resources } = definitions;

  if (options.format === 'json') {
    console.log(JSON.stringify(resources, null, 2));
    return;
  }

  if (options.format === 'table') {
    const table = new cliTable({
      head: ['Resource URI', 'Name', 'Description', 'MIME Type'],
      colWidths: [30, 20, 40, 15],
    });

    for (const [uri, resource] of Object.entries(resources)) {
      table.push([
        uri,
        resource.name || 'No name',
        resource.description || 'No description',
        resource.mimeType || 'Unknown',
      ]);
    }

    console.log('\n📁 Resources:\n');
    console.log(table.toString());
    return;
  }

  // Default detailed view
  console.log(chalk.blue('\n📁 Resources Detailed View:'));

  for (const [uri, resource] of Object.entries(resources)) {
    console.log(`\n   ${chalk.bold.cyan(uri)}`);
    if (resource.name) {
      console.log(chalk.gray(`      Name: ${resource.name}`));
    }
    if (resource.description) {
      console.log(chalk.gray(`      Description: ${resource.description}`));
    }
    if (resource.mimeType) {
      console.log(chalk.gray(`      MIME Type: ${resource.mimeType}`));
    }
  }
}

async function displayPrompts(
  definitions: ServerDefinitions,
  options: InspectOptions,
): Promise<void> {
  const { prompts } = definitions;

  if (options.format === 'json') {
    console.log(JSON.stringify(prompts, null, 2));
    return;
  }

  if (options.format === 'table') {
    const table = new cliTable({
      head: ['Prompt Name', 'Description', 'Arguments'],
      colWidths: [25, 45, 30],
    });

    for (const [name, prompt] of Object.entries(prompts)) {
      const args = prompt.arguments
        ? prompt.arguments.map((arg) => arg.name).join(', ')
        : 'None';

      table.push([name, prompt.description || 'No description', args]);
    }

    console.log('\n💬 Prompts:\n');
    console.log(table.toString());
    return;
  }

  // Default detailed view
  console.log(chalk.blue('\n💬 Prompts Detailed View:'));

  for (const [name, prompt] of Object.entries(prompts)) {
    console.log(`\n   ${chalk.bold.cyan(name)}`);
    if (prompt.description) {
      console.log(chalk.gray(`      Description: ${prompt.description}`));
    }

    if (prompt.arguments && prompt.arguments.length > 0) {
      console.log(chalk.gray('      Arguments:'));
      for (const arg of prompt.arguments) {
        const requiredLabel = arg.required
          ? chalk.red('*required')
          : chalk.gray('optional');
        console.log(chalk.gray(`        • ${arg.name} - ${requiredLabel}`));
        if (arg.description) {
          console.log(chalk.gray(`          ${arg.description}`));
        }
      }
    }
  }
}

function parseServerTarget(
  target: string,
  options: InspectOptions,
): ServerTarget {
  const env = parseEnvironmentVariables(options.env);
  const args = options.args ? options.args.split(' ').filter(Boolean) : [];

  return {
    type: options.type,
    endpoint:
      options.type === 'websocket' || options.type === 'http'
        ? target
        : undefined,
    command:
      options.type === 'stdio' || options.type === 'npx' ? target : undefined,
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
    return JSON.parse(envString);
  } catch {
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

function createInspectToolsCommand(): Command {
  return new Command('tools')
    .description('Inspect only tools')
    .argument('<target>', 'MCP server target')
    .option('-t, --type <type>', 'Server type', 'stdio')
    .option('--format <format>', 'Output format', 'table')
    .option('--schemas', 'Include JSON schemas')
    .action(async (target, options) => {
      await inspectServer(target, { ...options, tools: true });
    });
}

function createInspectResourcesCommand(): Command {
  return new Command('resources')
    .description('Inspect only resources')
    .argument('<target>', 'MCP server target')
    .option('-t, --type <type>', 'Server type', 'stdio')
    .option('--format <format>', 'Output format', 'table')
    .action(async (target, options) => {
      await inspectServer(target, { ...options, resources: true });
    });
}

function createInspectPromptsCommand(): Command {
  return new Command('prompts')
    .description('Inspect only prompts')
    .argument('<target>', 'MCP server target')
    .option('-t, --type <type>', 'Server type', 'stdio')
    .option('--format <format>', 'Output format', 'table')
    .action(async (target, options) => {
      await inspectServer(target, { ...options, prompts: true });
    });
}
