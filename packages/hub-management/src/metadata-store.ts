/**
 * Metadata persistence for disabled servers (extracted)
 */
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { createHash } from 'node:crypto';
import type { Prompt, Resource, ServerMetadata, Tool } from '@himorishige/hatago-core';

export type StoredServerMetadata = Partial<ServerMetadata> & {
  serverId: string;
  serverType: 'local' | 'npx' | 'http' | 'sse' | 'ws';
  lastUpdated: string;
  version?: string;
  toolsHash?: string;
  resourcesHash?: string;
  promptsHash?: string;
};

export class MetadataStore {
  private readonly metadataPath: string;
  private metadata: Map<string, StoredServerMetadata> = new Map();
  private readonly autoSave: boolean;
  private saveTimer?: NodeJS.Timeout;
  private readonly saveDebounceMs = 5000;

  constructor(configFilePath: string, autoSave = true) {
    this.metadataPath = configFilePath ? `${resolve(configFilePath)}.metadata.json` : '';
    this.autoSave = autoSave;
    this.load();
  }

  storeServerMetadata(serverId: string, metadata: Partial<StoredServerMetadata>): void {
    const existing = this.metadata.get(serverId) ?? {
      serverId,
      serverType: 'local' as const,
      lastUpdated: new Date().toISOString()
    };

    const updated: StoredServerMetadata = {
      ...existing,
      ...metadata,
      serverId,
      lastUpdated: new Date().toISOString()
    };

    if (updated.tools) updated.toolsHash = this.calculateHash(updated.tools);
    if (updated.resources) updated.resourcesHash = this.calculateHash(updated.resources);
    if (updated.prompts) updated.promptsHash = this.calculateHash(updated.prompts);

    this.metadata.set(serverId, updated);
    if (this.autoSave) this.scheduleSave();
  }

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

  async storeResources(serverId: string, resources: Resource[]): Promise<void> {
    await this.storeServerMetadata(serverId, {
      resources: resources.map((r) => ({ uri: r.uri, name: r.name, mimeType: r.mimeType })),
      capabilities: {
        tools: this.getServerMetadata(serverId)?.capabilities?.tools ?? false,
        resources: resources.length > 0,
        prompts: this.getServerMetadata(serverId)?.capabilities?.prompts ?? false
      }
    });
  }

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

  getServerMetadata(serverId: string): StoredServerMetadata | undefined {
    return this.metadata.get(serverId);
  }
  getAllMetadata(): Map<string, StoredServerMetadata> {
    return new Map(this.metadata);
  }
  getTools(serverId: string): Tool[] | undefined {
    return this.metadata.get(serverId)?.tools as Tool[] | undefined;
  }
  getResources(serverId: string): Resource[] | undefined {
    return this.metadata.get(serverId)?.resources as Resource[] | undefined;
  }
  getPrompts(serverId: string): Prompt[] | undefined {
    return this.metadata.get(serverId)?.prompts as Prompt[] | undefined;
  }

  hasCapabilitiesChanged(
    serverId: string,
    tools?: Tool[],
    resources?: Resource[],
    prompts?: Prompt[]
  ): boolean {
    const metadata = this.metadata.get(serverId);
    if (!metadata) return true;
    if (tools && this.calculateHash(tools) !== metadata.toolsHash) return true;
    if (resources && this.calculateHash(resources) !== metadata.resourcesHash) return true;
    if (prompts && this.calculateHash(prompts) !== metadata.promptsHash) return true;
    return false;
  }

  updateConnectionInfo(serverId: string, connected: boolean, error?: string): void {
    const metadata = this.getServerMetadata(serverId);
    if (!metadata) return;
    if (connected) {
      metadata.lastConnected = new Date().toISOString();
    } else {
      metadata.lastDisconnected = new Date().toISOString();
      if (error && metadata.statistics) metadata.statistics.totalErrors++;
    }
    this.metadata.set(serverId, metadata);
    if (this.autoSave) this.scheduleSave();
  }

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
    if (this.autoSave) this.scheduleSave();
  }

  searchTools(
    query: string
  ): Array<{ serverId: string; tool: Tool; metadata: StoredServerMetadata }> {
    const results: Array<{ serverId: string; tool: Tool; metadata: StoredServerMetadata }> = [];
    const lowerQuery = query.toLowerCase();
    for (const [serverId, metadata] of this.metadata) {
      if (!metadata.tools) continue;
      for (const tool of metadata.tools) {
        if (
          tool.name.toLowerCase().includes(lowerQuery) ||
          (tool.description ?? '').toLowerCase().includes(lowerQuery)
        ) {
          results.push({ serverId, tool: tool as Tool, metadata });
        }
      }
    }
    return results;
  }

  getServersWithCapability(capability: 'tools' | 'resources' | 'prompts'): string[] {
    const servers: string[] = [];
    for (const [serverId, metadata] of this.metadata) {
      if (metadata.capabilities?.[capability]) servers.push(serverId);
    }
    return servers;
  }

  clearServerMetadata(serverId: string): void {
    this.metadata.delete(serverId);
    if (this.autoSave) this.scheduleSave();
  }

  save(): void {
    if (!this.metadataPath) return;
    const data = Object.fromEntries(this.metadata);
    const content = JSON.stringify(data, null, 2);
    writeFileSync(this.metadataPath, content, 'utf-8');
  }

  load(): void {
    if (!this.metadataPath || !existsSync(this.metadataPath)) return;
    try {
      const content = readFileSync(this.metadataPath, 'utf-8');
      const data = JSON.parse(content) as Record<string, StoredServerMetadata>;
      this.metadata = new Map(Object.entries(data));
    } catch {
      this.metadata = new Map();
    }
  }

  export(): Record<string, StoredServerMetadata> {
    return Object.fromEntries(this.metadata);
  }
  import(data: Record<string, StoredServerMetadata>): void {
    this.metadata = new Map(Object.entries(data));
    if (this.autoSave) this.scheduleSave();
  }

  getSummary(): {
    totalServers: number;
    serversWithTools: number;
    serversWithResources: number;
    serversWithPrompts: number;
    totalTools: number;
    totalResources: number;
    totalPrompts: number;
  } {
    let totalTools = 0,
      totalResources = 0,
      totalPrompts = 0;
    let serversWithTools = 0,
      serversWithResources = 0,
      serversWithPrompts = 0;
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

  private calculateHash(data: unknown): string {
    const str = JSON.stringify(data);
    return createHash('sha256').update(str).digest('hex').slice(0, 16);
  }

  private scheduleSave(): void {
    if (this.saveTimer) clearTimeout(this.saveTimer);
    this.saveTimer = setTimeout(() => {
      try {
        this.save();
      } catch {
        console.error('Failed to save metadata');
      }
    }, this.saveDebounceMs);
  }

  destroy(): void {
    if (this.saveTimer) clearTimeout(this.saveTimer);
    if (this.autoSave) {
      try {
        this.save();
      } catch {
        /* no-op on shutdown */
      }
    }
  }
}
