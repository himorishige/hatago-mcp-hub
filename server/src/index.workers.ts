/**
 * Cloudflare Workers entry point for Hatago MCP Hub
 *
 * This entry point is specifically for Cloudflare Workers environment.
 * It only supports remote MCP servers (HTTP/SSE/WebSocket).
 * Local process spawning is not available in Workers.
 */

import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { logger as honoLogger } from 'hono/logger';
import { streamSSE } from 'hono/streaming';
import { McpHub } from './core/mcp-hub.js';
import type { RuntimeCapabilities } from './platform/types.js';
import {
  type CacheManager,
  initGlobalCache,
} from './platform/workers/cache-manager.js';
import { createWorkersPlatform } from './platform/workers/index.js';
import { WorkersKVStorage } from './platform/workers/kv-storage.js';

// Workers bindings interface
export interface Env {
  // KV Namespaces
  HATAGO_CONFIG?: KVNamespace;
  HATAGO_SESSIONS?: KVNamespace;

  // Environment variables
  DEBUG?: string;
  LOG_LEVEL?: string;
  CORS_ORIGIN?: string;

  // Test MCP server configuration
  TEST_MCP_HTTP_URL?: string;
  TEST_MCP_SSE_URL?: string;
  TEST_MCP_API_KEY?: string;
  ALLOW_INSECURE_HTTP?: string;
}

// Simple console logger for Workers
const logger = {
  info: (message: string, data?: any) => {
    console.log(`[INFO] ${message}`, data || '');
  },
  error: (message: string, data?: any) => {
    console.error(`[ERROR] ${message}`, data || '');
  },
  warn: (message: string, data?: any) => {
    console.warn(`[WARN] ${message}`, data || '');
  },
  debug: (message: string, data?: any) => {
    console.log(`[DEBUG] ${message}`, data || '');
  },
};

/**
 * Create and configure Hono app for Workers
 */
