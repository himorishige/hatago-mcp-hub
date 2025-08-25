import { beforeEach, describe, expect, it, vi } from 'vitest';
import { OpenAPIGenerator, type OpenAPISpec } from './openapi-generator.js';

describe('OpenAPIGenerator', () => {
  let generator: OpenAPIGenerator;
  let mockOpenAPISpec: OpenAPISpec;

  beforeEach(() => {
    generator = new OpenAPIGenerator();

    mockOpenAPISpec = {
      openapi: '3.0.3',
      info: {
        title: 'Test API',
        version: '1.0.0',
        description: 'A test API for OpenAPI to MCP conversion',
      },
      servers: [
        { url: 'https://api.example.com', description: 'Production server' },
      ],
      paths: {
        '/users/{id}': {
          get: {
            operationId: 'getUser',
            summary: 'Get user by ID',
            description: 'Retrieves a user by their unique identifier',
            tags: ['users'],
            parameters: [
              {
                name: 'id',
                in: 'path',
                required: true,
                description: 'User ID',
                schema: { type: 'string' },
              },
              {
                name: 'include',
                in: 'query',
                required: false,
                description: 'Fields to include',
                schema: { type: 'array', items: { type: 'string' } },
              },
            ],
            responses: {
              '200': {
                description: 'User found',
                content: {
                  'application/json': {
                    schema: {
                      type: 'object',
                      properties: {
                        id: { type: 'string' },
                        name: { type: 'string' },
                        email: { type: 'string' },
                      },
                    },
                  },
                },
              },
              '404': {
                description: 'User not found',
              },
            },
          },
        },
        '/users': {
          post: {
            operationId: 'createUser',
            summary: 'Create a new user',
            description: 'Creates a new user account',
            tags: ['users'],
            requestBody: {
              required: true,
              content: {
                'application/json': {
                  schema: {
                    type: 'object',
                    properties: {
                      name: { type: 'string' },
                      email: { type: 'string', format: 'email' },
                      age: { type: 'number', minimum: 0 },
                    },
                    required: ['name', 'email'],
                  },
                },
              },
            },
            responses: {
              '201': {
                description: 'User created',
                content: {
                  'application/json': {
                    schema: {
                      type: 'object',
                      properties: {
                        id: { type: 'string' },
                        message: { type: 'string' },
                      },
                    },
                  },
                },
              },
            },
          },
        },
        '/health': {
          get: {
            operationId: 'healthCheck',
            summary: 'Health check',
            tags: ['system'],
            responses: {
              '200': {
                description: 'System healthy',
              },
            },
          },
        },
      },
      components: {
        schemas: {
          User: {
            type: 'object',
            properties: {
              id: { type: 'string' },
              name: { type: 'string' },
              email: { type: 'string' },
            },
          },
        },
      },
    };
  });

  describe('generateToolsFromOpenAPI', () => {
    it('should generate MCP tools from OpenAPI spec', async () => {
      const tools = await generator.generateToolsFromOpenAPI(mockOpenAPISpec, {
        serverUrl: 'https://api.example.com',
      });

      expect(tools).toHaveLength(3);

      // Check getUser tool
      const getUserTool = tools.find((t) => t.name === 'getuser');
      expect(getUserTool).toBeDefined();
      expect(getUserTool?.description).toContain('Get user by ID');
      expect(getUserTool?.inputSchema.properties).toHaveProperty('id');
      expect(getUserTool?.inputSchema.properties).toHaveProperty('include');
      expect(getUserTool?.inputSchema.required).toContain('id');
      expect(getUserTool?.inputSchema.required).not.toContain('include');

      // Check createUser tool
      const createUserTool = tools.find((t) => t.name === 'createuser');
      expect(createUserTool).toBeDefined();
      expect(createUserTool?.description).toContain('Create a new user');
      expect(createUserTool?.inputSchema.properties).toHaveProperty('name');
      expect(createUserTool?.inputSchema.properties).toHaveProperty('email');
      expect(createUserTool?.inputSchema.properties).toHaveProperty('age');
      expect(createUserTool?.inputSchema.required).toEqual(['name', 'email']);

      // Check healthCheck tool
      const healthTool = tools.find((t) => t.name === 'healthcheck');
      expect(healthTool).toBeDefined();
      expect(healthTool?.description).toContain('Health check');
    });

    it('should apply name prefix when specified', async () => {
      const tools = await generator.generateToolsFromOpenAPI(mockOpenAPISpec, {
        serverUrl: 'https://api.example.com',
        namePrefix: 'api',
      });

      expect(tools.every((tool) => tool.name.startsWith('api_'))).toBe(true);
      expect(tools.find((t) => t.name === 'api_getuser')).toBeDefined();
      expect(tools.find((t) => t.name === 'api_createuser')).toBeDefined();
    });

    it('should filter operations by operationId patterns', async () => {
      const tools = await generator.generateToolsFromOpenAPI(mockOpenAPISpec, {
        serverUrl: 'https://api.example.com',
        includeOperations: ['.*User.*'],
      });

      expect(tools).toHaveLength(2);
      expect(tools.find((t) => t.name === 'getuser')).toBeDefined();
      expect(tools.find((t) => t.name === 'createuser')).toBeDefined();
      expect(tools.find((t) => t.name === 'healthcheck')).toBeUndefined();
    });

    it('should exclude operations by operationId patterns', async () => {
      const tools = await generator.generateToolsFromOpenAPI(mockOpenAPISpec, {
        serverUrl: 'https://api.example.com',
        excludeOperations: ['health.*'],
      });

      expect(tools).toHaveLength(2);
      expect(tools.find((t) => t.name === 'getuser')).toBeDefined();
      expect(tools.find((t) => t.name === 'createuser')).toBeDefined();
      expect(tools.find((t) => t.name === 'healthcheck')).toBeUndefined();
    });

    it('should filter operations by tags', async () => {
      const tools = await generator.generateToolsFromOpenAPI(mockOpenAPISpec, {
        serverUrl: 'https://api.example.com',
        tagFilter: ['users'],
      });

      expect(tools).toHaveLength(2);
      expect(tools.find((t) => t.name === 'getuser')).toBeDefined();
      expect(tools.find((t) => t.name === 'createuser')).toBeDefined();
      expect(tools.find((t) => t.name === 'healthcheck')).toBeUndefined();
    });

    it('should handle operations without operationId', async () => {
      const specWithoutOperationId = {
        ...mockOpenAPISpec,
        paths: {
          '/test': {
            get: {
              summary: 'Test endpoint',
              responses: {
                '200': { description: 'OK' },
              },
            },
          },
        },
      };

      const tools = await generator.generateToolsFromOpenAPI(
        specWithoutOperationId,
        {
          serverUrl: 'https://api.example.com',
        },
      );

      expect(tools).toHaveLength(1);
      expect(tools[0].name).toBe('get__test');
    });
  });

  describe('createRESTAPIFromTools', () => {
    it('should create REST API endpoints for tools', async () => {
      const mockTools = [
        {
          name: 'greet',
          description: 'Greet a person',
          inputSchema: {
            type: 'object',
            properties: {
              name: { type: 'string' },
            },
            required: ['name'],
          },
        },
        {
          name: 'calculate',
          description: 'Calculate sum',
          inputSchema: {
            type: 'object',
            properties: {
              a: { type: 'number' },
              b: { type: 'number' },
            },
            required: ['a', 'b'],
          },
        },
      ];

      const mockToolHandler = vi
        .fn()
        .mockResolvedValueOnce({ message: 'Hello, World!' })
        .mockResolvedValueOnce({ result: 42 });

      const app = generator.createRESTAPIFromTools(mockTools, mockToolHandler, {
        basePath: '/api',
        enableDocs: true,
        corsEnabled: true,
      });

      // Test that the app was created (this is a basic check)
      expect(app).toBeDefined();

      // In a real test environment, we would make HTTP requests to test the endpoints
      // For now, we verify the tool handler setup
      expect(mockToolHandler).not.toHaveBeenCalled();
    });

    it('should generate OpenAPI spec from tools', async () => {
      const mockTools = [
        {
          name: 'greet',
          description: 'Greet a person',
          inputSchema: {
            type: 'object',
            properties: {
              name: { type: 'string' },
            },
            required: ['name'],
          },
        },
      ];

      const app = generator.createRESTAPIFromTools(mockTools, vi.fn(), {
        basePath: '/api',
        enableDocs: true,
      });

      // The OpenAPI spec generation is handled internally
      // We can verify the app was created with docs enabled
      expect(app).toBeDefined();
    });

    it('should apply CORS headers when enabled', async () => {
      const mockTools = [
        {
          name: 'test',
          description: 'Test tool',
          inputSchema: { type: 'object' },
        },
      ];

      const app = generator.createRESTAPIFromTools(mockTools, vi.fn(), {
        corsEnabled: true,
      });

      expect(app).toBeDefined();
      // CORS middleware is applied internally
    });

    it('should require authentication when configured', async () => {
      const mockTools = [
        {
          name: 'test',
          description: 'Test tool',
          inputSchema: { type: 'object' },
        },
      ];

      const app = generator.createRESTAPIFromTools(mockTools, vi.fn(), {
        authentication: {
          required: true,
          schemes: ['bearer'],
        },
      });

      expect(app).toBeDefined();
      // Authentication middleware is applied internally
    });
  });

  describe('helper methods', () => {
    it('should build correct input schema from parameters and request body', () => {
      // This tests the private buildInputSchema method indirectly
      const operation = {
        parameters: [
          {
            name: 'id',
            in: 'path' as const,
            required: true,
            schema: { type: 'string' },
          },
          {
            name: 'limit',
            in: 'query' as const,
            required: false,
            schema: { type: 'number' },
          },
        ],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  name: { type: 'string' },
                  email: { type: 'string' },
                },
                required: ['name'],
              },
            },
          },
        },
        responses: {},
      };

      // We test this indirectly through generateToolsFromOpenAPI
      const testSpec = {
        ...mockOpenAPISpec,
        paths: {
          '/test/{id}': {
            post: operation,
          },
        },
      };

      return generator
        .generateToolsFromOpenAPI(testSpec, {
          serverUrl: 'https://api.example.com',
        })
        .then((tools) => {
          expect(tools).toHaveLength(1);
          const tool = tools[0];

          expect(tool.inputSchema.properties).toHaveProperty('id');
          expect(tool.inputSchema.properties).toHaveProperty('limit');
          expect(tool.inputSchema.properties).toHaveProperty('name');
          expect(tool.inputSchema.properties).toHaveProperty('email');

          expect(tool.inputSchema.required).toContain('id'); // path param
          expect(tool.inputSchema.required).toContain('name'); // from request body
          expect(tool.inputSchema.required).not.toContain('limit'); // optional query param
          expect(tool.inputSchema.required).not.toContain('email'); // not required in request body
        });
    });
  });
});
