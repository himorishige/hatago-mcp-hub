/**
 * JSON-RPC handlers (partial extraction) [SF][CA]
 */
import type { HatagoHub } from '../hub.js';
import {
  HATAGO_PROTOCOL_VERSION,
  HATAGO_SERVER_INFO,
  RPC_METHOD as CORE_RPC_METHOD
} from '@himorishige/hatago-core';

const FALLBACK_RPC_METHOD = {
  initialize: 'initialize',
  tools_list: 'tools/list',
  tools_call: 'tools/call',
  resources_list: 'resources/list',
  resources_read: 'resources/read',
  resources_templates_list: 'resources/templates/list',
  prompts_list: 'prompts/list',
  prompts_get: 'prompts/get',
  ping: 'ping',
  sampling_createMessage: 'sampling/createMessage'
} as const;
const RPC_METHOD = CORE_RPC_METHOD ?? FALLBACK_RPC_METHOD;
import type { LogData } from '@himorishige/hatago-core';
import type { Logger } from '../logger.js';
type HubCtx = {
  logger: Logger;
  capabilityRegistry: {
    setClientCapabilities: (sessionId: string, caps: Record<string, unknown>) => void;
  };
  toolsetHash: string;
  toolsetRevision: number;
  calculateToolsetHash: () => Promise<string>;
  tools: {
    list: () => unknown[];
    call: (
      name: string,
      args: unknown,
      opts: { progressToken?: string; sessionId?: string }
    ) => Promise<unknown>;
  };
  prompts: { list: () => unknown[]; get: (name: string, args?: unknown) => Promise<unknown> };
  clients: Map<
    string,
    {
      callTool: (
        req: unknown,
        _schema: undefined,
        opts: { onprogress: (p: { progress?: number; total?: number; message?: string }) => void }
      ) => Promise<unknown>;
      request: (req: unknown, schema: unknown) => Promise<unknown>;
    }
  >;
  options: { separator: string; defaultTimeout: number };
  sseManager?: {
    registerProgressToken: (token: string, sessionId: string) => void;
    unregisterProgressToken: (token: string) => void;
    sendProgress: (
      token: string,
      p: { progressToken: string; progress: number; total?: number; message?: string }
    ) => void;
  };
  streamableTransport?: {
    send: (m: unknown) => Promise<void>;
    sendProgressNotification?: (
      token: string | number,
      progress: number,
      total?: number,
      message?: string
    ) => Promise<void>;
  };
  onNotification?: (n: unknown) => Promise<void>;
};

type JSONRPCResponse = {
  jsonrpc: '2.0';
  id: string | number | null;
  result?: unknown;
  error?: { code: number; message: string; data?: unknown };
};

export function handleInitialize(
  hub: HatagoHub,
  params: Record<string, unknown> | undefined,
  id: string | number | null,
  sessionId?: string
): JSONRPCResponse {
  const h = hub as unknown as HubCtx;
  h.capabilityRegistry.setClientCapabilities(
    sessionId ?? 'default',
    (params?.capabilities as Record<string, unknown>) ?? {}
  );

  const instructions = hub.instructions;

  return {
    jsonrpc: '2.0',
    id: id as string | number,
    result: {
      protocolVersion: HATAGO_PROTOCOL_VERSION,
      capabilities: { tools: {}, resources: {}, prompts: {} },
      serverInfo: HATAGO_SERVER_INFO,
      ...(instructions ? { instructions } : {})
    }
  };
}

export async function handleToolsList(
  hub: HatagoHub,
  id: string | number | null
): Promise<JSONRPCResponse> {
  const h = hub as unknown as HubCtx;
  if (!h.toolsetHash) {
    h.toolsetHash = await h.calculateToolsetHash();
  }
  return {
    jsonrpc: '2.0',
    id: id as string | number,
    result: {
      tools: h.tools.list(),
      _meta: { toolset_hash: h.toolsetHash, revision: h.toolsetRevision }
    }
  };
}

