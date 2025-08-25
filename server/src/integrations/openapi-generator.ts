/**
 * OpenAPI Generator
 *
 * Generate MCP tools from OpenAPI specifications and expose MCP tools as REST APIs.
 */

import type { Tool } from '@modelcontextprotocol/sdk/types.js';
import type { Context } from 'hono';
import { Hono } from 'hono';
import { logger } from '../observability/structured-logger.js';

export interface OpenAPISpec {
  openapi: string;
  info: {
    title: string;
    version: string;
    description?: string;
  };
  servers?: Array<{
    url: string;
    description?: string;
  }>;
  paths: Record<string, Record<string, OpenAPIOperation>>;
  components?: {
    schemas?: Record<string, any>;
    securitySchemes?: Record<string, any>;
  };
}

export interface OpenAPIOperation {
  operationId?: string;
  summary?: string;
  description?: string;
  tags?: string[];
  parameters?: OpenAPIParameter[];
  requestBody?: {
    required?: boolean;
    content: Record<
      string,
      {
        schema: any;
      }
    >;
  };
  responses: Record<
    string,
    {
      description: string;
      content?: Record<
        string,
        {
          schema: any;
        }
      >;
    }
  >;
  security?: Array<Record<string, string[]>>;
}

export interface OpenAPIParameter {
  name: string;
  in: 'path' | 'query' | 'header' | 'cookie';
  required?: boolean;
  description?: string;
  schema: any;
}

export interface OpenAPIToMCPOptions {
  serverUrl: string;
  authentication?: {
    type: 'bearer' | 'api-key' | 'basic' | 'oauth2';
    headerName?: string;
    tokenValue?: string;
  };
  includeOperations?: string[]; // operationId patterns to include
  excludeOperations?: string[]; // operationId patterns to exclude
  tagFilter?: string[]; // Only include operations with these tags
  namePrefix?: string; // Prefix for generated tool names
}

export interface MCPToRESTOptions {
  basePath?: string;
  enableDocs?: boolean;
  corsEnabled?: boolean;
  authentication?: {
    required?: boolean;
    schemes?: string[];
  };
  rateLimiting?: {
    windowMs?: number;
    maxRequests?: number;
  };
}

export class OpenAPIGenerator {
  private httpClient: typeof fetch;

  constructor() {
    this.httpClient = fetch;
  }

  /**
   * Generate MCP tools from OpenAPI specification
   */
  async generateToolsFromOpenAPI(
    spec: OpenAPISpec | string,
    options: OpenAPIToMCPOptions,
  ): Promise<Tool[]> {
    const parsedSpec =
      typeof spec === 'string' ? await this.loadOpenAPISpec(spec) : spec;

    logger.info('Generating MCP tools from OpenAPI spec', {
      title: parsedSpec.info.title,
      version: parsedSpec.info.version,
      operationCount: this.countOperations(parsedSpec),
    });

    const tools: Tool[] = [];

    for (const [path, methods] of Object.entries(parsedSpec.paths)) {
      for (const [method, operation] of Object.entries(methods)) {
        if (this.shouldIncludeOperation(operation, options)) {
          const tool = await this.convertOperationToTool(
            path,
            method,
            operation,
            parsedSpec,
            options,
          );

          if (tool) {
            tools.push(tool);
          }
        }
      }
    }

    logger.info('Generated MCP tools from OpenAPI', {
      toolCount: tools.length,
      serverUrl: options.serverUrl,
    });

    return tools;
  }

