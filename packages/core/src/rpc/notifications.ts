/**
 * JSON-RPC notification name constants. [SF][CMV][DRY]
 */
export const RPC_NOTIFICATION = {
  initialized: 'notifications/initialized',
  cancelled: 'notifications/cancelled',
  progress: 'notifications/progress',
  tools_list_changed: 'notifications/tools/list_changed'
} as const;

export type RpcNotificationValue = (typeof RPC_NOTIFICATION)[keyof typeof RPC_NOTIFICATION];
