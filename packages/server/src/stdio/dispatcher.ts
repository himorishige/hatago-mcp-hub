import type { Logger } from '../logger.js';
import {
  HATAGO_PROTOCOL_VERSION,
  HATAGO_SERVER_INFO,
  RPC_NOTIFICATION as CORE_RPC_NOTIFICATION
} from '@himorishige/hatago-core';

// Fallback for local dev when core export isn't built yet. [REH][SF]
const FALLBACK_RPC_NOTIFICATION = {
  initialized: 'notifications/initialized',
  cancelled: 'notifications/cancelled',
  progress: 'notifications/progress',
  tools_list_changed: 'notifications/tools/list_changed'
} as const;
const RPC_NOTIFICATION = CORE_RPC_NOTIFICATION ?? FALLBACK_RPC_NOTIFICATION;

/**
 * JSON-RPC message dispatcher.
 * Direct extraction of original processMessage without behavioral changes. [PEC]
 */
export async function processMessage(
  hub: unknown,
  message: Record<string, unknown>,
  logger: Logger
): Promise<unknown> {
  const { method, params, id } = message;
  void params; // Reserved for future compatibility

  try {
    switch (method) {
      case 'initialize':
        return {
          jsonrpc: '2.0',
          id: id as string | number | null,
          result: {
            protocolVersion: HATAGO_PROTOCOL_VERSION,
            capabilities: { tools: {}, resources: {}, prompts: {} },
            serverInfo: { ...HATAGO_SERVER_INFO }
          }
        };

      case RPC_NOTIFICATION.initialized:
      case RPC_NOTIFICATION.cancelled:
      case RPC_NOTIFICATION.progress:
        // Notifications don't require a response
        return null;

      case 'tools/list':
      case 'tools/call':
      case 'resources/list':
      case 'resources/read':
      case 'resources/templates/list':
      case 'prompts/list':
      case 'prompts/get':
        return await (
          hub as { handleJsonRpcRequest: (b: unknown) => Promise<unknown> }
        ).handleJsonRpcRequest(message);

      default:
        if (id === undefined) {
          logger.debug(`Unknown notification: ${String(method)}`);
          return null;
        }
        return {
          jsonrpc: '2.0',
          id: id as string | number | null,
          error: { code: -32601, message: 'Method not found', data: { method } }
        };
    }
  } catch (error) {
    return {
      jsonrpc: '2.0',
      id: id as string | number | null,
      error: {
        code: -32603,
        message: 'Internal error',
        data: error instanceof Error ? error.message : String(error)
      }
    };
  }
}