  /**
   * Create REST API endpoints from MCP tools
   */
  createRESTAPIFromTools(
    tools: Tool[],
    toolCallHandler: (toolName: string, args: any) => Promise<any>,
    options: MCPToRESTOptions = {},
  ): Hono {
    const app = new Hono();
    const basePath = options.basePath || '/api';

    logger.info('Creating REST API from MCP tools', {
      toolCount: tools.length,
      basePath,
    });

    // Add CORS middleware if enabled
    if (options.corsEnabled) {
      app.use('*', async (c, next) => {
        c.header('Access-Control-Allow-Origin', '*');
        c.header(
          'Access-Control-Allow-Methods',
          'GET, POST, PUT, DELETE, OPTIONS',
        );
        c.header('Access-Control-Allow-Headers', 'Content-Type, Authorization');

        if (c.req.method === 'OPTIONS') {
          return c.text('', 204);
        }

        await next();
      });
    }

    // Add authentication middleware if required
    if (options.authentication?.required) {
      app.use(`${basePath}/*`, async (c, next) => {
        const authHeader = c.req.header('Authorization');

        if (!authHeader) {
          return c.json({ error: 'Authorization header required' }, 401);
        }

        // Basic auth validation (would be enhanced in real implementation)
        if (
          !authHeader.startsWith('Bearer ') &&
          !authHeader.startsWith('Basic ')
        ) {
          return c.json({ error: 'Invalid authorization scheme' }, 401);
        }

        await next();
      });
    }

    // Create endpoints for each tool
    for (const tool of tools) {
      const endpoint = `${basePath}/tools/${tool.name}`;

      // POST endpoint for tool execution
      app.post(endpoint, async (c: Context) => {
        try {
          const args = await c.req.json().catch(() => ({}));

          logger.debug('REST API tool call', {
            tool: tool.name,
            args,
            endpoint,
          });

          const result = await toolCallHandler(tool.name, args);

          return c.json({
            tool: tool.name,
            success: true,
            result,
          });
        } catch (error) {
          logger.error('REST API tool call failed', {
            tool: tool.name,
            error: error instanceof Error ? error.message : String(error),
            endpoint,
          });

          return c.json(
            {
              tool: tool.name,
              success: false,
              error: error instanceof Error ? error.message : 'Unknown error',
            },
            500,
          );
        }
      });

      // GET endpoint for tool information
      app.get(endpoint, (c: Context) => {
        return c.json({
          name: tool.name,
          description: tool.description,
          inputSchema: tool.inputSchema,
        });
      });
    }

    // List all tools
    app.get(`${basePath}/tools`, (c: Context) => {
      return c.json({
        tools: tools.map((tool) => ({
          name: tool.name,
          description: tool.description,
          endpoint: `${basePath}/tools/${tool.name}`,
        })),
      });
    });

    // OpenAPI documentation endpoint
    if (options.enableDocs) {
      app.get(`${basePath}/docs/openapi.json`, (c: Context) => {
        const openApiSpec = this.generateOpenAPISpecFromTools(tools, options);
        return c.json(openApiSpec);
      });

      app.get(`${basePath}/docs`, (c: Context) => {
        return c.html(
          this.generateSwaggerUIHTML(`${basePath}/docs/openapi.json`),
        );
      });
    }

    return app;
  }

  private async loadOpenAPISpec(specUrl: string): Promise<OpenAPISpec> {
    try {
      if (specUrl.startsWith('http')) {
        // Load from URL
        const response = await this.httpClient(specUrl);
        if (!response.ok) {
          throw new Error(
            `Failed to load OpenAPI spec: ${response.status} ${response.statusText}`,
          );
        }
        return await response.json();
      } else {
        // Load from file (would use fs in Node.js environment)
        throw new Error('File loading not implemented in this context');
      }
    } catch (error) {
      logger.error('Failed to load OpenAPI spec', { specUrl, error });
      throw error;
    }
  }

  private countOperations(spec: OpenAPISpec): number {
    let count = 0;
    for (const methods of Object.values(spec.paths)) {
      count += Object.keys(methods).length;
    }
    return count;
  }

  private shouldIncludeOperation(
    operation: OpenAPIOperation,
    options: OpenAPIToMCPOptions,
  ): boolean {
    // Check operationId include/exclude filters
    if (options.includeOperations?.length && operation.operationId) {
      const included = options.includeOperations.some((pattern) =>
        new RegExp(pattern).test(operation.operationId!),
      );
      if (!included) return false;
    }

    if (options.excludeOperations?.length && operation.operationId) {
      const excluded = options.excludeOperations.some((pattern) =>
        new RegExp(pattern).test(operation.operationId!),
      );
      if (excluded) return false;
    }

    // Check tag filter
    if (options.tagFilter?.length) {
      if (!operation.tags?.some((tag) => options.tagFilter?.includes(tag))) {
        return false;
      }
    }

    return true;
  }

  private async convertOperationToTool(
    path: string,
    method: string,
    operation: OpenAPIOperation,
    spec: OpenAPISpec,
    options: OpenAPIToMCPOptions,
  ): Promise<Tool | null> {
    const toolName = this.generateToolName(
      path,
      method,
      operation,
      options.namePrefix,
    );

    // Build input schema from parameters and request body
    const inputSchema = this.buildInputSchema(operation, spec);

    const tool: Tool = {
      name: toolName,
      description: this.buildToolDescription(path, method, operation),
      inputSchema,
    };

    return tool;
  }

