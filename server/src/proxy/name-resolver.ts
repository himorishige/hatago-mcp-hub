/**
 * Name Resolver
 *
 * Handles name resolution for the capability graph.
 * Supports server.tool, server.namespace.tool patterns.
 */

import { HatagoProtocolError, RPC_ERRORS } from '../protocol/index.js';
import type { ServerNode } from './server-node.js';

export interface ResolvedName {
  serverName: string;
  toolName: string;
  fullName: string;
}

export interface NamespaceConfig {
  prefix: string;
  serverName: string;
  aliases?: Record<string, string>;
}

export interface NameResolverOptions {
  defaultSeparator?: string;
  allowAliases?: boolean;
  caseSensitive?: boolean;
}

export class NameResolver {
  private readonly options: Required<NameResolverOptions>;
  private readonly servers = new Map<string, ServerNode>();
  private readonly namespaces = new Map<string, NamespaceConfig>();
  private readonly aliases = new Map<string, string>();
  private readonly reverseAliases = new Map<string, string>();

  constructor(options: NameResolverOptions = {}) {
    this.options = {
      defaultSeparator: options.defaultSeparator ?? '.',
      allowAliases: options.allowAliases ?? true,
      caseSensitive: options.caseSensitive ?? true,
      ...options,
    };
  }

  /**
   * Register a server node
   */
  registerServer(server: ServerNode): void {
    const name = this.normalizeServerName(server.name);

    if (this.servers.has(name)) {
      throw HatagoProtocolError.systemError(
        `Server ${name} is already registered`,
        { code: RPC_ERRORS.INTERNAL_ERROR },
      );
    }

    this.servers.set(name, server);
  }

  /**
   * Unregister a server node
   */
  unregisterServer(serverName: string): boolean {
    const name = this.normalizeServerName(serverName);
    return this.servers.delete(name);
  }

  /**
   * Register a namespace mapping
   */
  registerNamespace(config: NamespaceConfig): void {
    const prefix = this.normalizeName(config.prefix);
    const serverName = this.normalizeServerName(config.serverName);

    if (!this.servers.has(serverName)) {
      throw HatagoProtocolError.systemError(
        `Cannot register namespace ${prefix}: server ${serverName} not found`,
        { code: RPC_ERRORS.INTERNAL_ERROR },
      );
    }

    this.namespaces.set(prefix, { ...config, prefix, serverName });

    // Register aliases if provided
    if (config.aliases && this.options.allowAliases) {
      for (const [alias, toolName] of Object.entries(config.aliases)) {
        this.registerAlias(
          alias,
          `${prefix}${this.options.defaultSeparator}${toolName}`,
        );
      }
    }
  }

  /**
   * Register a simple alias
   */
  registerAlias(alias: string, fullName: string): void {
    if (!this.options.allowAliases) {
      throw HatagoProtocolError.systemError(
        'Aliases are disabled in this resolver',
        { code: RPC_ERRORS.INTERNAL_ERROR },
      );
    }

    const normalizedAlias = this.normalizeName(alias);
    const normalizedFull = this.normalizeName(fullName);

    if (this.aliases.has(normalizedAlias)) {
      throw HatagoProtocolError.systemError(
        `Alias ${alias} is already registered`,
        { code: RPC_ERRORS.INTERNAL_ERROR },
      );
    }

    this.aliases.set(normalizedAlias, normalizedFull);
    this.reverseAliases.set(normalizedFull, normalizedAlias);
  }

  /**
   * Resolve a name to server and tool
   */
  resolve(name: string): ResolvedName {
    const normalizedName = this.normalizeName(name);

    // First, check for direct aliases
    const aliasTarget = this.aliases.get(normalizedName);
    if (aliasTarget) {
      return this.parseResolvedName(aliasTarget);
    }

    return this.parseResolvedName(normalizedName);
  }

  /**
   * Get the server node for a resolved name
   */
  getServer(resolved: ResolvedName): ServerNode {
    const server = this.servers.get(resolved.serverName);
    if (!server) {
      throw HatagoProtocolError.systemError(
        `Server ${resolved.serverName} not found`,
        { code: RPC_ERRORS.METHOD_NOT_FOUND, serverName: resolved.serverName },
      );
    }
    return server;
  }

