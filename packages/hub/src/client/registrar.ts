import type { Client } from '@modelcontextprotocol/sdk/client/index.js';
import type { JSONRPCMessage } from '@modelcontextprotocol/sdk/types.js';
import type { Tool } from '@himorishige/hatago-core';
import { RPC_NOTIFICATION } from '@himorishige/hatago-core';
import type { Logger } from '../logger.js';
import type { ConnectedServer, HubEvent } from '../types.js';
import type { ToolRegistry } from '@himorishige/hatago-runtime';
import type { ToolInvoker } from '@himorishige/hatago-runtime';
import type { ResourceRegistry } from '@himorishige/hatago-runtime';
import type { PromptRegistry } from '@himorishige/hatago-runtime';
import type { ICapabilityRegistry } from '../capability-registry.js';

type RegistrarHub = {
  logger: Logger;
  servers: Map<string, ConnectedServer>;
  emit: (event: HubEvent, data: unknown) => void;
  toolRegistry: ToolRegistry;
  toolInvoker: ToolInvoker;
  resourceRegistry: ResourceRegistry;
  promptRegistry: PromptRegistry;
  capabilityRegistry: ICapabilityRegistry;
  onNotification?: (n: JSONRPCMessage) => Promise<void>;
};

export async function registerServerTools(
  hub: RegistrarHub,
  client: Client,
  serverId: string,
  requestTimeoutMs: number
): Promise<void> {
  try {
    const toolsResult = await client.listTools();
    const toolArray = toolsResult.tools ?? [];

    hub.logger.debug(`[Hub] Registering ${toolArray.length} tools from ${serverId}`, {
      toolNames: toolArray.map((t) => t.name)
    });

    const toolsWithHandlers = toolArray.map((tool) => ({
      ...tool,
      handler: async (
        args: unknown,
        progressCallback?: (progress: number) => void
      ): Promise<unknown> => {
        const toolCall = client.callTool(
          {
            name: tool.name,
            arguments: args as { [x: string]: unknown } | undefined
          },
          undefined,
          {
            onprogress: (progress: {
              progressToken?: string;
              progress?: number;
              total?: number;
              message?: string;
            }) => {
              hub.logger.debug(`[Hub] Tool progress from ${serverId}/${tool.name}`, progress);

              const notification = {
                jsonrpc: '2.0' as const,
                method: RPC_NOTIFICATION.progress,
                params: {
                  progressToken: progress.progressToken ?? `${serverId}-${tool.name}-${Date.now()}`,
                  progress: progress.progress ?? 0,
                  total: progress.total,
                  message: progress.message
                }
              } satisfies JSONRPCMessage;

              if (progressCallback && typeof progress.progress === 'number') {
                void progressCallback(progress.progress);
              }
              if (hub.onNotification) {
                void hub.onNotification(notification);
              }
            }
          }
        );

        // Timeout guard
        let timer: ReturnType<typeof setTimeout> | undefined;
        const timeoutPromise = new Promise((_, reject) => {
          timer = setTimeout(
            () => reject(new Error(`Tool call timed out after ${requestTimeoutMs}ms`)),
            requestTimeoutMs
          );
        });
        try {
          const result = await Promise.race([toolCall, timeoutPromise]);
          return result;
        } finally {
          if (timer) clearTimeout(timer);
        }
      }
    }));

    hub.toolRegistry.registerServerTools(serverId, toolsWithHandlers as unknown as Tool[]);
    const registeredTools = hub.toolRegistry.getServerTools(serverId);

    const server = hub.servers.get(serverId);
    for (let i = 0; i < toolsWithHandlers.length; i++) {
      const registeredTool = registeredTools[i];
      const tool = toolsWithHandlers[i];
      if (!registeredTool || !tool) continue;
      if (server) server.tools.push(registeredTool);
      hub.toolInvoker.registerHandler(registeredTool.name, tool.handler);
      hub.emit('tool:registered', { serverId, tool: registeredTool });
    }
  } catch (error) {
    hub.logger.warn(`Failed to list tools for ${serverId}`, {
      error: error instanceof Error ? error.message : String(error)
    });
  }
}

export async function registerServerResources(
  hub: RegistrarHub,
  client: Client,
  serverId: string
): Promise<void> {
  try {
    const resourcesResult = await client.listResources();
    const resourceArray = resourcesResult.resources ?? [];
    hub.capabilityRegistry.markServerCapability(serverId, 'resources/list', 'supported');
    const server = hub.servers.get(serverId);
    if (server) server.resources = resourceArray;
    hub.resourceRegistry.registerServerResources(serverId, resourceArray);
    for (const resource of resourceArray) {
      hub.emit('resource:registered', { serverId, resource });
    }
  } catch (error) {
    if (error instanceof Error && error.message.includes('-32601')) {
      hub.capabilityRegistry.markServerCapability(serverId, 'resources/list', 'unsupported');
      hub.logger.debug(`Server ${serverId} does not support resources`);
    } else {
      hub.logger.warn(`Failed to list resources for ${serverId}`, {
        error: error instanceof Error ? error.message : String(error)
      });
    }
  }
}

export async function registerServerPrompts(
  hub: RegistrarHub,
  client: Client,
  serverId: string
): Promise<void> {
  try {
    const promptsResult = await client.listPrompts();
    const promptArray = promptsResult.prompts ?? [];
    hub.capabilityRegistry.markServerCapability(serverId, 'prompts/list', 'supported');
    const server = hub.servers.get(serverId);
    if (server) server.prompts = promptArray;
    hub.promptRegistry.registerServerPrompts(serverId, promptArray);
    for (const prompt of promptArray) {
      hub.emit('prompt:registered', { serverId, prompt });
    }
  } catch (error) {
    if (error instanceof Error && error.message.includes('-32601')) {
      hub.capabilityRegistry.markServerCapability(serverId, 'prompts/list', 'unsupported');
      hub.logger.debug(`Server ${serverId} does not support prompts`);
    } else {
      hub.logger.warn(`Failed to list prompts for ${serverId}`, {
        error: error instanceof Error ? error.message : String(error)
      });
    }
  }
}
