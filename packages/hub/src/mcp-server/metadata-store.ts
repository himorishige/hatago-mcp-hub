/**
 * Metadata persistence for disabled servers
 * Stores tool/resource/prompt definitions for inactive servers
 */

import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { createHash } from 'node:crypto';
import type { Prompt, Resource, ServerMetadata, Tool } from '@himorishige/hatago-core';

/**
 * Server metadata with MCP capabilities
 */
export type StoredServerMetadata = Partial<ServerMetadata> & {
  /** Server identifier */
  serverId: string;

  /** Server type */
  serverType: 'local' | 'npx' | 'http' | 'sse' | 'ws';

  /** When this metadata was last updated */
  lastUpdated: string;

  /** Server version if known */
  version?: string;

  /** Hash of tool definitions for change detection */
  toolsHash?: string;

  /** Hash of resource definitions for change detection */
  resourcesHash?: string;

  /** Hash of prompt definitions for change detection */
  promptsHash?: string;
};

/**
 * Metadata store for persistent server information
 */
export class MetadataStore {
  private readonly metadataPath: string;
  private metadata: Map<string, StoredServerMetadata> = new Map();
  private readonly autoSave: boolean;
  private saveTimer?: NodeJS.Timeout;
  private readonly saveDebounceMs = 5000;

  constructor(configFilePath: string, autoSave = true) {
    this.metadataPath = configFilePath ? `${resolve(configFilePath)}.metadata.json` : '';
    this.autoSave = autoSave;

    // Load existing metadata
    this.load();
  }

  /**
   * Store server metadata
   */
  storeServerMetadata(serverId: string, metadata: Partial<StoredServerMetadata>): void {
    const existing = this.metadata.get(serverId) ?? {
      serverId,
      serverType: 'local' as const,
      lastUpdated: new Date().toISOString()
    };

    // Merge with existing
    const updated: StoredServerMetadata = {
      ...existing,
      ...metadata,
      serverId,
      lastUpdated: new Date().toISOString()
    };

    // Calculate hashes for change detection
    if (updated.tools) {
      updated.toolsHash = this.calculateHash(updated.tools);
    }
    if (updated.resources) {
      updated.resourcesHash = this.calculateHash(updated.resources);
    }
    if (updated.prompts) {
      updated.promptsHash = this.calculateHash(updated.prompts);
    }

    this.metadata.set(serverId, updated);

    // Save if auto-save enabled
    if (this.autoSave) {
      this.scheduleSave();
    }
  }

  /**
   * Store tools for a server
   */
  async storeTools(serverId: string, tools: Tool[]): Promise<void> {
    await this.storeServerMetadata(serverId, {
      tools: tools.map((t) => ({
        name: t.name,
        description: t.description ?? '',
        inputSchema: t.inputSchema
      })),
      capabilities: {
        tools: tools.length > 0,
        resources: this.getServerMetadata(serverId)?.capabilities?.resources ?? false,
        prompts: this.getServerMetadata(serverId)?.capabilities?.prompts ?? false
      }
    });
  }

  /**
   * Store resources for a server
   */
  async storeResources(serverId: string, resources: Resource[]): Promise<void> {
    await this.storeServerMetadata(serverId, {
      resources: resources.map((r) => ({
        uri: r.uri,
        name: r.name,
        mimeType: r.mimeType
      })),
      capabilities: {
        tools: this.getServerMetadata(serverId)?.capabilities?.tools ?? false,
        resources: resources.length > 0,
        prompts: this.getServerMetadata(serverId)?.capabilities?.prompts ?? false
      }
    });
  }

  /**
   * Store prompts for a server
   */
  async storePrompts(serverId: string, prompts: Prompt[]): Promise<void> {
    await this.storeServerMetadata(serverId, {
      prompts: prompts.map((p) => ({
        name: p.name,
        description: p.description ?? '',
        arguments: p.arguments
      })),
      capabilities: {
        tools: this.getServerMetadata(serverId)?.capabilities?.tools ?? false,
        resources: this.getServerMetadata(serverId)?.capabilities?.resources ?? false,
        prompts: prompts.length > 0
      }
    });
  }

  /**
   * Get server metadata
   */
  getServerMetadata(serverId: string): StoredServerMetadata | undefined {
    return this.metadata.get(serverId);
  }

  /**
   * Get all metadata
   */
  getAllMetadata(): Map<string, StoredServerMetadata> {
    return new Map(this.metadata);
  }

  /**
   * Get tools for a server
   */
  getTools(serverId: string): Tool[] | undefined {
    const metadata = this.metadata.get(serverId);
    return metadata?.tools as Tool[] | undefined;
  }

  /**
   * Get resources for a server
   */
  getResources(serverId: string): Resource[] | undefined {
    const metadata = this.metadata.get(serverId);
    return metadata?.resources as Resource[] | undefined;
  }

  /**
   * Get prompts for a server
   */
  getPrompts(serverId: string): Prompt[] | undefined {
    const metadata = this.metadata.get(serverId);
    return metadata?.prompts as Prompt[] | undefined;
  }

  /**
   * Check if server capabilities changed
   */
  hasCapabilitiesChanged(
    serverId: string,
    tools?: Tool[],
    resources?: Resource[],
    prompts?: Prompt[]
  ): boolean {
    const metadata = this.metadata.get(serverId);
    if (!metadata) return true;

    // Check tools
    if (tools) {
      const newHash = this.calculateHash(tools);
      if (newHash !== metadata.toolsHash) return true;
    }

    // Check resources
    if (resources) {
      const newHash = this.calculateHash(resources);
      if (newHash !== metadata.resourcesHash) return true;
    }

    // Check prompts
    if (prompts) {
      const newHash = this.calculateHash(prompts);
      if (newHash !== metadata.promptsHash) return true;
    }

    return false;
  }