  private generateToolName(
    path: string,
    method: string,
    operation: OpenAPIOperation,
    prefix?: string,
  ): string {
    let name =
      operation.operationId ||
      `${method}_${path.replace(/[^a-zA-Z0-9]/g, '_')}`;

    if (prefix) {
      name = `${prefix}_${name}`;
    }

    return name.toLowerCase().replace(/__+/g, '_');
  }

  private buildToolDescription(
    path: string,
    method: string,
    operation: OpenAPIOperation,
  ): string {
    const parts = [];

    if (operation.summary) {
      parts.push(operation.summary);
    }

    if (operation.description) {
      parts.push(operation.description);
    }

    parts.push(`${method.toUpperCase()} ${path}`);

    return parts.join('\n');
  }

  private buildInputSchema(
    operation: OpenAPIOperation,
    _spec: OpenAPISpec,
  ): any {
    const properties: Record<string, any> = {};
    const required: string[] = [];

    // Add path parameters
    if (operation.parameters) {
      for (const param of operation.parameters) {
        if (param.in === 'path' || param.in === 'query') {
          properties[param.name] = {
            ...param.schema,
            description: param.description,
          };

          if (param.required || param.in === 'path') {
            required.push(param.name);
          }
        }
      }
    }

    // Add request body properties
    if (operation.requestBody?.content) {
      const jsonContent = operation.requestBody.content['application/json'];
      if (jsonContent?.schema) {
        if (
          jsonContent.schema.type === 'object' &&
          jsonContent.schema.properties
        ) {
          Object.assign(properties, jsonContent.schema.properties);

          if (jsonContent.schema.required) {
            required.push(...jsonContent.schema.required);
          }
        } else {
          properties.body = jsonContent.schema;
          if (operation.requestBody.required) {
            required.push('body');
          }
        }
      }
    }

    return {
      type: 'object',
      properties,
      required: required.length > 0 ? required : undefined,
    };
  }

  private generateOpenAPISpecFromTools(
    tools: Tool[],
    options: MCPToRESTOptions,
  ): any {
    const basePath = options.basePath || '/api';

    const spec: any = {
      openapi: '3.0.3',
      info: {
        title: 'MCP Tools REST API',
        version: '1.0.0',
        description: 'REST API endpoints for MCP tools',
      },
      paths: {},
    };

    for (const tool of tools) {
      const path = `${basePath}/tools/${tool.name}`;

      spec.paths[path] = {
        post: {
          summary: `Execute ${tool.name}`,
          description: tool.description,
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: tool.inputSchema || { type: 'object' },
              },
            },
          },
          responses: {
            '200': {
              description: 'Tool execution result',
              content: {
                'application/json': {
                  schema: {
                    type: 'object',
                    properties: {
                      tool: { type: 'string' },
                      success: { type: 'boolean' },
                      result: {},
                    },
                  },
                },
              },
            },
            '500': {
              description: 'Tool execution error',
              content: {
                'application/json': {
                  schema: {
                    type: 'object',
                    properties: {
                      tool: { type: 'string' },
                      success: { type: 'boolean' },
                      error: { type: 'string' },
                    },
                  },
                },
              },
            },
          },
        },
        get: {
          summary: `Get ${tool.name} information`,
          responses: {
            '200': {
              description: 'Tool information',
              content: {
                'application/json': {
                  schema: {
                    type: 'object',
                    properties: {
                      name: { type: 'string' },
                      description: { type: 'string' },
                      inputSchema: {},
                    },
                  },
                },
              },
            },
          },
        },
      };
    }

    return spec;
  }

  private generateSwaggerUIHTML(specUrl: string): string {
    return `
<!DOCTYPE html>
<html>
<head>
  <title>MCP Tools API Documentation</title>
  <link rel="stylesheet" type="text/css" href="https://unpkg.com/swagger-ui-dist@5.9.0/swagger-ui.css" />
  <style>
    html { box-sizing: border-box; overflow: -moz-scrollbars-vertical; overflow-y: scroll; }
    *, *:before, *:after { box-sizing: inherit; }
    body { margin:0; background: #fafafa; }
  </style>
</head>
<body>
  <div id="swagger-ui"></div>
  <script src="https://unpkg.com/swagger-ui-dist@5.9.0/swagger-ui-bundle.js"></script>
  <script>
    SwaggerUIBundle({
      url: '${specUrl}',
      dom_id: '#swagger-ui',
      deepLinking: true,
      presets: [
        SwaggerUIBundle.presets.apis,
        SwaggerUIBundle.presets.standalone
      ],
      plugins: [
        SwaggerUIBundle.plugins.DownloadUrl
      ],
      layout: "StandaloneLayout"
    });
  </script>
</body>
</html>
    `;
  }
}
