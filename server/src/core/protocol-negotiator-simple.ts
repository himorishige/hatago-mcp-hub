/**
 * Simplified MCP Protocol Version Negotiator
 * Uses modular protocol management for cleaner separation of concerns
 */

import type { Transport } from '@modelcontextprotocol/sdk/shared/transport.js';
import type { JSONRPCMessage } from '@modelcontextprotocol/sdk/types.js';
import { ErrorHelpers } from '../utils/errors.js';
import {
  adaptRequest,
  adaptResponse,
  detectFeatures,
  isSupported,
  type ProtocolFeatures,
  type ServerCapabilities,
  SUPPORTED_PROTOCOLS,
  type SupportedProtocol,
} from './protocol/index.js';

/**
 * Protocol negotiation result
 */
export interface NegotiatedProtocol {
  protocol: SupportedProtocol;
  serverInfo?: {
    name: string;
    version: string;
  };
  features: ProtocolFeatures;
  capabilities?: Record<string, unknown>;
}

/**
 * Initialize parameters for protocol negotiation
 */
export interface InitializeParams {
  protocolVersion: string;
  capabilities: {
    tools?: Record<string, unknown>;
    resources?: Record<string, unknown>;
    prompts?: Record<string, unknown>;
    [key: string]: unknown;
  };
  clientInfo: {
    name: string;
    version: string;
  };
}

/**
 * Initialize result from server
 */
export interface InitializeResult {
  protocolVersion: string;
  capabilities: Record<string, unknown>;
  serverInfo?: {
    name: string;
    version: string;
  };
}

/**
 * Simplified Protocol Negotiator
 */
export class SimplifiedProtocolNegotiator {
  private negotiatedProtocol: NegotiatedProtocol | null = null;

  /**
   * Negotiate protocol version with a transport
   */
  async negotiate(
    transport: Transport,
    clientInfo: { name: string; version: string },
  ): Promise<NegotiatedProtocol> {
    console.log('[Negotiator] Starting protocol negotiation');

    // Try each supported protocol in priority order
    for (const protocol of SUPPORTED_PROTOCOLS) {
      console.log(`[Negotiator] Trying protocol version: ${protocol}`);

      try {
        const result = await this.tryProtocol(transport, protocol, clientInfo);
        if (result) {
          this.negotiatedProtocol = result;
          console.log(
            `[Negotiator] Successfully negotiated protocol: ${protocol}`,
          );
          return result;
        }
      } catch (error) {
        console.log(
          `[Negotiator] Protocol ${protocol} failed: ${error instanceof Error ? error.message : String(error)}`,
        );
      }
    }

    throw ErrorHelpers.protocolNegotiationFailed(SUPPORTED_PROTOCOLS);
  }

  /**
   * Try to negotiate a specific protocol version
   */
  private async tryProtocol(
    transport: Transport,
    protocol: SupportedProtocol,
    clientInfo: { name: string; version: string },
  ): Promise<NegotiatedProtocol | null> {
    const initParams: InitializeParams = {
      protocolVersion: protocol,
      capabilities: {},
      clientInfo,
    };

    // Send initialize request
    const request: JSONRPCMessage = {
      jsonrpc: '2.0',
      method: 'initialize',
      params: initParams,
      id: `init-${protocol}`,
    };

    await transport.send(request);

    // Wait for response
    const response = await this.waitForResponse(
      transport,
      request.id as string,
      5000,
    );

    if ('error' in response) {
      console.log(
        `[Negotiator] Server rejected ${protocol}: ${JSON.stringify(response.error)}`,
      );
      return null;
    }

    if (!('result' in response)) {
      console.log(`[Negotiator] Invalid response for ${protocol}`);
      return null;
    }

    const result = response.result as InitializeResult;

    // Verify protocol version matches
    if (result.protocolVersion !== protocol) {
      console.log(
        `[Negotiator] Protocol mismatch: expected ${protocol}, got ${result.protocolVersion}`,
      );
      return null;
    }

    // Detect features based on protocol and capabilities
    const features = detectFeatures(
      protocol,
      result.capabilities as ServerCapabilities,
    );

    return {
      protocol,
      serverInfo: result.serverInfo,
      features,
      capabilities: result.capabilities,
    };
  }

  /**
   * Wait for a specific response
   */
  private waitForResponse(
    transport: Transport,
    id: string,
    timeoutMs: number,
  ): Promise<JSONRPCMessage> {
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        cleanup();
        reject(new Error(`Timeout waiting for response to ${id}`));
      }, timeoutMs);

      const originalHandler = transport.onmessage;

      const cleanup = () => {
        clearTimeout(timeout);
        transport.onmessage = originalHandler;
      };

      transport.onmessage = (message: JSONRPCMessage) => {
        if ('id' in message && message.id === id) {
          cleanup();
          resolve(message);
        } else if (originalHandler) {
          originalHandler(message);
        }
      };
    });
  }

  /**
   * Check if a protocol version is supported
   */
  isSupported(version: string): boolean {
    return isSupported(version);
  }

  /**
   * Get the negotiated protocol
   */
  getNegotiatedProtocol(): NegotiatedProtocol | null {
    return this.negotiatedProtocol;
  }

  /**
   * Create an adapted call for the negotiated protocol
   */
  createAdaptedCall(
    method: string,
    params: unknown,
  ): { method: string; params: unknown } {
    if (!this.negotiatedProtocol) {
      return { method, params };
    }

    const message: JSONRPCMessage = {
      jsonrpc: '2.0',
      method,
      params,
    };

    const adapted = adaptRequest(
      message,
      '2025-06-18', // Assume client uses latest
      this.negotiatedProtocol.protocol,
    );

    return {
      method: adapted.method as string,
      params: adapted.params,
    };
  }

  /**
   * Adapt a response for the client
   */
  adaptResponse(method: string, response: unknown): unknown {
    if (!this.negotiatedProtocol) {
      return response;
    }

    const message: JSONRPCMessage = {
      jsonrpc: '2.0',
      result: response,
    };

    const adapted = adaptResponse(
      message,
      method,
      this.negotiatedProtocol.protocol,
      '2025-06-18', // Adapt to latest for client
    );

    return adapted.result;
  }
}

/**
 * Create a protocol negotiator instance
 */
export function createProtocolNegotiator(): SimplifiedProtocolNegotiator {
  return new SimplifiedProtocolNegotiator();
}

export type { ProtocolFeatures } from './protocol/index.js';
// Re-export commonly used types and constants
export {
  SUPPORTED_PROTOCOLS,
  type SupportedProtocol,
} from './protocol/index.js';
