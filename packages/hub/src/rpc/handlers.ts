/**
 * JSON-RPC handlers (partial extraction) [SF][CA]
 */
import type { HatagoHub } from '../hub.js';
import {
  HATAGO_PROTOCOL_VERSION,
  HATAGO_SERVER_INFO,
  RPC_NOTIFICATION,
  RPC_METHOD
} from '@himorishige/hatago-core';
import type { LogData } from '@himorishige/hatago-core';
// HubCtx への危険なキャストをやめ、HatagoHub の公開API/補助メソッドでアクセスする。

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
  hub.setClientCapabilities(
    sessionId ?? 'default',
    (params?.capabilities as Record<string, unknown>) ?? {}
  );

  return {
    jsonrpc: '2.0',
    id: id as string | number,
    result: {
      protocolVersion: HATAGO_PROTOCOL_VERSION,
      capabilities: { tools: {}, resources: {}, prompts: {} },
      serverInfo: HATAGO_SERVER_INFO
    }
  };
}

export async function handleToolsList(
  hub: HatagoHub,
  id: string | number | null
): Promise<JSONRPCResponse> {
  const hash = await hub.getOrComputeToolsetHash();
  return {
    jsonrpc: '2.0',
    id: id as string | number,
    result: {
      tools: hub.tools.list(),
      _meta: { toolset_hash: hash, revision: hub.getToolsetRevision() }
    }
  };
}

export async function handleToolsCall(
  hub: HatagoHub,
  params: Record<string, unknown> | undefined,
  id: string | number | null,
  sessionId?: string
): Promise<JSONRPCResponse> {
  const logger = hub.getLogger();
  const streamableTransport = hub.getStreamableTransport();
  const sseManager = hub.getSSEManager?.();
  const onNotification = hub.onNotification;

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
  if (toolName) {
    const { parseQualifiedName } = await import('../utils/naming.js');
    const parsed = parseQualifiedName(toolName, hub.getSeparator());
    serverId = parsed.serverId;
    toolName = parsed.name;
  }

  try {
    // Use direct client path whenever we know the server and a progressToken is present.
    // This ensures onprogress forwarding works in both STDIO and HTTP modes. [REH][SF]
    if (serverId && progressToken) {
      const client = hub.getClient(serverId);
      if (client) {
        const upstreamToken = `upstream-${Date.now()}`;
        const rawArgs = (params as { arguments?: unknown })?.arguments;
        const safeArgs =
          rawArgs && typeof rawArgs === 'object' && !Array.isArray(rawArgs)
            ? (rawArgs as Record<string, unknown>)
            : undefined;
        const result = await client.callTool(
          {
            name: toolName,
            arguments: safeArgs,
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
                  method: RPC_NOTIFICATION.progress,
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
                  progressToken,
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
    const result = await hub.tools.call(
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
  return { jsonrpc: '2.0', id: id as string | number, result: { prompts: hub.prompts.list() } };
}

export async function handlePromptsGet(
  hub: HatagoHub,
  params: Record<string, unknown> | undefined,
  id: string | number | null
): Promise<JSONRPCResponse> {
  const prompt = await hub.prompts.get(
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
  const logger = hub.getLogger();
  const separator = hub.getSeparator();
  const { buildQualifiedName } = await import('../utils/naming.js');

  const allTemplates: unknown[] = [];

  const servers = hub.getServers();
  for (const s of servers) {
    const serverId = s.id;
    const client = hub.getClient(serverId);
    try {
      if (!client) continue;

      // 型を固定せずに結果を受け取り、必要最小のプロパティだけ読む。[REH]
      const templatesResult = await client.request(
        { method: RPC_METHOD.resources_templates_list, params: {} },
        // schema は型検証無し（SDK 側の互換性に委ねる）
        undefined as never
      );
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
        allTemplates.push(...namespacedTemplates);
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
  const resources = hub.resources.list();
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
  const resource = await hub.resources.read(
    (params as { uri?: string } | undefined)?.uri as string
  );
  return {
    jsonrpc: '2.0',
    id: id as string | number,
    result: resource
  };
}
