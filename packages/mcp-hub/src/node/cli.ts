#!/usr/bin/env node
/**
 * Hatago MCP Hub - CLI Entry Point
 *
 * This is the main entry point for npx execution.
 * Provides subcommands for server management and configuration.
 */

import { startServer, generateDefaultConfig } from '../../../server/src/index.js';
import { Command } from 'commander';
import { readFileSync, existsSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join, isAbsolute, resolve } from 'node:path';
import { createInterface } from 'node:readline';
import {
  listTemplates,
  getTemplate,
  generateFromTemplate,
  checkFileConflicts,
  applyDefaults,
  validateInputs,
  formatTemplateList,
  executeHook,
  type TemplateVariables
} from '../templates/index.js';

// Get package version
const __dirname = dirname(fileURLToPath(import.meta.url));
const packageJson = JSON.parse(readFileSync(join(__dirname, '../../package.json'), 'utf-8')) as {
  version: string;
};

// Create CLI program
const program = new Command();

program
  .name('hatago')
  .description('🏮 Hatago MCP Hub - Unified MCP server management')
  .version((packageJson as { version: string }).version);

// Init command
program
  .command('init')
  .description('Create a default hatago.config.json file')
  .option('-c, --config <path>', 'Path to configuration file', './hatago.config.json')
  .option('-f, --force', 'Overwrite existing configuration file')
  .option('-m, --mode <mode>', 'Integration mode (stdio or http)')
  .option(
    '-t, --template <name>',
    'Use a template (minimal, local-dev, ai-assistant, cloud-only, full-stack)'
  )
  .option('--list-templates', 'List all available templates')
  .option('--from-url <url>', 'Load template from URL (coming soon)')
  .option('-i, --interactive', 'Interactive setup mode')
  .option('--defaults', 'Use default values without prompting')
  .action(async (options: unknown) => {
    const opts = options as {
      config?: string;
      force?: boolean;
      mode?: string;
      template?: string;
      listTemplates?: boolean;
      fromUrl?: string;
      interactive?: boolean;
      defaults?: boolean;
    };
    const configPath = opts.config ?? './hatago.config.json';
    const force = opts.force ?? false;

    // Handle --list-templates
    if (opts.listTemplates) {
      const templates = listTemplates();
      console.log(formatTemplateList(templates));
      process.exit(0);
    }

    // Handle --from-url (not yet implemented)
    if (opts.fromUrl) {
      console.error('❌ Remote templates not yet implemented');
      console.error('   This feature is coming soon!');
      process.exit(1);
    }

    // Check if file already exists
    if (existsSync(configPath) && !force) {
      console.error(`❌ Configuration file already exists: ${configPath}`);
      console.error('   Use --force to overwrite');
      process.exit(1);
    }

    try {
      // Use template if specified
      if (opts.template) {
        const template = getTemplate(opts.template);
        if (!template) {
          console.error(`❌ Template not found: ${opts.template}`);
          console.error('');
          const templates = listTemplates();
          console.error(formatTemplateList(templates));
          process.exit(1);
        }

        console.log(`🎨 Using template: ${template.metadata.name}`);
        console.log(`   ${template.metadata.description}`);
        console.log('');

        // Collect variables (interactive or defaults)
        let variables: TemplateVariables = {};

        if (opts.interactive && !opts.defaults) {
          const rl = createInterface({
            input: process.stdin,
            output: process.stdout
          });

          for (const input of template.metadata.inputs) {
            if (input.required || !opts.defaults) {
              const defaultStr = input.default ? ` (default: ${input.default})` : '';
              const answer = await new Promise<string>((resolve) => {
                rl.question(`${input.description}${defaultStr}: `, (value) => {
                  resolve(value.trim());
                });
              });

              if (answer) {
                // Convert to appropriate type
                if (input.type === 'boolean') {
                  variables[input.name] = answer.toLowerCase() === 'true';
                } else if (input.type === 'number') {
                  variables[input.name] = Number(answer);
                } else {
                  variables[input.name] = answer;
                }
              }
            }
          }

          rl.close();
        }

        // Apply defaults
        variables = applyDefaults(template.metadata, variables);

        // Validate inputs
        const validation = validateInputs(template.metadata, variables);
        if (!validation.valid) {
          console.error('❌ Invalid template inputs:');
          validation.errors.forEach((error) => console.error(`   - ${error}`));
          process.exit(1);
        }

        const targetDir = dirname(configPath);

        // Check for file conflicts unless --force is used
        if (!force) {
          const conflicts = checkFileConflicts(template, targetDir);
          if (conflicts.length > 0) {
            console.error('❌ File conflicts detected:');
            conflicts.forEach((file) => console.error(`   - ${file}`));
            console.error('');
            console.error('Options:');
            console.error(`   - Use --force to overwrite existing files`);
            console.error(`   - Remove conflicting files manually`);
            console.error(`   - Choose a different directory`);
            process.exit(1);
          }
        }

        // Execute pre-init hook
        await executeHook(template, 'preInit', targetDir);

        // Generate from template
        const result = generateFromTemplate(template, targetDir, variables, { force });

        // Execute post-init hook
        await executeHook(template, 'postInit', targetDir);

        console.log(`✅ Generated configuration from template: ${opts.template}`);
        console.log('');

        if (result.created.length > 0) {
          console.log('Files created:');
          result.created.forEach((file) => {
            const relativePath = file.startsWith(targetDir)
              ? file.slice(targetDir.length + 1)
              : file;
            console.log(`  - ${relativePath}`);
          });
        }

        if (result.skipped.length > 0) {
          console.log('');
          console.log('Files skipped (already exist):');
          result.skipped.forEach((file) => {
            const relativePath = file.startsWith(targetDir)
              ? file.slice(targetDir.length + 1)
              : file;
            console.log(`  - ${relativePath}`);
          });
        }

        console.log('');
        console.log('Next steps:');
        console.log('1. Review the generated configuration');
        if (result.created.some((f) => f.endsWith('.env.hatago.example'))) {
          console.log('2. Copy .env.hatago.example to .env and configure');
          console.log('3. Run: hatago serve --stdio');
        } else {
          console.log('2. Run: hatago serve --stdio');
        }

        // Show template documentation if available
        const templateDocPath = join(targetDir, 'HATAGO_TEMPLATE.md');
        if (existsSync(templateDocPath)) {
          console.log('');
          console.log('📚 For detailed setup instructions, see HATAGO_TEMPLATE.md');
        }

        process.exit(0);
      }

      // Original flow (without template)
      // Determine mode
      let mode = opts.mode;

      // If mode not specified, ask the user
      if (!mode) {
        const rl = createInterface({
          input: process.stdin,
          output: process.stdout
        });

        const answer = await new Promise<string>((resolve) => {
          console.log('\nSelect integration mode:');
          console.log('1) STDIO mode (for Claude Code, Cursor, etc.)');
          console.log('2) HTTP mode (for development/debugging)');
          console.log('');
          rl.question('Enter your choice [1-2] (default: 1): ', (input) => {
            rl.close();
            resolve(input.trim() || '1');
          });
        });

        mode = answer === '2' ? 'http' : 'stdio';
      }

      // Generate default config
      const defaultConfig = generateDefaultConfig();

      // Write to file
      writeFileSync(configPath, defaultConfig);

      console.log(`\n✅ Created configuration file: ${configPath}`);
      console.log('');
      console.log('Next steps:');
      console.log(`1. Edit ${configPath} to configure your MCP servers`);
      console.log('2. Run the server:');

      if (mode === 'stdio') {
        console.log(`   hatago serve --stdio --config ${configPath}`);
        console.log('');
        console.log('For Claude Code integration, add to your .mcp.json:');
        console.log(
          JSON.stringify(
            {
              mcpServers: {
                hatago: {
                  command: 'npx',
                  args: ['@himorishige/hatago-mcp-hub', 'serve', '--stdio', '--config', configPath]
                }
              }
            },
            null,
            2
          )
        );
      } else {
        console.log(`   hatago serve --http --config ${configPath}`);
        console.log('');
        console.log('For HTTP mode testing:');
        console.log('  - Default endpoint: http://127.0.0.1:3535/mcp');
        console.log('  - SSE endpoint: http://127.0.0.1:3535/sse');
        console.log('  - Health check: http://127.0.0.1:3535/health');
        console.log('');
        console.log('You can use MCP Inspector to test:');
        console.log('  https://inspector.mcphub.com/');
      }

      // Exit successfully
      process.exit(0);
    } catch (error) {
      console.error(
        `❌ Failed to create configuration file: ${error instanceof Error ? error.message : String(error)}`
      );
      process.exit(1);
    }
  });

