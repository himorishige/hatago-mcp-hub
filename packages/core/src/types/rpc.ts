/**
 * RPC method literals shared across Hatago components.
 * Keep this list in sync with server/client supported methods. [DRY]
 */
export type RpcMethod =
  | 'initialize'
  | 'tools/list'
  | 'tools/call'
  | 'resources/list'
  | 'resources/read'
  | 'resources/templates/list'
  | 'prompts/list'
  | 'prompts/get'
  | 'ping'
  | 'sampling/createMessage';
