/**
 * RPC dispatch table [SF][CA]
 * Maps method name to handler function for readability and maintainability.
 */
import type { HatagoHub } from '../hub.js';
import type { RpcMethod } from '@himorishige/hatago-core';
import { RPC_METHOD } from '@himorishige/hatago-core';

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

export const RPC_DISPATCH = {
  [RPC_METHOD.initialize]: (hub, params, id, sessionId) =>
    handleInitialize(hub, params, id, sessionId),
  [RPC_METHOD.tools_list]: (hub, _params, id) => handleToolsList(hub, id),
  [RPC_METHOD.tools_call]: (hub, params, id, sessionId) =>
    handleToolsCall(hub, params, id, sessionId),
  [RPC_METHOD.resources_list]: (hub, _params, id) => handleResourcesList(hub, id),
  [RPC_METHOD.resources_read]: (hub, params, id) => handleResourcesRead(hub, params, id),
  [RPC_METHOD.resources_templates_list]: (hub, _params, id) =>
    handleResourcesTemplatesList(hub, id),
  [RPC_METHOD.prompts_list]: (hub, _params, id) => handlePromptsList(hub, id),
  [RPC_METHOD.prompts_get]: (hub, params, id) => handlePromptsGet(hub, params, id),
  [RPC_METHOD.ping]: (_hub, _params, id) => handlePing(id),
  [RPC_METHOD.sampling_createMessage]: (_hub, _params, id) => ({
    jsonrpc: '2.0' as const,
    id,
    error: { code: -32601, message: 'Method not supported by hub' }
  })
} as const satisfies Record<RpcMethod, RpcHandler>;

// Type guard for dynamic method strings
export function isRpcMethod(method: string): method is RpcMethod {
  return Object.prototype.hasOwnProperty.call(RPC_DISPATCH, method);
}