function createApp(
  hub: McpHub,
  capabilities: RuntimeCapabilities,
  cacheManager?: CacheManager,
): Hono<{ Bindings: Env }> {
  const app = new Hono<{ Bindings: Env }>();

  // Middleware
  app.use('*', honoLogger());
  app.use(
    '*',
    cors({
      origin: (_origin, c) => {
        const allowedOrigin = c.env.CORS_ORIGIN || '*';
        return allowedOrigin;
      },
      credentials: true,
    }),
  );

  // Health check
  app.get('/health', (c) => {
    return c.json({
      status: 'healthy',
      runtime: capabilities.name,
      supportedMCPTypes: capabilities.supportedMCPTypes,
      timestamp: new Date().toISOString(),
    });
  });

  // MCP root endpoint for direct connection (StreamableHttp)
  app.post('/mcp', async (c) => {
    try {
      // Check if client accepts SSE
      const acceptsSSE = c.req.header('accept')?.includes('text/event-stream');

      // Parse request body
      const body = await c.req.json();
      const { method, params, id } = body;

      // Debug log the request
      logger.info('MCP request received', {
        method,
        hasProgressToken: !!params?._meta?.progressToken,
        progressToken: params?._meta?.progressToken,
        headers: {
          accept: c.req.header('accept'),
        },
      });

      // Check if we should use SSE (for long-running operations)
      const hasProgressToken = params?._meta?.progressToken !== undefined;
      const isLongRunningTool =
        method === 'tools/call' &&
        [
          'deepwiki-mcp_ask_question',
          'deepwiki-mcp_read_wiki_contents',
        ].includes(params?.name);
      const shouldStream =
        acceptsSSE && (hasProgressToken || isLongRunningTool);

      // If streaming is needed, use SSE
      if (shouldStream) {
        // Set headers for SSE
        c.header('Content-Type', 'text/event-stream');
        c.header('Cache-Control', 'no-cache');
        c.header('Connection', 'keep-alive');

        // For wrangler dev environment
        if (c.env.LOG_LEVEL === 'debug') {
          c.header('Content-Encoding', 'identity');
        }

        return streamSSE(c, async (stream) => {
          let progressInterval: NodeJS.Timeout | undefined;
          let progressCount = 0;

          try {
            // Start progress notifications if we have a progress token
            if (hasProgressToken) {
              // Send first progress notification immediately
              try {
                const firstNotification = {
                  jsonrpc: '2.0',
                  method: 'notifications/progress',
                  params: {
                    progressToken: params._meta.progressToken,
                    progress: progressCount++,
                  },
                };

                await stream.writeSSE({
                  data: JSON.stringify(firstNotification),
                });

                logger.debug('Sent initial progress notification', {
                  progressCount,
                });
              } catch (err) {
                logger.debug(
                  'Failed to send initial progress notification',
                  err,
                );
              }

              // Continue sending progress notifications every 3 seconds
              progressInterval = setInterval(async () => {
                try {
                  const progressNotification = {
                    jsonrpc: '2.0',
                    method: 'notifications/progress',
                    params: {
                      progressToken: params._meta.progressToken,
                      progress: progressCount++,
                    },
                  };

                  // Send progress notification via SSE
                  await stream.writeSSE({
                    data: JSON.stringify(progressNotification),
                  });

                  logger.debug('Sent progress notification', { progressCount });
                } catch (err) {
                  logger.debug('Failed to send progress notification', err);
                }
              }, 3000); // Send every 3 seconds
            }

            // Handle the actual request
            let response;
            switch (method) {
              case 'initialize':
                response = {
                  jsonrpc: '2.0',
                  result: {
                    protocolVersion: '2024-11-05',
                    capabilities: {
                      tools: {},
                      resources: {},
                      prompts: {},
                    },
                    serverInfo: {
                      name: 'hatago-hub',
                      version: '0.0.1',
                    },
                  },
                  id,
                };
                break;

              case 'initialized':
                response = { jsonrpc: '2.0', result: {}, id };
                break;

              case 'tools/list': {
                // Try to get tools from cache or hub
                let tools;
                if (cacheManager) {
                  tools = await cacheManager.get(
                    'tools:all',
                    async () => {
                      // Fetch tools from hub
                      const toolsResponse = await hub.handleRequest('_hub', {
                        jsonrpc: '2.0',
                        method: 'tools/list',
                        id: id || 'cache-fetch',
                      });
                      return toolsResponse.result?.tools || [];
                    },
                    {
                      memoryTtl: 5 * 60 * 1000, // 5 minutes
                      kvTtl: 60 * 60, // 1 hour
                    },
                  );
                }

                // Fallback to hardcoded tools if cache fails
                if (!tools || tools.length === 0) {
                  tools = [
                    {
                      name: 'deepwiki-mcp_read_wiki_structure',
                      description:
                        'Get a list of documentation topics for a GitHub repository',
                      inputSchema: {
                        type: 'object',
                        properties: {
                          repoName: {
                            type: 'string',
                            description:
                              'GitHub repository: owner/repo (e.g. "facebook/react")',
                          },
                        },
                        required: ['repoName'],
                        additionalProperties: false,
                        $schema: 'http://json-schema.org/draft-07/schema#',
                      },
                    },
                    {
                      name: 'deepwiki-mcp_read_wiki_contents',
                      description:
                        'View documentation about a GitHub repository',
                      inputSchema: {
                        type: 'object',
                        properties: {
                          repoName: {
                            type: 'string',
                            description:
                              'GitHub repository: owner/repo (e.g. "facebook/react")',
                          },
                        },
                        required: ['repoName'],
                        additionalProperties: false,
                        $schema: 'http://json-schema.org/draft-07/schema#',
                      },
                    },
                    {
                      name: 'deepwiki-mcp_ask_question',
                      description: 'Ask any question about a GitHub repository',
                      inputSchema: {
                        type: 'object',
                        properties: {
                          repoName: {
                            type: 'string',
                            description:
                              'GitHub repository: owner/repo (e.g. "facebook/react")',
                          },
                          question: {
                            type: 'string',
                            description:
                              'The question to ask about the repository',
                          },
                        },
                        required: ['repoName', 'question'],
                        additionalProperties: false,
                        $schema: 'http://json-schema.org/draft-07/schema#',
                      },
                    },
                  ];
                }

                response = {
                  jsonrpc: '2.0',
                  result: {
                    tools: tools,
                  },
                  id,
                };
                break;
              }

              case 'tools/call': {
                // Extract server ID from prefixed tool name
                const toolName = params.name as string;
                const separatorIndex = toolName.indexOf('_');
                if (separatorIndex === -1) {
                  response = {
                    jsonrpc: '2.0',
                    error: {
                      code: -32602,
                      message:
                        'Invalid tool name format. Expected: serverId_toolName',
                    },
                    id,
                  };
                } else {
                  const serverId = toolName.substring(0, separatorIndex);
                  const actualToolName = toolName.substring(separatorIndex + 1);

                  // Ensure hub is initialized (lazy initialization)
                  if (!hub.isInitialized()) {
                    logger.info('Lazy initializing hub for tool call');
                    await hub.initialize();
                  }

                  // Forward to the appropriate server with unprefixed name
                  const modifiedBody = {
                    ...body,
                    params: {
                      ...params,
                      name: actualToolName,
                    },
                  };

                  response = await hub.handleRequest(serverId, modifiedBody);
                }
                break;
              }

              default:
                response = {
                  jsonrpc: '2.0',
                  error: {
                    code: -32601,
                    message: `Method not supported: ${method}`,
                  },
                  id,
                };
            }

            // Send the final response via SSE
            await stream.writeSSE({
              data: JSON.stringify(response),
            });
          } finally {
            // Stop progress notifications
            if (progressInterval) {
              clearInterval(progressInterval);
            }

            // Close the stream
            await stream.close();
          }
        });
      } else {
        // Non-streaming response (traditional JSON)
        let response;
        switch (method) {
          case 'initialize':
            response = {
              jsonrpc: '2.0',
              result: {
                protocolVersion: '2024-11-05',
                capabilities: {
                  tools: {},
                  resources: {},
                  prompts: {},
                },
                serverInfo: {
                  name: 'hatago-hub',
                  version: '0.0.1',
                },
              },
              id,
            };
            break;

          case 'initialized':
            response = { jsonrpc: '2.0', result: {}, id };
            break;

          case 'tools/list': {
            // Try to get tools from cache or hub
            let tools;
            if (cacheManager) {
              tools = await cacheManager.get(
                'tools:all',
                async () => {
                  // Fetch tools from hub
                  const toolsResponse = await hub.handleRequest('_hub', {
                    jsonrpc: '2.0',
                    method: 'tools/list',
                    id: id || 'cache-fetch',
                  });
                  return toolsResponse.result?.tools || [];
                },
                {
                  memoryTtl: 5 * 60 * 1000, // 5 minutes
                  kvTtl: 60 * 60, // 1 hour
                },
              );
            }

            // Fallback to hardcoded tools if cache fails
            if (!tools || tools.length === 0) {
              tools = [
                {
                  name: 'deepwiki-mcp_read_wiki_structure',
                  description:
                    'Get a list of documentation topics for a GitHub repository',
                  inputSchema: {
                    type: 'object',
                    properties: {
                      repoName: {
                        type: 'string',
                        description:
                          'GitHub repository: owner/repo (e.g. "facebook/react")',
                      },
                    },
                    required: ['repoName'],
                    additionalProperties: false,
                    $schema: 'http://json-schema.org/draft-07/schema#',
                  },
                },
                {
                  name: 'deepwiki-mcp_read_wiki_contents',
                  description: 'View documentation about a GitHub repository',
                  inputSchema: {
                    type: 'object',
                    properties: {
                      repoName: {
                        type: 'string',
                        description:
                          'GitHub repository: owner/repo (e.g. "facebook/react")',
                      },
                    },
                    required: ['repoName'],
                    additionalProperties: false,
                    $schema: 'http://json-schema.org/draft-07/schema#',
                  },
                },
                {
                  name: 'deepwiki-mcp_ask_question',
                  description: 'Ask any question about a GitHub repository',
                  inputSchema: {
                    type: 'object',
                    properties: {
                      repoName: {
                        type: 'string',
                        description:
                          'GitHub repository: owner/repo (e.g. "facebook/react")',
                      },
                      question: {
                        type: 'string',
                        description: 'The question to ask about the repository',
                      },
                    },
                    required: ['repoName', 'question'],
                    additionalProperties: false,
                    $schema: 'http://json-schema.org/draft-07/schema#',
                  },
                },
              ];
            }

            return c.json({
              jsonrpc: '2.0',
              result: {
                tools: tools,
              },
              id,
            });
          }

          case 'tools/call': {
            // Extract server ID from prefixed tool name
            const toolName = params.name as string;
            const separatorIndex = toolName.indexOf('_');
            if (separatorIndex === -1) {
              return c.json({
                jsonrpc: '2.0',
                error: {
                  code: -32602,
                  message:
                    'Invalid tool name format. Expected: serverId_toolName',
                },
                id,
              });
            }

            const serverId = toolName.substring(0, separatorIndex);
            const actualToolName = toolName.substring(separatorIndex + 1);

            // Ensure hub is initialized (lazy initialization)
            if (!hub.isInitialized()) {
              logger.info('Lazy initializing hub for tool call');
              await hub.initialize();
            }

            // Forward to the appropriate server with unprefixed name
            const modifiedBody = {
              ...body,
              params: {
                ...params,
                name: actualToolName,
              },
            };

            const result = await hub.handleRequest(serverId, modifiedBody);
            return c.json(result);
          }

          default:
            return c.json({
              jsonrpc: '2.0',
              error: {
                code: -32601,
                message: `Method not supported: ${method}`,
              },
              id,
            });
        }

        return c.json(response);
      }
    } catch (error) {
      logger.error('Direct MCP request failed', { error });
      return c.json(
        {
          jsonrpc: '2.0',
          error: {
            code: -32603,
            message: error instanceof Error ? error.message : 'Internal error',
          },
          id: null,
        },
        500,
      );
    }
  });

  // MCP endpoints
  app.post('/mcp/:serverId', async (c) => {
    const serverId = c.req.param('serverId');
    const body = await c.req.json();

    try {
      // Process MCP request through the hub
      const response = await hub.handleRequest(serverId, body);
      return c.json(response);
    } catch (error) {
      logger.error('MCP request failed', { serverId, error });
      return c.json(
        {
          jsonrpc: '2.0',
          error: {
            code: -32603,
            message: error instanceof Error ? error.message : 'Internal error',
          },
          id: body.id || null,
        },
        500,
      );
    }
  });

  // List available servers
  app.get('/mcp/servers', async (c) => {
    try {
      const servers = await hub.listServers();
      return c.json({ servers });
    } catch (error) {
      logger.error('Failed to list servers', { error });
      return c.json({ error: 'Failed to list servers' }, 500);
    }
  });

  // SSE endpoint for streaming responses
  app.get('/mcp/:serverId/stream', async (c) => {
    const serverId = c.req.param('serverId');

    // Create a TransformStream for SSE
    const { readable, writable } = new TransformStream();
    const writer = writable.getWriter();
    const encoder = new TextEncoder();

    // Set SSE headers
    c.header('Content-Type', 'text/event-stream');
    c.header('Cache-Control', 'no-cache, no-transform');
    c.header('Connection', 'keep-alive');

    // Handle SSE connection
    (async () => {
      try {
        // Send initial connection event
        await writer.write(
          encoder.encode('event: connected\ndata: {"status":"connected"}\n\n'),
        );

        // Keep connection alive with periodic heartbeats
        const heartbeatInterval = setInterval(async () => {
          try {
            await writer.write(encoder.encode(': keepalive\n\n'));
          } catch (_error) {
            clearInterval(heartbeatInterval);
          }
        }, 30000); // 30 seconds

        // TODO: Implement actual SSE streaming from MCP servers
      } catch (error) {
        logger.error('SSE stream error', { serverId, error });
      } finally {
        await writer.close();
      }
    })();

    return new Response(readable);
  });

  // 404 handler
  app.notFound((c) => {
    return c.json({ error: 'Not found' }, 404);
  });

  return app;
}

