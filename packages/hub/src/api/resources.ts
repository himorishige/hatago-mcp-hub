import type { Client } from '@modelcontextprotocol/sdk/client/index.js';
import type { ResourceRegistry } from '@himorishige/hatago-runtime';
import type { ConnectedServer, ListOptions, ReadOptions } from '../types.js';

export type ResourcesHub = {
  servers: Map<string, ConnectedServer>;
  clients: Map<string, Client>;
  resourceRegistry: ResourceRegistry;
  emit: (event: string, data: unknown) => void;
  logger: { error: (m: string, d?: unknown) => void };
  getServers: () => ConnectedServer[];
};

export function listResources(hub: ResourcesHub, options?: ListOptions) {
  if (options?.serverId) {
    const server = hub.servers.get(options.serverId);
    return server?.resources ?? [];
  }
  return hub.resourceRegistry.getAllResources();
}

export async function readResource(hub: ResourcesHub, uri: string, options?: ReadOptions) {
  // Check for internal resource first
  if (uri === 'hatago://servers') {
    const serverList = hub.getServers().map((s) => ({
      id: s.id,
      status: s.status,
      type: s.spec?.url ? 'remote' : 'local',
      url: s.spec?.url ?? null,
      command: s.spec?.command ?? null,
      tools: s.tools?.map((t) => t.name) ?? [],
      resources: s.resources?.map((r) => r.uri) ?? [],
      prompts: s.prompts?.map((p) => p.name) ?? [],
      error: s.error?.message ?? null
    }));
    const payload = { total: serverList.length, servers: serverList };
    hub.emit('resource:read', { uri, serverId: '_internal', result: payload });
    return { contents: [{ uri, text: JSON.stringify(payload, null, 2) }] };
  }

  const resourceInfo = hub.resourceRegistry.resolveResource(uri);

  if (resourceInfo) {

    const client = hub.clients.get(resourceInfo.serverId);
    if (client) {
      try {
        const result = await client.readResource({ uri: resourceInfo.originalUri });
        hub.emit('resource:read', { uri, serverId: resourceInfo.serverId, result });
        return result;
      } catch (error) {
        hub.logger.error(`Failed to read resource ${uri}`, {
          serverId: resourceInfo.serverId,
          error: error instanceof Error ? error.message : String(error)
        });
        throw error;
      }
    }
  }

  if (options?.serverId) {
    const client = hub.clients.get(options.serverId);
    if (client) {
      try {
        const result = await client.readResource({ uri });
        hub.emit('resource:read', { uri, serverId: options.serverId, result });
        return result;
      } catch (error) {
        hub.logger.error(`Failed to read resource ${uri}`, {
          serverId: options.serverId,
          error: error instanceof Error ? error.message : String(error)
        });
        throw error;
      }
    }
  }

  throw new Error(`No server found for resource: ${uri}`);
}
