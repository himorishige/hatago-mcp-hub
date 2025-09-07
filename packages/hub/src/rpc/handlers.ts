/**
 * JSON-RPC handlers (partial extraction) [SF][CA]
 */
import type { HatagoHub } from '../hub.js';
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

  return {
    jsonrpc: '2.0',
    id: id as string | number,
    result: {
      protocolVersion: '2025-06-18',
      capabilities: { tools: {}, resources: {}, prompts: {} },
      serverInfo: { name: 'hatago-hub', version: '0.0.9' }
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
  const { logger, streamableTransport, sseManager, clients, options, onNotification } = h;

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

  let toolName = (params as { name?: string })?.name ?? '';
  let serverId: string | undefined;
  if (toolName.includes(options.separator)) {
    const parts = toolName.split(options.separator);
    serverId = parts[0];
    toolName = parts.slice(1).join(options.separator);
  }

  try {
    if (streamableTransport && serverId && progressToken) {
      const client = clients.get(serverId);
      if (client) {
        const upstreamToken = `upstream-${Date.now()}`;
        const result = await client.callTool(
          {
            name: toolName,
            arguments: (params as { arguments?: unknown })?.arguments,
            _meta: { progressToken: upstreamToken }
          },
          undefined,
          {
            onprogress: (progress: {
              progressToken?: string;
              progress?: number;
              total?: number;
              message?: string;
            }) => {
              logger.info(`[Hub] Direct client onprogress`, {
                serverId,
                toolName,
                progressToken,
                progress
              } as LogData);

              const hasStreamable = !!streamableTransport;
              const hasOnNotification = !!onNotification;

              if (!hasOnNotification && !hasStreamable) {
                logger.warn('[Hub] No notification sink configured; notifications will be dropped');
              } else if (!hasOnNotification && hasStreamable) {
                logger.debug('[Hub] Using StreamableHTTP transport for notifications (HTTP mode)');
              }

              if (hasOnNotification && onNotification) {
                const notification = {
                  jsonrpc: '2.0' as const,
                  method: 'notifications/progress',
                  params: {
                    progressToken,
                    progress: progress?.progress ?? 0,
                    total: progress?.total,
                    message: progress?.message
                  }
                };
                void onNotification(notification);
              }
              if (hasStreamable && streamableTransport) {
                void streamableTransport.sendProgressNotification?.(
                  progressToken as string | number,
                  progress?.progress ?? 0,
                  progress?.total,
                  progress?.message
                );
              }

              if (progressToken && sseManager && sessionId) {
                sseManager.sendProgress(progressToken.toString(), {
                  progressToken: progressToken.toString(),
                  progress: progress?.progress ?? 0,
                  total: progress?.total,
                  message: progress?.message
                });
              }
            }
          }
        );

        return { jsonrpc: '2.0', id: id as string | number, result };
      }
    }

    // Fallback to normal invoker path (with optional progress token passthrough)
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

  const allTemplates: unknown[] = [];

  for (const [serverId, client] of clients.entries()) {
    try {
      if (!client) continue;

      const templatesResult = await (
        client as unknown as {
          request: (req: unknown, schema: unknown) => Promise<unknown>;
        }
      ).request({ method: 'resources/templates/list', params: {} }, {
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
            name: t.name ? `${serverId}${separator}${t.name}` : undefined,
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
