/**
 * Authorization
 *
 * Scope-based access control and policy enforcement.
 */

import { incrementCounter, METRICS } from '../observability/metrics.js';
import type { LogContext } from '../observability/structured-logger.js';
import { logger } from '../observability/structured-logger.js';
import type { AuthContext } from './authenticator.js';

export interface Permission {
  resource: string;
  action: string;
  scope?: string;
}

export interface PolicyRule {
  id: string;
  name: string;
  description?: string;
  scopes: string[];
  permissions: Permission[];
  conditions?: PolicyCondition[];
}

export interface PolicyCondition {
  field: string;
  operator: 'equals' | 'contains' | 'startsWith' | 'endsWith' | 'matches';
  value: string | string[];
}

export interface AuthorizationRequest {
  resource: string;
  action: string;
  context?: Record<string, any>;
}

export interface AuthorizationResult {
  allowed: boolean;
  reason: string;
  matchedRules?: string[];
  requiredScopes?: string[];
}

export class Authorizer {
  private policies = new Map<string, PolicyRule>();

  constructor() {
    this.initializeDefaultPolicies();
  }

  /**
   * Check if the auth context has permission for the requested action
   */
  authorize(
    authContext: AuthContext,
    request: AuthorizationRequest,
    logContext: LogContext = {},
  ): AuthorizationResult {
    const { resource, action, context = {} } = request;
    const userScopes = authContext.scopes;

    // Find applicable policies
    const applicablePolicies = this.findApplicablePolicies(resource, action);

    if (applicablePolicies.length === 0) {
      // No policies found - default deny
      const result = {
        allowed: false,
        reason: 'No applicable policies found',
        requiredScopes: [`${resource}:${action}`],
      };

      this.logAuthorizationResult(authContext, request, result, logContext);
      return result;
    }

    // Check each policy
    const matchedRules: string[] = [];
    const allRequiredScopes = new Set<string>();

    for (const policy of applicablePolicies) {
      // Collect required scopes
      policy.scopes.forEach((scope) => allRequiredScopes.add(scope));

      // Check if user has required scopes
      const hasRequiredScopes = policy.scopes.every((requiredScope) =>
        this.matchesScope(userScopes, requiredScope),
      );

      if (!hasRequiredScopes) {
        continue;
      }

      // Check conditions
      if (
        policy.conditions &&
        !this.evaluateConditions(policy.conditions, context)
      ) {
        continue;
      }

      // Policy matches
      matchedRules.push(policy.id);
    }

    const allowed = matchedRules.length > 0;
    const result: AuthorizationResult = {
      allowed,
      reason: allowed
        ? `Access granted by policies: ${matchedRules.join(', ')}`
        : `Access denied - insufficient scopes. Required: ${Array.from(allRequiredScopes).join(', ')}`,
      matchedRules: allowed ? matchedRules : undefined,
      requiredScopes: !allowed ? Array.from(allRequiredScopes) : undefined,
    };

    this.logAuthorizationResult(authContext, request, result, logContext);
    return result;
  }

  /**
   * Add or update a policy rule
   */
  addPolicy(policy: PolicyRule): void {
    this.policies.set(policy.id, policy);

    logger.info('Policy added', {
      policyId: policy.id,
      name: policy.name,
      scopes: policy.scopes,
      permissions: policy.permissions.length,
    });
  }

  /**
   * Remove a policy rule
   */
  removePolicy(policyId: string): boolean {
    const removed = this.policies.delete(policyId);

    if (removed) {
      logger.info('Policy removed', { policyId });
    }

    return removed;
  }

  /**
   * List all policies
   */
  listPolicies(): PolicyRule[] {
    return Array.from(this.policies.values());
  }

  /**
   * Get a specific policy
   */
  getPolicy(policyId: string): PolicyRule | undefined {
    return this.policies.get(policyId);
  }

  /**
   * Check if a scope pattern matches user scopes
   */
  private matchesScope(userScopes: string[], requiredScope: string): boolean {
    // Exact match
    if (userScopes.includes(requiredScope)) {
      return true;
    }

    // Wildcard matching
    for (const userScope of userScopes) {
      if (this.matchesWildcard(userScope, requiredScope)) {
        return true;
      }
    }

    return false;
  }

  /**
   * Wildcard scope matching
   * Examples:
   * - "server:*" matches "server:tool:call"
   * - "weather:*" matches "weather:get-forecast"
   */
  private matchesWildcard(userScope: string, requiredScope: string): boolean {
    if (!userScope.endsWith('*')) {
      return userScope === requiredScope;
    }

    const prefix = userScope.slice(0, -1); // Remove trailing *
    return requiredScope.startsWith(prefix);
  }

