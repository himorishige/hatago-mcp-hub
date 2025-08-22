/**
 * Init command - Initialize configuration file
 */

import { existsSync } from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import type { Command } from 'commander';
import { generateSampleConfig } from '../../config/loader.js';
import { sanitizeLog } from '../../utils/security.js';

export function createInitCommand(program: Command): void {
  program
    .command('init')
    .description('Initialize configuration file')
    .option('-o, --output <path>', 'Output path', '.hatago/config.jsonc')
    .option('-f, --force', 'Force overwrite existing config file')
    .action(async (options) => {
      try {
        const { createLogger } = await import('../../utils/logger.js');
        const logger = createLogger({ component: 'hatago-cli-init' });

        logger.info({ path: options.output }, 'Creating config file');

        // Check if config file already exists
        if (existsSync(options.output) && !options.force) {
          logger.error(
            { path: options.output },
            'Config file already exists. Use --force to overwrite',
          );
          process.exit(1);
        }

        // Create .hatago directory if needed
        const hatagoDir = dirname(options.output);
        await mkdir(hatagoDir, { recursive: true });

        // Create schemas directory and generate JSON Schema
        const schemasDir = join(hatagoDir, 'schemas');
        await mkdir(schemasDir, { recursive: true });

        // Generate JSON Schema file
        const schemaPath = join(schemasDir, 'config.schema.json');
        if (!existsSync(schemaPath) || options.force) {
          const { generateJsonSchema } = await import('../../config/loader.js');
          const schema = generateJsonSchema();
          await writeFile(schemaPath, JSON.stringify(schema, null, 2), 'utf-8');
          logger.info({ path: schemaPath }, 'Generated JSON Schema');
        }

        // Create .gitignore in .hatago directory
        const gitignorePath = join(hatagoDir, '.gitignore');
        if (!existsSync(gitignorePath)) {
          const gitignoreContent = `# SECURITY WARNING: Never commit these files!
# They contain encryption keys and secrets

# Master encryption key - NEVER share or commit this
master.key

# Salt for key derivation - Keep this secret
master.salt

# Encrypted secrets storage
secrets.json

# Secret management policy
secrets.policy.json

# Any backup files
*.backup
*.bak
*~

# Temporary files
*.tmp
*.temp
`;
          await writeFile(gitignorePath, gitignoreContent, 'utf-8');
          logger.info('Created .gitignore for security');
        }

        // サンプル設定を生成
        const sample = generateSampleConfig();

        // ファイルに書き込み
        await writeFile(options.output, sample, 'utf-8');

        logger.info('Config file created successfully');
        logger.info('Edit the file and then run: hatago serve');
        if (options.force && existsSync(options.output)) {
          logger.warn('Existing config file was overwritten');
        }
      } catch (error) {
        const { logError, createLogger } = await import(
          '../../utils/logger.js'
        );
        const logger = createLogger({ component: 'hatago-cli-init' });
        const _safeError = await sanitizeLog(String(error));
        logError(logger, error, 'Failed to create config file');
        process.exit(1);
      }
    });
}
