/**
 * MCP Protocol Version Negotiator
 *
 * Handles protocol version negotiation between different MCP versions
 * Supports both date-based (2025-06-18) and semantic (0.1.0) versions
 */

// Supported protocol versions in priority order (newest first)
export const SUPPORTED_PROTOCOLS = [
  '2025-06-18', // Latest date-based version
  '0.1.0', // Legacy semantic version
] as const;

export type SupportedProtocol = (typeof SUPPORTED_PROTOCOLS)[number];

/**
 * Protocol negotiation result with feature detection
 */
export interface NegotiatedProtocol {
  // The protocol version that was successfully negotiated
  protocol: SupportedProtocol;

  // Server information from initialization response
  serverInfo?: {
    name: string;
    version: string;
  };

  // Feature flags based on protocol version and capabilities
  features: {
    // Whether the server supports notifications
    notifications: boolean;
    // Whether empty resource lists are properly handled
    resourcesTemplatesEmptyListOk: boolean;
    // Whether the server supports progress tokens
    progressTokens: boolean;
    // Whether the server supports sampling
    sampling: boolean;
    // Additional features can be added here
  };

  // Raw capabilities from the server
  capabilities?: Record<string, unknown>;
}

/**
 * Initialize request parameters
 */
export interface InitializeParams {
  protocolVersion: string;
  capabilities: {
    experimental?: Record<string, unknown>;
    tools?: Record<string, unknown>;
    prompts?: Record<string, unknown>;
    resources?: Record<string, unknown>;
    sampling?: Record<string, unknown>;
  };
  clientInfo: {
    name: string;
    version: string;
  };
}

/**
 * Initialize response from server
 */
export interface InitializeResult {
  protocolVersion?: string;
  capabilities?: Record<string, unknown>;
  serverInfo?: {
    name: string;
    version: string;
  };
}

/**
 * Protocol Negotiator class
 */
export class ProtocolNegotiator {
  private negotiatedProtocol: NegotiatedProtocol | null = null;

  /**
   * Negotiate protocol version with the server
   * Tries each supported version in order until one succeeds
   */
  async negotiate(
    initializeFn: (protocolVersion: string) => Promise<InitializeResult>,
  ): Promise<NegotiatedProtocol> {
    const errors: Array<{ version: string; error: string }> = [];

    for (const protocolVersion of SUPPORTED_PROTOCOLS) {
      try {
        console.log(`[Negotiator] Trying protocol version: ${protocolVersion}`);

        const result = await initializeFn(protocolVersion);

        // Check if server accepted our version or returned a different one
        const acceptedVersion = result.protocolVersion || protocolVersion;

        // Verify the accepted version is one we support
        if (!this.isSupported(acceptedVersion)) {
          throw new Error(
            `Server returned unsupported protocol version: ${acceptedVersion}`,
          );
        }

        // Negotiation successful
        const negotiated: NegotiatedProtocol = {
          protocol: acceptedVersion as SupportedProtocol,
          serverInfo: result.serverInfo,
          features: this.detectFeatures(
            acceptedVersion as SupportedProtocol,
            result.capabilities,
          ),
          capabilities: result.capabilities,
        };

        console.log(
          `[Negotiator] Successfully negotiated protocol: ${acceptedVersion}`,
        );
        this.negotiatedProtocol = negotiated;
        return negotiated;
      } catch (error) {
        const errorMsg = error instanceof Error ? error.message : String(error);
        console.log(
          `[Negotiator] Protocol ${protocolVersion} failed: ${errorMsg}`,
        );
        errors.push({ version: protocolVersion, error: errorMsg });
      }
    }

    // All versions failed
    const errorDetails = errors
      .map((e) => `${e.version}: ${e.error}`)
      .join(', ');
    throw new Error(
      `Failed to negotiate protocol version. Tried: ${errorDetails}`,
    );
  }

  /**
   * Check if a protocol version is supported
   */
  isSupported(version: string): boolean {
    return SUPPORTED_PROTOCOLS.includes(version as SupportedProtocol);
  }

