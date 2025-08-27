/**
 * MCP Router type definitions
 * Minimal types for routing decisions and context
 */

/**
 * Target information for routing
 * Contains the resolved server and original name
 */
export interface RouteTarget {
  serverId: string;
  originalName: string;
}

/**
 * Extended target for resources which use URIs
 */
export interface ResourceRouteTarget {
  serverId: string;
  originalUri: string;
}

/**
 * Context passed to router for decision making
 * Extensible for future features without breaking changes
 */
export interface RouterContext {
  /** Request ID for tracing */
  requestId?: string | number;

  /** Session ID if available */
  sessionId?: string;

  /** Metadata for future extensions */
  metadata?: Record<string, unknown>;
}

/**
 * Result of a routing decision
 * Can be extended with additional information in the future
 */
export interface RouteDecision<T = RouteTarget> {
  /** The selected target */
  target: T | null;

  /** Reason if routing failed */
  error?: string;

  /** Additional metadata about the decision */
  metadata?: Record<string, unknown>;
}

/**
 * Registry state for pure functional routing
 */
export interface RegistryEntry {
  serverId: string;
  originalName: string;
  /** Additional properties for future use */
  metadata?: Record<string, unknown>;
}

export type RegistryState = Map<string, RegistryEntry>;
