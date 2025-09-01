#!/usr/bin/env tsx
/**
 * Generate JSON Schema from TypeScript configuration types
 * This script generates a JSON schema for the Hatago configuration
 */

import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = fileURLToPath(new URL('.', import.meta.url));

// Create a simple JSON schema for Hatago configuration
const schema = {
  $schema: 'http://json-schema.org/draft-07/schema#',
  $id: 'https://github.com/himorishige/hatago-hub/schemas/config.schema.json',
  title: 'Hatago MCP Hub Configuration',
  description: 'Configuration schema for Hatago MCP Hub - Lightweight MCP server management',
  type: 'object',
  properties: {
    version: {
      type: 'number',
      description: 'Configuration version',
      const: 1
    },
    logLevel: {
      type: 'string',
      description: 'Logging level',
      enum: ['debug', 'info', 'warn', 'error'],
      default: 'info'
    },
    http: {
      type: 'object',
      description: 'HTTP server configuration',
      properties: {
        port: {
          type: 'number',
          description: 'Port to listen on',
          default: 3000
        },
        host: {
          type: 'string',
          description: 'Host to bind to',
          default: 'localhost'
        }
      }
    },
    mcpServers: {
      type: 'object',
      description: 'MCP servers configuration (Claude Code compatible)',
      additionalProperties: {
        type: 'object',
        properties: {
          type: {
            type: 'string',
            enum: ['http', 'sse'],
            description: 'Server type (optional for HTTP, required for SSE)'
          },
          command: {
            type: 'string',
            description: 'Command to execute for STDIO servers'
          },
          args: {
            type: 'array',
            items: { type: 'string' },
            description: 'Command arguments'
          },
          cwd: {
            type: 'string',
            description: 'Working directory for STDIO servers'
          },
          url: {
            type: 'string',
            description: 'URL for HTTP/SSE servers'
          },
          headers: {
            type: 'object',
            additionalProperties: { type: 'string' },
            description: 'HTTP headers for remote servers'
          },
          env: {
            type: 'object',
            additionalProperties: { type: 'string' },
            description: 'Environment variables'
          },
          disabled: {
            type: 'boolean',
            description: 'Whether this server is disabled',
            default: false
          },
          tags: {
            type: 'array',
            items: { type: 'string' },
            description: 'Tags for grouping servers (e.g., "dev", "production", "開発")'
          }
        }
      }
    }
  },
  required: ['version']
};

// Create output directory
const outputDir = join(__dirname, '../../../schemas');
mkdirSync(outputDir, { recursive: true });

// Write schema to file
const outputPath = join(outputDir, 'config.schema.json');
writeFileSync(outputPath, JSON.stringify(schema, null, 2), 'utf-8');

console.log(`✅ Schema generated: ${outputPath}`);

// Also generate an example configuration (Claude Code compatible)
const exampleConfig = {
  $schema: './config.schema.json',
  version: 1,
  logLevel: 'info',
  http: {
    port: 3535,
    host: 'localhost'
  },
  mcpServers: {
    filesystem: {
      command: 'npx',
      args: ['-y', '@modelcontextprotocol/server-filesystem', '.']
    },
    'github-sse': {
      type: 'sse',
      url: 'https://api.github.com/mcp/sse',
      headers: {
        Authorization: 'Bearer ${GITHUB_TOKEN}'
      }
    },
    'openai-api': {
      url: 'https://api.openai.com/mcp',
      headers: {
        Authorization: 'Bearer ${OPENAI_API_KEY}'
      }
    },
    'local-script': {
      command: 'node',
      args: ['./my-mcp-server.js'],
      env: {
        NODE_ENV: 'production'
      }
    }
  }
};

const examplePath = join(outputDir, 'example.config.json');
writeFileSync(examplePath, JSON.stringify(exampleConfig, null, 2), 'utf-8');

console.log(`✅ Example config generated: ${examplePath}`);