// Serve command
program
  .command('serve')
  .description('Start Hatago MCP Hub server')
  .option('--stdio', 'Run in STDIO mode (default)')
  .option('--http', 'Run in HTTP mode')
  .option('-c, --config <path>', 'Path to configuration file')
  .option('-p, --port <port>', 'Port for HTTP mode', '3535')
  .option('-h, --host <host>', 'Host for HTTP mode', '127.0.0.1')
  .option('--verbose', 'Enable verbose logging')
  .option('--quiet', 'Minimize output')
  .option('--watch', 'Watch configuration file for changes')
  .option('--tags <tags>', 'Filter servers by tags (comma-separated)')
  .action(async (options: unknown) => {
    try {
      const opts = options as {
        http?: boolean;
        config?: string;
        port?: string;
        host?: string;
        verbose?: boolean;
        quiet?: boolean;
        watch?: boolean;
        tags?: string;
      };

      // Determine mode
      const mode = opts.http ? 'http' : 'stdio';

      // Set log level
      const logLevel = opts.verbose ? 'debug' : opts.quiet ? 'error' : 'info';

      // Parse tags if provided
      const tags = opts.tags ? opts.tags.split(',').map((t) => t.trim()) : undefined;

      // Preflight: STDIO requires a config file. Check existence and fail immediately.
      if (mode === 'stdio') {
        const pathToCheck = opts.config ?? './hatago.config.json';
        const abs = isAbsolute(pathToCheck) ? pathToCheck : resolve(process.cwd(), pathToCheck);
        if (!existsSync(abs)) {
          console.error('\n❌ Configuration file not found');
          console.error('');
          console.error('   Create a configuration file with:');
          console.error('     hatago init');
          console.error('');
          console.error('   Or specify a different config file:');
          console.error('     hatago serve --config path/to/config.json');
          console.error('');
          process.exit(1);
        }
      }

      // Start server
      await startServer({
        mode,
        config: opts.config,
        port: opts.port ? parseInt(opts.port, 10) : 3535,
        host: opts.host ?? '127.0.0.1',
        logLevel,
        verbose: opts.verbose,
        quiet: opts.quiet,
        watchConfig: opts.watch,
        tags
      });
    } catch (error) {
      // Handle specific errors with cleaner messages
      const errorMessage = error instanceof Error ? error.message : String(error);

      if (errorMessage.includes('ENOENT') && errorMessage.includes('hatago.config.json')) {
        console.error('\n❌ Configuration file not found');
        console.error('');
        console.error('   Create a configuration file with:');
        console.error('     hatago init');
        console.error('');
        console.error('   Or specify a different config file:');
        console.error('     hatago serve --config path/to/config.json');
        console.error('');
      } else if (errorMessage.includes('ENOENT')) {
        console.error(`\n❌ File not found: ${errorMessage.split("'")[1] ?? 'unknown'}`);
      } else {
        console.error('Failed to start server:', error);
      }
      process.exit(1);
    }
  });

// Parse arguments
program.parse(process.argv);

// If no command was provided, show help
if (!process.argv.slice(2).length) {
  program.help();
}