/**
 * Cloudflare Workers fetch handler
 */
export default {
  async fetch(
    request: Request,
    env: Env,
    ctx: ExecutionContext,
  ): Promise<Response> {
    try {
      // Create platform with Workers-specific implementations
      const platform = await createWorkersPlatform({
        kvNamespaces: {
          config: env.HATAGO_CONFIG,
          sessions: env.HATAGO_SESSIONS,
        },
        logger: {
          level:
            (env.LOG_LEVEL as 'debug' | 'info' | 'warn' | 'error') || 'info',
        },
      });

      // Initialize global cache manager
      const kvStorage = new WorkersKVStorage({
        configNamespace: env.HATAGO_CONFIG,
        sessionNamespace: env.HATAGO_SESSIONS,
      });
      const cacheManager = initGlobalCache(kvStorage, {
        memoryTtl: 5 * 60 * 1000, // 5 minutes
        kvTtl: 60 * 60, // 1 hour
        staleWhileRevalidate: 30 * 1000, // 30 seconds
      });

      // Log runtime capabilities
      logger.info('Workers runtime initialized', {
        capabilities: platform.capabilities,
      });

      // Create McpHub with Workers platform
      const hub = new McpHub({
        platform,
        // Workers-specific config
        config: {
          // Only remote servers are supported
          servers: [
            // DeepWiki MCP server (HTTPS, supports both HTTP and SSE)
            {
              id: 'deepwiki-mcp',
              type: 'remote' as const,
              url: 'https://mcp.deepwiki.com/mcp',
              transport: 'http' as const,
            },
            // Test with a local HTTP MCP server if configured
            ...(env.ALLOW_INSECURE_HTTP === 'true' && env.TEST_MCP_HTTP_URL
              ? [
                  {
                    id: 'test-http-server',
                    type: 'remote' as const,
                    url: env.TEST_MCP_HTTP_URL,
                    transport: 'http' as const,
                    auth: env.TEST_MCP_API_KEY
                      ? {
                          type: 'bearer' as const,
                          token: env.TEST_MCP_API_KEY,
                        }
                      : undefined,
                  },
                ]
              : []),
            // Test with a sample SSE MCP server if configured
            ...(env.TEST_MCP_SSE_URL
              ? [
                  {
                    id: 'test-sse-server',
                    type: 'remote' as const,
                    url: env.TEST_MCP_SSE_URL,
                    transport: 'sse' as const,
                    auth: env.TEST_MCP_API_KEY
                      ? {
                          type: 'bearer' as const,
                          token: env.TEST_MCP_API_KEY,
                        }
                      : undefined,
                  },
                ]
              : []),
          ],
          timeouts: {
            connectionMs: 30000,
            requestMs: 30000,
            spawnMs: 0, // Not applicable in Workers
          },
        },
      });

      // Lazy initialization - don't connect on startup
      // Connections will be established on first tool call
      // await hub.initialize();

      // Create and handle request with Hono app
      const app = createApp(hub, platform.capabilities, cacheManager);

      return app.fetch(request, env, ctx);
    } catch (error) {
      logger.error('Worker initialization failed', { error });
      return new Response(JSON.stringify({ error: 'Internal server error' }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      });
    }
  },

  /**
   * Scheduled event handler for cache warming
   */
  async scheduled(
    event: ScheduledEvent,
    env: Env,
    _ctx: ExecutionContext,
  ): Promise<void> {
    logger.info('Scheduled event triggered', { cron: event.cron });

    // Initialize cache manager for warming
    const kvStorage = new WorkersKVStorage({
      configNamespace: env.HATAGO_CONFIG,
      sessionNamespace: env.HATAGO_SESSIONS,
    });
    const cacheManager = initGlobalCache(kvStorage);

    try {
      // Create platform
      const platform = await createWorkersPlatform({
        kvNamespaces: {
          config: env.HATAGO_CONFIG,
          sessions: env.HATAGO_SESSIONS,
        },
        logger: {
          level: 'info',
        },
      });

      // Create McpHub
      const hub = new McpHub({
        platform,
        config: {
          servers: [
            {
              id: 'deepwiki-mcp',
              type: 'remote' as const,
              url: 'https://mcp.deepwiki.com/mcp',
              transport: 'http' as const,
            },
          ],
          timeouts: {
            connectionMs: 10000, // Shorter timeout for cron
            requestMs: 10000,
            spawnMs: 0,
          },
        },
      });

      // Initialize and warm the tools cache
      await hub.initialize();

      // Fetch and cache tools
      const toolsResponse = await hub.handleRequest('_hub', {
        jsonrpc: '2.0',
        method: 'tools/list',
        id: 'cron-warm',
      });

      if (toolsResponse.result?.tools) {
        await cacheManager.set('tools:all', toolsResponse.result.tools, {
          memoryTtl: 5 * 60 * 1000, // 5 minutes
          kvTtl: 60 * 60, // 1 hour
        });

        logger.info('Cache warmed successfully', {
          toolCount: toolsResponse.result.tools.length,
        });
      }
    } catch (error) {
      logger.error('Cache warming failed', { error });
    }
  },
};