  /**
   * Find policies that apply to the given resource and action
   */
  private findApplicablePolicies(
    resource: string,
    action: string,
  ): PolicyRule[] {
    const applicable: PolicyRule[] = [];

    for (const policy of this.policies.values()) {
      for (const permission of policy.permissions) {
        if (
          this.matchesPattern(resource, permission.resource) &&
          this.matchesPattern(action, permission.action)
        ) {
          applicable.push(policy);
          break; // Don't add the same policy multiple times
        }
      }
    }

    return applicable;
  }

  /**
   * Pattern matching for resources and actions (supports wildcards)
   */
  private matchesPattern(value: string, pattern: string): boolean {
    if (pattern === '*') {
      return true;
    }

    if (!pattern.includes('*')) {
      return value === pattern;
    }

    // Convert glob pattern to regex
    const regex = new RegExp(
      `^${pattern.replace(/\*/g, '.*').replace(/\?/g, '.')}$`,
    );

    return regex.test(value);
  }

  /**
   * Evaluate policy conditions
   */
  private evaluateConditions(
    conditions: PolicyCondition[],
    context: Record<string, any>,
  ): boolean {
    return conditions.every((condition) => {
      const contextValue = context[condition.field];

      if (contextValue === undefined) {
        return false;
      }

      const contextStr = String(contextValue);

      switch (condition.operator) {
        case 'equals':
          return contextStr === condition.value;

        case 'contains':
          return contextStr.includes(String(condition.value));

        case 'startsWith':
          return contextStr.startsWith(String(condition.value));

        case 'endsWith':
          return contextStr.endsWith(String(condition.value));

        case 'matches':
          if (Array.isArray(condition.value)) {
            return condition.value.some((v) => contextStr === String(v));
          }
          return contextStr === String(condition.value);

        default:
          return false;
      }
    });
  }

  /**
   * Log authorization result
   */
  private logAuthorizationResult(
    authContext: AuthContext,
    request: AuthorizationRequest,
    result: AuthorizationResult,
    logContext: LogContext,
  ): void {
    const event = result.allowed ? 'auth_success' : 'access_denied';

    logger.security({
      event,
      reason: result.reason,
      tokenId: authContext.tokenId,
      resource: request.resource,
      action: request.action,
      scopes: authContext.scopes.join(','),
      matchedRules: result.matchedRules?.join(','),
      requiredScopes: result.requiredScopes?.join(','),
      ...logContext,
    });

    // Increment metrics
    incrementCounter(METRICS.REQUESTS_TOTAL, 1, {
      status: result.allowed ? 'authorized' : 'forbidden',
      resource: request.resource,
      action: request.action,
    });
  }

  /**
   * Initialize default policies
   */
  private initializeDefaultPolicies(): void {
    // Admin policy - full access
    this.addPolicy({
      id: 'admin',
      name: 'Administrator',
      description: 'Full access to all resources',
      scopes: ['admin:*'],
      permissions: [{ resource: '*', action: '*' }],
    });

    // Server management policy
    this.addPolicy({
      id: 'server-admin',
      name: 'Server Administrator',
      description: 'Manage MCP servers',
      scopes: ['server:admin'],
      permissions: [
        { resource: 'server', action: 'list' },
        { resource: 'server', action: 'create' },
        { resource: 'server', action: 'update' },
        { resource: 'server', action: 'delete' },
        { resource: 'server', action: 'start' },
        { resource: 'server', action: 'stop' },
        { resource: 'server', action: 'restart' },
      ],
    });

    // Tool execution policy
    this.addPolicy({
      id: 'tool-user',
      name: 'Tool User',
      description: 'Execute tools on authorized servers',
      scopes: ['tool:call'],
      permissions: [
        { resource: 'tool', action: 'list' },
        { resource: 'tool', action: 'call' },
      ],
    });

    // Read-only policy
    this.addPolicy({
      id: 'read-only',
      name: 'Read Only',
      description: 'Read-only access to resources',
      scopes: ['read:*'],
      permissions: [
        { resource: '*', action: 'list' },
        { resource: '*', action: 'get' },
        { resource: '*', action: 'status' },
      ],
    });

    // Health check policy (public)
    this.addPolicy({
      id: 'health',
      name: 'Health Check',
      description: 'Access to health endpoints',
      scopes: ['public'], // Special scope for public access
      permissions: [
        { resource: 'health', action: 'check' },
        { resource: 'status', action: 'get' },
      ],
    });
  }
}

// Global authorizer instance
export const authorizer = new Authorizer();
