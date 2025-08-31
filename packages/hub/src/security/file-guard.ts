/**
 * File access guard for configuration security
 * Ensures only authorized files can be read/written
 */

import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { diffLines } from 'diff';

/**
 * Diff result for configuration changes
 */
export interface DiffResult {
  /** Text diff of changes */
  diff: string;

  /** Validation result */
  validation: {
    valid: boolean;
    errors?: string[];
  };

  /** Impact analysis */
  impacts: {
    serversAdded: string[];
    serversRemoved: string[];
    serversModified: string[];
    policyChanges: Array<{
      serverId: string;
      from: string;
      to: string;
    }>;
  };
}

/**
 * File access guard
 * Restricts file access to authorized paths only
 */
export class FileAccessGuard {
  private readonly configFilePath: string;
  private readonly allowedPaths: Set<string>;
  private readonly writablePaths: Set<string>;

  constructor(configFile: string) {
    // Resolve absolute path
    this.configFilePath = configFile ? resolve(configFile) : '';

    // Define allowed read paths
    this.allowedPaths = new Set([
      this.configFilePath,
      `${this.configFilePath}.metadata.json`,
      `${this.configFilePath}.audit.log`,
      `${this.configFilePath}.backup`
    ]);

    // Only config file is writable
    this.writablePaths = new Set([this.configFilePath]);
  }

  /**
   * Check if a file can be read
   */
  canRead(path: string): boolean {
    if (!path) return false;
    const resolved = resolve(path);
    return this.allowedPaths.has(resolved);
  }

  /**
   * Check if a file can be written
   */
  canWrite(path: string): boolean {
    if (!path) return false;
    const resolved = resolve(path);
    return this.writablePaths.has(resolved);
  }

  /**
   * Safe read operation
   */
  safeRead(path: string): string {
    if (!this.canRead(path)) {
      throw new Error(`Unauthorized file access attempt: ${path}`);
    }

    const resolved = resolve(path);
    if (!existsSync(resolved)) {
      throw new Error(`File not found: ${path}`);
    }

    return readFileSync(resolved, 'utf-8');
  }

  /**
   * Safe write operation
   */
  safeWrite(path: string, content: string): void {
    if (!this.canWrite(path)) {
      throw new Error(`Unauthorized file write attempt: ${path}`);
    }

    const resolved = resolve(path);

    // Create backup before writing
    if (existsSync(resolved)) {
      const backup = `${resolved}.backup`;
      const original = readFileSync(resolved, 'utf-8');
      writeFileSync(backup, original, 'utf-8');
    }

    // Write new content
    writeFileSync(resolved, content, 'utf-8');
  }

  /**
   * Preview changes before applying
   */
  async previewChanges(changes: unknown): Promise<DiffResult> {
    if (!this.configFilePath) {
      throw new Error('No config file specified');
    }

    // Load current config
    const currentContent = existsSync(this.configFilePath)
      ? readFileSync(this.configFilePath, 'utf-8')
      : '{}';
    const current = JSON.parse(currentContent) as Record<string, unknown>;

    // Apply changes
    const next = this.mergeConfig(current, changes as Record<string, unknown>);

    // Generate diff
    const currentFormatted = JSON.stringify(current, null, 2);
    const nextFormatted = JSON.stringify(next, null, 2);
    const diff = this.generateDiff(currentFormatted, nextFormatted);

    // Validate
    const validation = await this.validateConfig(next);

    // Analyze impacts
    const impacts = this.analyzeImpacts(current, next);

    return { diff, validation, impacts };
  }

  /**
   * Merge configuration changes
   */
  private mergeConfig(
    current: Record<string, unknown>,
    changes: Record<string, unknown>
  ): Record<string, unknown> {
    // Deep merge logic
    const merged = JSON.parse(JSON.stringify(current)) as Record<string, unknown>;

    // Handle server configurations
    if (changes.mcpServers) {
      merged.mcpServers = {
        ...((merged.mcpServers as Record<string, unknown>) || {}),
        ...(changes.mcpServers as Record<string, unknown>)
      };
    }

    if (changes.servers) {
      merged.servers = {
        ...((merged.servers as Record<string, unknown>) || {}),
        ...(changes.servers as Record<string, unknown>)
      };
    }

    // Handle other top-level properties
    for (const key of Object.keys(changes)) {
      if (key !== 'mcpServers' && key !== 'servers') {
        merged[key] = changes[key];
      }
    }

    return merged;
  }

