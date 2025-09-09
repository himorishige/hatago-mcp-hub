import type { RpcMethod } from '../types/rpc.js';

/**
 * RPC method name constants. Single source of truth. [SF][CMV][DRY]
 * Keep values strictly equal to RpcMethod literals.
 */
export const RPC_METHOD = {
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
} as const satisfies Record<string, RpcMethod>;

export type RpcMethodValue = (typeof RPC_METHOD)[keyof typeof RPC_METHOD];
