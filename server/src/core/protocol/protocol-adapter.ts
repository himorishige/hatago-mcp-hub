/**
 * Protocol Message Adapter
 * Pure functions for adapting messages between protocol versions
 */

import type { JSONRPCMessage } from '@modelcontextprotocol/sdk/types.js';
import type { SupportedProtocol } from './protocol-version.js';

/**
 * Adapt a request message from one protocol version to another
 */
export function adaptRequest(
  message: JSONRPCMessage,
  fromVersion: SupportedProtocol,
  toVersion: SupportedProtocol,
): JSONRPCMessage {
  // If versions match, no adaptation needed
  if (fromVersion === toVersion) {
    return message;
  }

  // Only adapt request messages
  if (!('method' in message)) {
    return message;
  }

  // Adapt method names if needed
  const adaptedMethod = adaptMethodName(message.method, fromVersion, toVersion);

  // Adapt parameters if needed
  const adaptedParams = adaptRequestParams(
    message.method,
    message.params,
    fromVersion,
    toVersion,
  );

  return {
    ...message,
    method: adaptedMethod,
    params: adaptedParams,
  };
}

/**
 * Adapt a response message from one protocol version to another
 */
export function adaptResponse(
  message: JSONRPCMessage,
  method: string,
  fromVersion: SupportedProtocol,
  toVersion: SupportedProtocol,
): JSONRPCMessage {
  // If versions match, no adaptation needed
  if (fromVersion === toVersion) {
    return message;
  }

  // Only adapt result messages
  if (!('result' in message)) {
    return message;
  }

  // Adapt result based on the method
  const adaptedResult = adaptResponseResult(
    method,
    message.result,
    fromVersion,
    toVersion,
  );

  return {
    ...message,
    result: adaptedResult,
  };
}

/**
 * Adapt method names between protocol versions
 */
function adaptMethodName(
  method: string,
  _fromVersion: SupportedProtocol,
  _toVersion: SupportedProtocol,
): string {
  // Currently, method names are consistent across versions
  return method;
}

/**
 * Adapt request parameters between protocol versions
 */
function adaptRequestParams(
  method: string,
  params: unknown,
  fromVersion: SupportedProtocol,
  toVersion: SupportedProtocol,
): unknown {
  // Handle specific method adaptations
  switch (method) {
    case 'initialize':
      return adaptInitializeParams(params, fromVersion, toVersion);

    case 'resources/list':
    case 'resources/templates/list':
      return adaptResourceListParams(params, fromVersion, toVersion);

    default:
      return params;
  }
}

/**
 * Adapt initialize parameters
 */
function adaptInitializeParams(
  params: unknown,
  fromVersion: SupportedProtocol,
  toVersion: SupportedProtocol,
): unknown {
  if (!params || typeof params !== 'object') {
    return params;
  }

  const typedParams = params as Record<string, unknown>;

  // Adapt from newer to older version
  if (fromVersion === '2025-06-18' && toVersion === '0.1.0') {
    // Remove newer fields not supported in 0.1.0
    const { sampling: _sampling, ...legacyParams } = typedParams;
    return legacyParams;
  }

  // Adapt from older to newer version
  if (fromVersion === '0.1.0' && toVersion === '2025-06-18') {
    // Add default values for newer fields
    return {
      ...typedParams,
      capabilities: {
        ...(typedParams.capabilities as Record<string, unknown>),
        sampling: {},
      },
    };
  }

  return params;
}

/**
 * Adapt resource list parameters
 */
function adaptResourceListParams(
  params: unknown,
  _fromVersion: SupportedProtocol,
  toVersion: SupportedProtocol,
): unknown {
  // Legacy version doesn't support empty cursor
  if (toVersion === '0.1.0' && params && typeof params === 'object') {
    const typedParams = params as Record<string, unknown>;
    if (typedParams.cursor === null) {
      const { cursor: _cursor, ...rest } = typedParams;
      return rest;
    }
  }

  return params;
}

/**
 * Adapt response results between protocol versions
 */
function adaptResponseResult(
  method: string,
  result: unknown,
  fromVersion: SupportedProtocol,
  toVersion: SupportedProtocol,
): unknown {
  // Handle specific method result adaptations
  switch (method) {
    case 'initialize':
      return adaptInitializeResult(result, fromVersion, toVersion);

    case 'resources/list':
    case 'resources/templates/list':
      return adaptResourceListResult(result, fromVersion, toVersion);

    default:
      return result;
  }
}

/**
 * Adapt initialize result
 */
function adaptInitializeResult(
  result: unknown,
  _fromVersion: SupportedProtocol,
  toVersion: SupportedProtocol,
): unknown {
  if (!result || typeof result !== 'object') {
    return result;
  }

  const typedResult = result as Record<string, unknown>;

  // Ensure protocol version matches what the client expects
  return {
    ...typedResult,
    protocolVersion: toVersion,
  };
}

/**
 * Adapt resource list result
 */
function adaptResourceListResult(
  result: unknown,
  _fromVersion: SupportedProtocol,
  toVersion: SupportedProtocol,
): unknown {
  if (!result || typeof result !== 'object') {
    return result;
  }

  const typedResult = result as Record<string, unknown>;

  // Legacy version doesn't handle empty arrays well
  if (
    toVersion === '0.1.0' &&
    Array.isArray(typedResult.resources) &&
    typedResult.resources.length === 0
  ) {
    // Add a placeholder or handle differently
    return {
      ...typedResult,
      resources: undefined,
    };
  }

  return result;
}