  /**
   * List all registered servers
   */
  listServers(): string[] {
    return Array.from(this.servers.keys());
  }

  /**
   * List all namespaces
   */
  listNamespaces(): NamespaceConfig[] {
    return Array.from(this.namespaces.values());
  }

  /**
   * List all aliases
   */
  listAliases(): Record<string, string> {
    return Object.fromEntries(this.aliases.entries());
  }

  /**
   * Check if a name exists
   */
  exists(name: string): boolean {
    try {
      const resolved = this.resolve(name);
      return this.servers.has(resolved.serverName);
    } catch {
      return false;
    }
  }

  /**
   * Get available tools for a server
   */
  getAvailableTools(serverName: string): string[] {
    const normalizedName = this.normalizeServerName(serverName);
    const server = this.servers.get(normalizedName);

    if (!server) {
      return [];
    }

    const capabilities = server.capabilities;
    if (!capabilities.tools) {
      return [];
    }

    return capabilities.tools.map(
      (tool) => `${serverName}${this.options.defaultSeparator}${tool.name}`,
    );
  }

  /**
   * Generate suggestions for mistyped names
   */
  getSuggestions(name: string, maxSuggestions = 5): string[] {
    const normalizedInput = this.normalizeName(name);
    const allNames = [
      ...Array.from(this.servers.keys()).flatMap((server) =>
        this.getAvailableTools(server),
      ),
      ...Array.from(this.aliases.keys()),
    ];

    return allNames
      .map((candidate) => ({
        name: candidate,
        distance: this.levenshteinDistance(normalizedInput, candidate),
      }))
      .filter((item) => item.distance <= Math.floor(normalizedInput.length / 2))
      .sort((a, b) => a.distance - b.distance)
      .slice(0, maxSuggestions)
      .map((item) => item.name);
  }

  private parseResolvedName(fullName: string): ResolvedName {
    const parts = fullName.split(this.options.defaultSeparator);

    if (parts.length < 2) {
      throw HatagoProtocolError.userError(
        `Invalid name format: ${fullName}. Expected: server${this.options.defaultSeparator}tool`,
        { code: RPC_ERRORS.INVALID_PARAMS },
      );
    }

    const serverName = parts[0];
    const toolName = parts.slice(1).join(this.options.defaultSeparator);

    // Verify server exists
    if (!this.servers.has(serverName)) {
      const suggestions = this.getSuggestions(fullName);
      const suggestionText =
        suggestions.length > 0
          ? `. Did you mean: ${suggestions.join(', ')}?`
          : '';

      throw HatagoProtocolError.userError(
        `Server ${serverName} not found${suggestionText}`,
        {
          code: RPC_ERRORS.METHOD_NOT_FOUND,
          serverName,
          data: { suggestions },
        },
      );
    }

    return {
      serverName,
      toolName,
      fullName,
    };
  }

  private normalizeServerName(name: string): string {
    return this.options.caseSensitive ? name : name.toLowerCase();
  }

  private normalizeName(name: string): string {
    return this.options.caseSensitive ? name : name.toLowerCase();
  }

  private levenshteinDistance(a: string, b: string): number {
    const matrix: number[][] = [];

    for (let i = 0; i <= b.length; i++) {
      matrix[i] = [i];
    }

    for (let j = 0; j <= a.length; j++) {
      matrix[0][j] = j;
    }

    for (let i = 1; i <= b.length; i++) {
      for (let j = 1; j <= a.length; j++) {
        if (b.charAt(i - 1) === a.charAt(j - 1)) {
          matrix[i][j] = matrix[i - 1][j - 1];
        } else {
          matrix[i][j] = Math.min(
            matrix[i - 1][j - 1] + 1, // substitution
            matrix[i][j - 1] + 1, // insertion
            matrix[i - 1][j] + 1, // deletion
          );
        }
      }
    }

    return matrix[b.length][a.length];
  }
}
