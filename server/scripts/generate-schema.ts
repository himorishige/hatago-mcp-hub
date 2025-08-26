#!/usr/bin/env tsx
/**
 * Generate JSON Schema from Zod schema for Hatago configuration
 */

import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { zodToJsonSchema } from 'zod-to-json-schema';
import { HatagoConfigSchema } from '../src/config/types.js';

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
  description: 'Configuration schema for Hatago MCP Hub - Lightweight MCP server management',
  ...jsonSchema,
};

// Create output directory
const outputDir = join(__dirname, '../dist/schema');
mkdirSync(outputDir, { recursive: true });

// Write schema to file
const outputPath = join(outputDir, 'config.schema.json');
writeFileSync(outputPath, JSON.stringify(schemaWithMeta, null, 2), 'utf-8');

console.log(`✅ Schema generated: ${outputPath}`);

// Also generate an example configuration
const exampleConfig = {
  $schema: './schema/config.schema.json',
  version: 1,
  logLevel: 'info',
  http: {
    port: 3000,
    host: 'localhost'
  },
  mcpServers: {
    'example-local': {
      command: 'node',
      args: ['./example-server.js'],
      env: {
        NODE_ENV: 'production'
      }
    },
    'example-npx': {
      command: 'npx',
      args: ['@modelcontextprotocol/server-filesystem', '/tmp']
    },
    'example-remote': {
      url: 'http://localhost:8080/mcp',
      transport: 'http'
    }
  }
};

const examplePath = join(outputDir, 'example.config.json');
writeFileSync(examplePath, JSON.stringify(exampleConfig, null, 2), 'utf-8');

console.log(`✅ Example config generated: ${examplePath}`);