/**
 * Hub Adapter for Cloudflare Workers
 * 
 * Adapts the @hatago/hub package to work with Workers-specific
 * implementations (KV, Durable Objects, Service Bindings).
 */

import type { Env } from './types.js';
import { loadConfig, type HubConfig } from './config.js';

/**
 * Minimal hub adapter for Workers environment
 * This is a simplified implementation that demonstrates the concept.
 * The full implementation would integrate with @hatago/hub package.
 */
export async function createHubAdapter(env: Env, sessionDO: any) {
  const config = await loadConfig(env.CONFIG_KV);
  
  return {
    /**
     * Handle JSON-RPC requests
     */
    async handleJsonRpcRequest(body: any, sessionId: string) {
      const { method, params, id } = body;
      
      try {
        switch (method) {
          case 'initialize':
            return {
              jsonrpc: '2.0',
              id,
              result: {
                protocolVersion: '2025-06-18',
                capabilities: {
                  tools: {},
                  resources: {},
                  prompts: {},
                },
                serverInfo: {
                  name: 'hatago-hub-workers',
                  version: env.HUB_VERSION || '0.1.0',
                  runtime: 'cloudflare-workers',
                },
              },
            };
          
          case 'tools/list':
            return {
              jsonrpc: '2.0',
              id,
              result: {
                tools: await this.listTools(config),
              },
            };
          
          case 'tools/call':
            return {
              jsonrpc: '2.0',
              id,
              result: await this.callTool(params, env, sessionDO),
            };
          
          case 'resources/list':
            return {
              jsonrpc: '2.0',
              id,
              result: {
                resources: await this.listResources(config),
              },
            };
          
          case 'resources/read':
            return {
              jsonrpc: '2.0',
              id,
              result: await this.readResource(params, env),
            };
          
          default:
            return {
              jsonrpc: '2.0',
              id,
              error: {
                code: -32601,
                message: 'Method not found',
              },
            };
        }
      } catch (error) {
        return {
          jsonrpc: '2.0',
          id,
          error: {
            code: -32603,
            message: 'Internal error',
            data: error instanceof Error ? error.message : String(error),
          },
        };
      }
    },
    
    /**
     * List available tools from configured MCP servers
     */
    async listTools(config: HubConfig) {
      const tools = [];
      
      // Iterate through configured servers
      for (const [serverId, serverConfig] of Object.entries(config.mcpServers)) {
        try {
          // Use connector service if available
          if (env.CONNECTOR_HTTP) {
            const response = await env.CONNECTOR_HTTP.fetch(
              new Request('https://connector/call', {
                method: 'POST',
                body: JSON.stringify({
                  serverId,
                  method: 'tools/list',
                }),
              })
            );
            
            if (response.ok) {
              const result = await response.json();
              if (result.result?.tools) {
                // Add server prefix to tool names
                const namespacedTools = result.result.tools.map((tool: any) => ({
                  ...tool,
                  name: `${serverId}_${tool.name}`,
                  serverId,
                }));
                tools.push(...namespacedTools);
              }
            }
          } else {
            // Direct fetch without connector (subject to 6 connection limit)
            const response = await fetch(new URL('/mcp', serverConfig.url), {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                ...serverConfig.headers,
              },
              body: JSON.stringify({
                jsonrpc: '2.0',
                id: 1,
                method: 'tools/list',
              }),
            });
            
            if (response.ok) {
              const result = await response.json();
              if (result.result?.tools) {
                const namespacedTools = result.result.tools.map((tool: any) => ({
                  ...tool,
                  name: `${serverId}_${tool.name}`,
                  serverId,
                }));
                tools.push(...namespacedTools);
              }
            }
          }
        } catch (error) {
          console.error(`Failed to list tools from ${serverId}:`, error);
        }
      }
      
      return tools;
    },
    
    /**
     * Call a tool on the appropriate MCP server
     */
    async callTool(params: any, env: Env, sessionDO: any) {
      const { name, arguments: args } = params;
      const progressToken = params._meta?.progressToken;
      
      // Parse tool name to find server
      const [serverId, ...toolNameParts] = name.split('_');
      const toolName = toolNameParts.join('_');
      
      // Get server config
      const config = await loadConfig(env.CONFIG_KV);
      const serverConfig = config.mcpServers[serverId];
      
      if (!serverConfig) {
        throw new Error(`Server not found: ${serverId}`);
      }
      
      // Register progress token with session DO if present
      if (progressToken) {
        await sessionDO.fetch(
          new Request('https://do/progress', {
            method: 'POST',
            body: JSON.stringify({
              token: progressToken,
              serverId,
            }),
          })
        );
      }
      
      // Call tool through connector or directly
      let response: Response;
      
      if (env.CONNECTOR_HTTP) {
        response = await env.CONNECTOR_HTTP.fetch(
          new Request('https://connector/call', {
            method: 'POST',
            body: JSON.stringify({
              serverId,
              method: 'tools/call',
              params: {
                name: toolName,
                arguments: args,
                _meta: params._meta,
              },
              progressToken,
            }),
          })
        );
      } else {
        response = await fetch(new URL('/mcp', serverConfig.url), {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...serverConfig.headers,
          },
          body: JSON.stringify({
            jsonrpc: '2.0',
            id: crypto.randomUUID(),
            method: 'tools/call',
            params: {
              name: toolName,
              arguments: args,
              _meta: params._meta,
            },
          }),
        });
      }
      
      if (!response.ok) {
        throw new Error(`Tool call failed: ${response.status}`);
      }
      
      const result = await response.json();
      
      if (result.error) {
        throw new Error(result.error.message);
      }
      
      return result.result;
    },
    
    /**
     * List available resources
     */
    async listResources(config: HubConfig) {
      const resources = [];
      
      for (const [serverId, serverConfig] of Object.entries(config.mcpServers)) {
        try {
          const response = await fetch(new URL('/mcp', serverConfig.url), {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              ...serverConfig.headers,
            },
            body: JSON.stringify({
              jsonrpc: '2.0',
              id: 1,
              method: 'resources/list',
            }),
          });
          
          if (response.ok) {
            const result = await response.json();
            if (result.result?.resources) {
              const namespacedResources = result.result.resources.map((resource: any) => ({
                ...resource,
                uri: `${serverId}:${resource.uri}`,
                serverId,
              }));
              resources.push(...namespacedResources);
            }
          }
        } catch (error) {
          console.error(`Failed to list resources from ${serverId}:`, error);
        }
      }
      
      return resources;
    },
    
    /**
     * Read a resource
     */
    async readResource(params: any, env: Env) {
      const { uri } = params;
      
      // Parse URI to find server
      const [serverId, ...uriParts] = uri.split(':');
      const resourceUri = uriParts.join(':');
      
      // Get server config
      const config = await loadConfig(env.CONFIG_KV);
      const serverConfig = config.mcpServers[serverId];
      
      if (!serverConfig) {
        throw new Error(`Server not found: ${serverId}`);
      }
      
      // Read resource from server
      const response = await fetch(new URL('/mcp', serverConfig.url), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...serverConfig.headers,
        },
        body: JSON.stringify({
          jsonrpc: '2.0',
          id: crypto.randomUUID(),
          method: 'resources/read',
          params: { uri: resourceUri },
        }),
      });
      
      if (!response.ok) {
        throw new Error(`Resource read failed: ${response.status}`);
      }
      
      const result = await response.json();
      
      if (result.error) {
        throw new Error(result.error.message);
      }
      
      return result.result;
    },
  };
}