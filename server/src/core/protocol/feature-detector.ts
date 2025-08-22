/**
 * Feature Detection for MCP Protocol
 * Pure functions for detecting server capabilities and features
 */

import type { SupportedProtocol } from './protocol-version.js';

/**
 * Feature flags based on protocol version and capabilities
 */
export interface ProtocolFeatures {
  // Whether the server supports notifications
  notifications: boolean;
  // Whether empty resource lists are properly handled
  resourcesTemplatesEmptyListOk: boolean;
  // Whether the server supports progress tokens
  progressTokens: boolean;
  // Whether the server supports sampling
  sampling: boolean;
  // Whether the server supports tool choice
  toolChoice: boolean;
  // Whether the server supports resource templates
  resourceTemplates: boolean;
}

/**
 * Server capabilities from initialization response
 */
export interface ServerCapabilities {
  tools?: {
    listChanged?: boolean;
  };
  resources?: {
    subscribe?: boolean;
    listChanged?: boolean;
  };
  prompts?: {
    listChanged?: boolean;
  };
  logging?: Record<string, unknown>;
  [key: string]: unknown;
}

/**
 * Detect features based on protocol version and server capabilities
 */
export function detectFeatures(
  protocol: SupportedProtocol,
  capabilities?: ServerCapabilities,
): ProtocolFeatures {
  // Start with base features for the protocol version
  const baseFeatures = getBaseFeatures(protocol);

  // Override with capability-based detection
  return {
    ...baseFeatures,
    notifications: detectNotificationSupport(capabilities),
    progressTokens: detectProgressTokenSupport(capabilities),
    sampling: detectSamplingSupport(capabilities),
    toolChoice: detectToolChoiceSupport(capabilities),
    resourceTemplates: detectResourceTemplateSupport(capabilities),
  };
}

/**
 * Get base features for a protocol version
 */
export function getBaseFeatures(protocol: SupportedProtocol): ProtocolFeatures {
  switch (protocol) {
    case '2025-06-18':
      // Latest version supports all features
      return {
        notifications: true,
        resourcesTemplatesEmptyListOk: true,
        progressTokens: true,
        sampling: true,
        toolChoice: true,
        resourceTemplates: true,
      };

    case '0.1.0':
      // Legacy version has limited features
      return {
        notifications: false,
        resourcesTemplatesEmptyListOk: false,
        progressTokens: false,
        sampling: false,
        toolChoice: false,
        resourceTemplates: false,
      };

    default:
      // Conservative defaults for unknown versions
      return {
        notifications: false,
        resourcesTemplatesEmptyListOk: false,
        progressTokens: false,
        sampling: false,
        toolChoice: false,
        resourceTemplates: false,
      };
  }
}

/**
 * Detect if server supports notifications
 */
function detectNotificationSupport(capabilities?: ServerCapabilities): boolean {
  if (!capabilities) return false;

  // Check for any listChanged capability
  return !!(
    capabilities.tools?.listChanged ||
    capabilities.resources?.listChanged ||
    capabilities.prompts?.listChanged
  );
}

/**
 * Detect if server supports progress tokens
 */
function detectProgressTokenSupport(
  _capabilities?: ServerCapabilities,
): boolean {
  // Progress tokens are indicated by specific capability flags
  // For now, we don't have a specific flag, so return false
  return false;
}

/**
 * Detect if server supports sampling
 */
function detectSamplingSupport(capabilities?: ServerCapabilities): boolean {
  // Check for sampling capability
  return capabilities?.sampling !== undefined;
}

/**
 * Detect if server supports tool choice
 */
function detectToolChoiceSupport(capabilities?: ServerCapabilities): boolean {
  // Tool choice is a newer feature
  return (
    capabilities?.tools !== undefined && typeof capabilities.tools === 'object'
  );
}

/**
 * Detect if server supports resource templates
 */
function detectResourceTemplateSupport(
  capabilities?: ServerCapabilities,
): boolean {
  // Resource templates are indicated by subscribe capability
  return capabilities?.resources?.subscribe === true;
}

/**
 * Check if a feature is available
 */
export function hasFeature(
  features: ProtocolFeatures,
  feature: keyof ProtocolFeatures,
): boolean {
  return features[feature] === true;
}