  /**
   * Generate text diff
   */
  private generateDiff(before: string, after: string): string {
    const diff = diffLines(before, after);
    let result = '';

    for (const part of diff) {
      const prefix = part.added ? '+' : part.removed ? '-' : ' ';
      const lines = part.value.split('\n').filter((line) => line);

      for (const line of lines) {
        result += `${prefix} ${line}\n`;
      }
    }

    return result;
  }

  /**
   * Validate configuration
   */
  private validateConfig(config: Record<string, unknown>): { valid: boolean; errors?: string[] } {
    const errors: string[] = [];

    // Check required fields
    const mcpServers = config.mcpServers as Record<string, unknown> | undefined;
    const legacyServers = config.servers as Record<string, unknown> | undefined;
    const servers = { ...(mcpServers || {}), ...(legacyServers || {}) };

    for (const [id, server] of Object.entries(servers)) {
      if (!server || typeof server !== 'object') {
        errors.push(`Invalid server configuration: ${id}`);
        continue;
      }

      const s = server as Record<string, unknown>;

      // Check connection configuration
      const hasLocal = s.command as unknown;
      const hasRemote = s.url as unknown;

      if (!hasLocal && !hasRemote) {
        errors.push(`Server ${id}: Must have either command or url`);
      }

      if (hasLocal && hasRemote) {
        errors.push(`Server ${id}: Cannot have both command and url`);
      }

      // Validate activation policy
      if (s.activationPolicy) {
        const policy = s.activationPolicy as string;
        const validPolicies = ['always', 'onDemand', 'manual'];
        if (!validPolicies.includes(policy)) {
          errors.push(`Server ${id}: Invalid activation policy: ${policy}`);
        }
      }

      // Validate timeouts
      if (s.timeouts) {
        const timeouts = s.timeouts as Record<string, unknown>;
        for (const [key, value] of Object.entries(timeouts)) {
          if (typeof value !== 'number' || value <= 0) {
            errors.push(`Server ${id}: Invalid timeout ${key}: ${String(value)}`);
          }
        }
      }
    }

    return {
      valid: errors.length === 0,
      errors: errors.length > 0 ? errors : undefined
    };
  }

  /**
   * Analyze configuration changes impact
   */
  private analyzeImpacts(
    current: Record<string, unknown>,
    next: Record<string, unknown>
  ): DiffResult['impacts'] {
    const currentMcp = current.mcpServers as Record<string, unknown> | undefined;
    const currentLegacy = current.servers as Record<string, unknown> | undefined;
    const currentServers = { ...(currentMcp || {}), ...(currentLegacy || {}) };

    const nextMcp = next.mcpServers as Record<string, unknown> | undefined;
    const nextLegacy = next.servers as Record<string, unknown> | undefined;
    const nextServers = { ...(nextMcp || {}), ...(nextLegacy || {}) };

    const currentIds = new Set(Object.keys(currentServers));
    const nextIds = new Set(Object.keys(nextServers));

    // Find added/removed servers
    const serversAdded = Array.from(nextIds).filter((id) => !currentIds.has(id));
    const serversRemoved = Array.from(currentIds).filter((id) => !nextIds.has(id));

    // Find modified servers
    const serversModified: string[] = [];
    const policyChanges: DiffResult['impacts']['policyChanges'] = [];

    for (const id of currentIds) {
      if (!nextIds.has(id)) continue;

      const currentServer = currentServers[id];
      const nextServer = nextServers[id];

      // Check if modified
      if (JSON.stringify(currentServer) !== JSON.stringify(nextServer)) {
        serversModified.push(id);

        // Check for policy changes
        const currentServerObj = currentServer as Record<string, unknown> | undefined;
        const nextServerObj = nextServer as Record<string, unknown> | undefined;
        const currentPolicy = (currentServerObj?.activationPolicy as string) || 'manual';
        const nextPolicy = (nextServerObj?.activationPolicy as string) || 'manual';

        if (currentPolicy !== nextPolicy) {
          policyChanges.push({
            serverId: id,
            from: currentPolicy,
            to: nextPolicy
          });
        }
      }
    }

    return {
      serversAdded,
      serversRemoved,
      serversModified,
      policyChanges
    };
  }

  /**
   * Get allowed paths
   */
  getAllowedPaths(): string[] {
    return Array.from(this.allowedPaths);
  }

  /**
   * Get config file path
   */
  getConfigPath(): string {
    return this.configFilePath;
  }
}
