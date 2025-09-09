import type { ToolInvoker } from '@himorishige/hatago-runtime';
import type { ConnectedServer, ListOptions, CallOptions } from '../types.js';
import { buildPublicToolName, parseQualifiedName } from '../utils/naming.js';

export type ToolsHub = {
  servers: Map<string, ConnectedServer>;
  toolInvoker: ToolInvoker;
  options: {
    defaultTimeout: number;
    namingStrategy: 'none' | 'namespace' | 'prefix';
    separator: string;
  };
  emit: (event: string, data: unknown) => void;
};

export function listTools(hub: ToolsHub, options?: ListOptions) {
  if (options?.serverId) {
    const server = hub.servers.get(options.serverId);
    return server?.tools ?? [];
  }
  return hub.toolInvoker.listTools();
}

export async function callTool(
  hub: ToolsHub,
  name: string,
  args: unknown,
  options?: CallOptions & { progressToken?: string; progressCallback?: unknown }
) {
  const parsed = parseQualifiedName(name, hub.options.separator);
  const serverId = options?.serverId ?? parsed.serverId;
  const toolName = parsed.name;
  const publicName = buildPublicToolName(
    serverId,
    toolName,
    hub.options.namingStrategy,
    hub.options.separator
  );

  try {
    const result = await hub.toolInvoker.callTool('default', publicName, args, {
      timeout: options?.timeout ?? hub.options.defaultTimeout,
      progressToken: options?.progressToken
    });

    hub.emit('tool:called', { name, serverId, publicName, result });
    return result;
  } catch (error) {
    const payload = {
      name,
      serverId,
      publicName,
      // エラー詳細は安全な範囲に限定して送る [REH]
      error:
        error instanceof Error
          ? { name: error.name, message: error.message }
          : { message: String(error) }
    } as const;
    try {
      hub.emit('tool:error', payload);
    } catch {
      // emit 側の失敗は握りつぶして本来のエラーを優先 [REH]
    }
    throw error;
  }
}