  /**
   * Update connection info
   */
  updateConnectionInfo(serverId: string, connected: boolean, error?: string): void {
    const metadata = this.getServerMetadata(serverId);
    if (!metadata) return;

    if (connected) {
      metadata.lastConnected = new Date().toISOString();
    } else {
      metadata.lastDisconnected = new Date().toISOString();
      if (error && metadata.statistics) {
        metadata.statistics.totalErrors++;
      }
    }

    this.metadata.set(serverId, metadata);

    if (this.autoSave) {
      this.scheduleSave();
    }
  }

  /**
   * Update usage statistics
   */
  updateStatistics(serverId: string, callDuration?: number): void {
    const metadata = this.getServerMetadata(serverId);
    if (!metadata) return;

    metadata.statistics ??= { totalCalls: 0, totalErrors: 0 };

    metadata.statistics.totalCalls++;
    metadata.statistics.lastUsed = new Date().toISOString();

    if (callDuration !== undefined) {
      const current = metadata.statistics.averageResponseTime ?? 0;
      const total = metadata.statistics.totalCalls;
      metadata.statistics.averageResponseTime = (current * (total - 1) + callDuration) / total;
    }

    this.metadata.set(serverId, metadata);

    if (this.autoSave) {
      this.scheduleSave();
    }
  }

  /**
   * Search for tools across all servers
   */
  searchTools(query: string): Array<{
    serverId: string;
    tool: Tool;
    metadata: StoredServerMetadata;
  }> {
    const results = [];
    const lowerQuery = query.toLowerCase();

    for (const [serverId, metadata] of this.metadata) {
      if (!metadata.tools) continue;

      for (const tool of metadata.tools) {
        if (
          tool.name.toLowerCase().includes(lowerQuery) ||
          tool.description.toLowerCase().includes(lowerQuery)
        ) {
          results.push({
            serverId,
            tool: tool as Tool,
            metadata
          });
        }
      }
    }

    return results;
  }

  /**
   * Get servers with specific capability
   */
  getServersWithCapability(capability: 'tools' | 'resources' | 'prompts'): string[] {
    const servers = [];

    for (const [serverId, metadata] of this.metadata) {
      if (metadata.capabilities?.[capability]) {
        servers.push(serverId);
      }
    }

    return servers;
  }

  /**
   * Clear metadata for a server
   */
  clearServerMetadata(serverId: string): void {
    this.metadata.delete(serverId);

    if (this.autoSave) {
      this.scheduleSave();
    }
  }

  /**
   * Save metadata to disk
   */
  save(): void {
    if (!this.metadataPath) return;

    const data = Object.fromEntries(this.metadata);
    const content = JSON.stringify(data, null, 2);

    writeFileSync(this.metadataPath, content, 'utf-8');
  }

  /**
   * Load metadata from disk
   */
  load(): void {
    if (!this.metadataPath || !existsSync(this.metadataPath)) {
      return;
    }

    try {
      const content = readFileSync(this.metadataPath, 'utf-8');
      const data = JSON.parse(content) as Record<string, StoredServerMetadata>;

      this.metadata = new Map(Object.entries(data));
    } catch {
      // Start with empty metadata on error
      this.metadata = new Map();
    }
  }

  /**
   * Export metadata
   */
  export(): Record<string, StoredServerMetadata> {
    return Object.fromEntries(this.metadata);
  }

  /**
   * Import metadata
   */
  import(data: Record<string, StoredServerMetadata>): void {
    this.metadata = new Map(Object.entries(data));

    if (this.autoSave) {
      this.scheduleSave();
    }
  }

  /**
   * Get metadata summary
   */
  getSummary(): {
    totalServers: number;
    serversWithTools: number;
    serversWithResources: number;
    serversWithPrompts: number;
    totalTools: number;
    totalResources: number;
    totalPrompts: number;
  } {
    let totalTools = 0;
    let totalResources = 0;
    let totalPrompts = 0;
    let serversWithTools = 0;
    let serversWithResources = 0;
    let serversWithPrompts = 0;

    for (const metadata of this.metadata.values()) {
      if (metadata.tools?.length) {
        serversWithTools++;
        totalTools += metadata.tools.length;
      }
      if (metadata.resources?.length) {
        serversWithResources++;
        totalResources += metadata.resources.length;
      }
      if (metadata.prompts?.length) {
        serversWithPrompts++;
        totalPrompts += metadata.prompts.length;
      }
    }

    return {
      totalServers: this.metadata.size,
      serversWithTools,
      serversWithResources,
      serversWithPrompts,
      totalTools,
      totalResources,
      totalPrompts
    };
  }

  // Private methods

  /**
   * Calculate hash for change detection
   */
  private calculateHash(data: unknown): string {
    const str = JSON.stringify(data);
    // Use stable cryptographic hash and trim for compactness. [REH][PA]
    return createHash('sha256').update(str).digest('hex').slice(0, 16);
  }

  /**
   * Schedule auto-save with debouncing
   */
  private scheduleSave(): void {
    if (this.saveTimer) {
      clearTimeout(this.saveTimer);
    }

    this.saveTimer = setTimeout(() => {
      try {
        this.save();
      } catch (error) {
        console.error('Failed to save metadata:', error);
      }
    }, this.saveDebounceMs);
  }

  /**
   * Cleanup resources
   */
  destroy(): void {
    if (this.saveTimer) {
      clearTimeout(this.saveTimer);
    }

    // Final save
    if (this.autoSave) {
      try {
        this.save();
      } catch {
        // Ignore errors on cleanup
      }
    }
  }
}
/**
 * @deprecated Use '@himorishige/hatago-hub-management/metadata-store.js'.
 * This in-repo implementation is retained for backward compatibility only.
 */
