import type { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { createHatagoError, toError } from '../errors.js';
import type { PromptRegistry } from '@himorishige/hatago-runtime';
import type { ConnectedServer, ListOptions } from '../types.js';
import { parseQualifiedName } from '../utils/naming.js';

type Emit = (event: string, data: unknown) => void;

export type PromptsHub = {
  servers: Map<string, ConnectedServer>;
  clients: Map<string, Client>;
  promptRegistry: PromptRegistry;
  options: { separator: string };
  emit: Emit;
};

export function listPrompts(hub: PromptsHub, options?: ListOptions) {
  if (options?.serverId) {
    const server = hub.servers.get(options.serverId);
    return server?.prompts ?? [];
  }
  return hub.promptRegistry.getAllPrompts();
}

export async function getPrompt(hub: PromptsHub, name: string, args?: unknown) {
  const parsed = parseQualifiedName(name, hub.options.separator);
  const serverId = parsed.serverId;
  const promptName = parsed.name;

  if (serverId) {
    const client = hub.clients.get(serverId);
    if (client) {
      const result = await client.getPrompt({
        name: promptName,
        arguments: args as { [x: string]: string } | undefined
      });
      hub.emit('prompt:got', { name, args, result });
      return result;
    }
  }

  const prompt = hub.promptRegistry.getPrompt(name);
  if (prompt) {
    return {
      description: prompt.description,
      arguments: prompt.arguments,
      messages: []
    };
  }
  throw toError(createHatagoError('internal', `Prompt not found: ${name}`));
}