  /**
   * Detect features based on protocol version and capabilities
   */
  private detectFeatures(
    protocol: SupportedProtocol,
    capabilities?: Record<string, unknown>,
  ): NegotiatedProtocol['features'] {
    // Base features by protocol version
    const baseFeatures = this.getBaseFeatures(protocol);

    // Override with actual capabilities if provided
    if (capabilities) {
      // Check for specific capability flags
      if (capabilities.notifications !== undefined) {
        baseFeatures.notifications = Boolean(capabilities.notifications);
      }
      if (capabilities.sampling !== undefined) {
        baseFeatures.sampling = Boolean(capabilities.sampling);
      }
      if (capabilities.progressTokens !== undefined) {
        baseFeatures.progressTokens = Boolean(capabilities.progressTokens);
      }
    }

    return baseFeatures;
  }

  /**
   * Get base features for a protocol version
   */
  private getBaseFeatures(
    protocol: SupportedProtocol,
  ): NegotiatedProtocol['features'] {
    switch (protocol) {
      case '2025-06-18':
        // Latest version - assume all features
        return {
          notifications: true,
          resourcesTemplatesEmptyListOk: true,
          progressTokens: true,
          sampling: true,
        };

      case '0.1.0':
        // Legacy version - limited features
        return {
          notifications: false,
          resourcesTemplatesEmptyListOk: false,
          progressTokens: false,
          sampling: false,
        };

      default:
        // Conservative defaults
        return {
          notifications: false,
          resourcesTemplatesEmptyListOk: false,
          progressTokens: false,
          sampling: false,
        };
    }
  }

  /**
   * Get the negotiated protocol (if any)
   */
  getNegotiatedProtocol(): NegotiatedProtocol | null {
    return this.negotiatedProtocol;
  }

  /**
   * Adapt method name based on negotiated protocol
   */
  adaptMethod(method: string): string {
    if (!this.negotiatedProtocol) {
      return method;
    }

    // Currently no method name differences between versions
    // Add adaptations here if discovered
    return method;
  }

  /**
   * Adapt parameters based on negotiated protocol
   */
  adaptParams(method: string, params: unknown): unknown {
    if (!this.negotiatedProtocol) {
      return params;
    }

    // Handle protocol-specific parameter differences
    switch (this.negotiatedProtocol.protocol) {
      case '0.1.0':
        // Legacy version might need parameter adjustments
        return this.adaptParamsForLegacy(method, params);
      default:
        // Latest version - pass through
        return params;
    }
  }

  /**
   * Adapt parameters for legacy protocol version
   */
  private adaptParamsForLegacy(_method: string, params: unknown): unknown {
    // Add specific adaptations as needed
    // For now, pass through unchanged
    return params;
  }

  /**
   * Adapt response based on negotiated protocol
   */
  adaptResponse(_method: string, response: unknown): unknown {
    if (!this.negotiatedProtocol) {
      return response;
    }

    // Handle protocol-specific response differences
    // Currently no known differences
    return response;
  }

  /**
   * Create a wrapped call function that handles protocol adaptation
   */
  createAdaptedCall(
    callFn: (method: string, params: unknown) => Promise<unknown>,
  ): (method: string, params: unknown) => Promise<unknown> {
    return async (method: string, params: unknown) => {
      const adaptedMethod = this.adaptMethod(method);
      const adaptedParams = this.adaptParams(method, params);

      const response = await callFn(adaptedMethod, adaptedParams);

      return this.adaptResponse(method, response);
    };
  }
}

/**
 * Create initialize request with proper parameters
 */
export function createInitializeRequest(
  protocolVersion: string,
  clientInfo = { name: 'hatago-hub', version: '0.0.2' },
): InitializeParams {
  return {
    protocolVersion,
    capabilities: {
      experimental: {},
      tools: {},
      prompts: {},
      resources: {},
      sampling: {},
    },
    clientInfo,
  };
}
