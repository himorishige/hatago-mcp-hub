/**
 * RPC dispatch table [SF][CA]
 * Maps method name to handler function for readability and maintainability.
 */
import type { HatagoHub } from '../hub.js';
import type { RpcMethod } from '@himorishige/hatago-core';

import {
  handleInitialize,
  handlePing,
  handlePromptsGet,
  handlePromptsList,
  handleResourcesList,
  handleResourcesRead,
  handleResourcesTemplatesList,
  handleToolsCall,
  handleToolsList
} from './handlers.js';

export type RpcHandler = (
  hub: HatagoHub,
  params: Record<string, unknown> | undefined,
  id: string | number | null,
  sessionId?: string
) => Promise<unknown> | unknown;

// Strongly-typed method set for compile-time coverage [ISA]
type RpcHandlerMap = { [K in RpcMethod]: RpcHandler };

export const RPC_DISPATCH: RpcHandlerMap = {
  initialize: (hub, params, id, sessionId) => handleInitialize(hub, params, id, sessionId),
  'tools/list': (hub, _params, id) => handleToolsList(hub, id),
  'tools/call': (hub, params, id, sessionId) => handleToolsCall(hub, params, id, sessionId),
  'resources/list': (hub, _params, id) => handleResourcesList(hub, id),
  'resources/read': (hub, params, id) => handleResourcesRead(hub, params, id),
  'resources/templates/list': (hub, _params, id) => handleResourcesTemplatesList(hub, id),
  'prompts/list': (hub, _params, id) => handlePromptsList(hub, id),
  'prompts/get': (hub, params, id) => handlePromptsGet(hub, params, id),
  ping: (_hub, _params, id) => handlePing(id),
  'sampling/createMessage': (_hub, _params, id) => ({
    jsonrpc: '2.0' as const,
    id,
    error: { code: -32601, message: 'Method not supported by hub' }
  })
};

// Type guard for dynamic method strings
export function isRpcMethod(method: string): method is RpcMethod {
  return Object.prototype.hasOwnProperty.call(RPC_DISPATCH, method);
}
