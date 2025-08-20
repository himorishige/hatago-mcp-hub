#!/usr/bin/env tsx
/**
 * Generate JSON Schema from Zod schema for Hatago configuration
 */

import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { zodToJsonSchema } from 'zod-to-json-schema';
import {
  HatagoConfigSchema,
  McpServerConfigSchema,
  McpServersSchema,
} from '../src/config/types.js';

const __dirname = fileURLToPath(new URL('.', import.meta.url));

// Generate JSON Schema from Zod schema
const jsonSchema = zodToJsonSchema(HatagoConfigSchema, {
  name: 'HatagoConfig',
  $refStrategy: 'none', // Inline all definitions for simplicity
  errorMessages: true,
  markdownDescription: true,
});

// Add schema metadata
const schemaWithMeta = {
  $schema: 'http://json-schema.org/draft-07/schema#',
  $id: 'https://github.com/himorishige/hatago-hub/schemas/config.schema.json',
  title: 'Hatago MCP Hub Configuration',
  description: 'Configuration schema for Hatago MCP Hub - A lightweight MCP server management tool',
  ...jsonSchema,
};

// Write schema to file
const outputPath = join(__dirname, '../schemas/config.schema.json');
writeFileSync(outputPath, JSON.stringify(schemaWithMeta, null, 2), 'utf-8');

console.log(`✅ Schema generated: ${outputPath}`);

// Also generate a TypeScript const for embedding
const tsContent = `// Auto-generated JSON Schema for Hatago configuration
// Generated from Zod schema in src/config/types.ts

export const CONFIG_SCHEMA = ${JSON.stringify(schemaWithMeta, null, 2)} as const;
`;

const tsOutputPath = join(__dirname, '../src/config/schema.ts');
writeFileSync(tsOutputPath, tsContent, 'utf-8');

console.log(`✅ TypeScript schema generated: ${tsOutputPath}`);