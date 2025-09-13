/**
 * JSON-RPC Transport adapter for Hatago MCP Hub
 *
 * Provides JSON-RPC interface over HTTP transport
 */

import type {
  ThinHttpTransport,
  ThinHttpRequest,
  ThinTransportOptions,
  ThinJsonRpcTransport
} from './thin-facade.js';
import type {
  JSONRPCRequest,
  JSONRPCResponse,
  JSONRPCNotification
} from '@modelcontextprotocol/sdk/types.js';
import { createRelayHttpTransport } from './relay-transport.js';

/**
 * JSON-RPC adapter using thin HTTP transport
 */
export class RelayJsonRpcTransport implements ThinJsonRpcTransport {
  private httpTransport: ThinHttpTransport;
  private notificationHandlers: Array<(notification: JSONRPCNotification) => void> = [];

  constructor(httpTransport: ThinHttpTransport, _options: ThinTransportOptions = {}) {
    this.httpTransport = httpTransport;
  }

  async request(message: JSONRPCRequest): Promise<JSONRPCResponse> {
    const httpRequest: ThinHttpRequest = {
      method: 'POST',
      path: '/rpc',
      headers: {
        'content-type': 'application/json'
      },
      body: JSON.stringify(message)
    };

    const response = await this.httpTransport.send(httpRequest);

    if (!response.body) {
      throw new Error('Empty response body');
    }

    return JSON.parse(response.body) as JSONRPCResponse;
  }

  async notify(message: JSONRPCNotification): Promise<void> {
    const httpRequest: ThinHttpRequest = {
      method: 'POST',
      path: '/rpc',
      headers: {
        'content-type': 'application/json'
      },
      body: JSON.stringify(message)
    };

    await this.httpTransport.send(httpRequest);
  }

  onNotification(handler: (notification: JSONRPCNotification) => void): void {
    this.notificationHandlers.push(handler);
  }

  async close(): Promise<void> {
    await this.httpTransport.close();
  }
}

/**
 * Create Relay JSON-RPC Transport
 */
export function createRelayJsonRpcTransport(
  options: ThinTransportOptions = {}
): ThinJsonRpcTransport {
  const httpTransport = createRelayHttpTransport(options);
  return new RelayJsonRpcTransport(httpTransport, options);
}