export async function handleToolsCall(
  hub: HatagoHub,
  params: Record<string, unknown> | undefined,
  id: string | number | null,
  sessionId?: string
): Promise<JSONRPCResponse> {
  const h = hub as unknown as HubCtx;
  const { logger, streamableTransport, sseManager } = h;

  const progressToken = (params as { _meta?: { progressToken?: string | number } })?._meta
    ?.progressToken;
  logger.info(`[Hub] tools/call request`, {
    toolName: (params as { name?: string })?.name,
    progressToken,
    hasTransport: !!streamableTransport,
    sessionId
  } as LogData);

  let tokenRegistered = false;
  if (progressToken && sessionId && sseManager) {
    logger.info(`[Hub] Registering progress token`, { progressToken, sessionId } as LogData);
    sseManager.registerProgressToken(progressToken.toString(), sessionId);
    tokenRegistered = true;
  }

  try {
    // Always go through the invoker path: it resolves renamed/overridden tool
    // names back to the upstream original name before calling the client, and
    // already forwards progress via hub.onNotification regardless of transport. [SF]
    const result = await h.tools.call(
      (params as { name?: string; arguments?: unknown } | undefined)?.name as string,
      (params as { arguments?: unknown } | undefined)?.arguments,
      {
        progressToken: progressToken as string | undefined,
        sessionId
      }
    );
    return { jsonrpc: '2.0', id: id as string | number, result };
  } finally {
    if (tokenRegistered && sseManager && progressToken) {
      sseManager.unregisterProgressToken(String(progressToken));
    }
  }
}

export function handlePromptsList(hub: HatagoHub, id: string | number | null): JSONRPCResponse {
  const h = hub as unknown as HubCtx;
  return { jsonrpc: '2.0', id: id as string | number, result: { prompts: h.prompts.list() } };
}

export async function handlePromptsGet(
  hub: HatagoHub,
  params: Record<string, unknown> | undefined,
  id: string | number | null
): Promise<JSONRPCResponse> {
  const h = hub as unknown as HubCtx;
  const prompt = await h.prompts.get(
    params?.name as string,
    (params as { arguments?: unknown } | undefined)?.arguments
  );
  return { jsonrpc: '2.0', id: id as string | number, result: prompt };
}

export function handlePing(id: string | number | null): JSONRPCResponse {
  return { jsonrpc: '2.0', id: id as string | number, result: {} };
}

export async function handleResourcesTemplatesList(
  hub: HatagoHub,
  id: string | number | null
): Promise<JSONRPCResponse> {
  const h = hub as unknown as HubCtx;
  const logger = h.logger;
  const clients = h.clients;
  const separator = h.options.separator;
  const { buildQualifiedName } = await import('../utils/naming.js');

  const allTemplates: unknown[] = [];

  for (const [serverId, client] of clients.entries()) {
    try {
      if (!client) continue;

      const templatesResult = await (
        client as unknown as {
          request: (req: unknown, schema: unknown) => Promise<unknown>;
        }
      ).request({ method: RPC_METHOD.resources_templates_list, params: {} }, {
        parse: (data: unknown) => data,
        type: 'object',
        properties: {
          resourceTemplates: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                uriTemplate: { type: 'string' },
                name: { type: 'string' },
                description: { type: 'string' },
                mimeType: { type: 'string' }
              }
            }
          }
        }
      } as unknown);

      const result = templatesResult as { resourceTemplates?: unknown[] };
      if (result?.resourceTemplates) {
        const namespacedTemplates = result.resourceTemplates.map((template: unknown) => {
          const t = template as { name?: string };
          return {
            ...(template as Record<string, unknown>),
            name: t.name ? buildQualifiedName(serverId, t.name, separator) : undefined,
            serverId
          };
        });
        allTemplates.push(...(namespacedTemplates as unknown[]));
      }
    } catch (error) {
      logger.debug(`Server ${serverId} doesn't support resource templates (expected)`, {
        error: error instanceof Error ? error.message : String(error)
      });
    }
  }

  return {
    jsonrpc: '2.0',
    id: id as string | number,
    result: { resourceTemplates: allTemplates }
  };
}

export function handleResourcesList(hub: HatagoHub, id: string | number | null): JSONRPCResponse {
  const resources = (hub as unknown as { resources: { list: () => unknown[] } }).resources.list();
  return {
    jsonrpc: '2.0',
    id: id as string | number,
    result: { resources }
  };
}

export async function handleResourcesRead(
  hub: HatagoHub,
  params: Record<string, unknown> | undefined,
  id: string | number | null
): Promise<JSONRPCResponse> {
  const resource = await (
    hub as unknown as { resources: { read: (uri: string) => Promise<unknown> } }
  ).resources.read((params as { uri?: string } | undefined)?.uri as string);
  return {
    jsonrpc: '2.0',
    id: id as string | number,
    result: resource
  };
}
