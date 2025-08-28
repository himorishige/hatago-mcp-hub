import type { Tool } from '@modelcontextprotocol/sdk/types.js';
import type { ToolMetadata } from '@hatago/core';
import {
  clearRegistry,
  clearServerTools,
  createRegistry,
  detectCollisions,
  getServerTools,
  getStats,
  getToolByName,
  registerServerTools,
  type ToolRegistryState,
} from './tool-registry-functional.js';
import type { ToolNamingConfig, ToolNamingStrategy } from './types.js';

// Tool name collision information
export interface ToolCollision {
  toolName: string;
  serverIds: string[];
}

// Tool registry options
export interface ToolRegistryOptions {
  namingConfig: ToolNamingConfig;
}

/**
 * Tool Registry - Tool name management and collision avoidance
 * Uses underscore (_) internally for Claude Code compatibility
 *
 * This is now a thin adapter over the functional core
 */
export class ToolRegistry {
  private state: ToolRegistryState;

  constructor(
    options: ToolRegistryOptions = {
      namingConfig: {
        strategy: 'namespace',
        separator: '_',
        format: '{serverId}_{toolName}',
      },
    },
  ) {
    this.state = createRegistry(options.namingConfig);
  }

  /**
   * サーバーのツールを登録
   */
  registerServerTools(serverId: string, tools: Tool[]): void {
    this.state = registerServerTools(this.state, serverId, tools);
  }

  /**
   * サーバーのツールをクリア
   */
  clearServerTools(serverId: string): void {
    this.state = clearServerTools(this.state, serverId);
  }

  /**
   * すべてのツールを取得
   */
  getAllTools(): Tool[] {
    // Get all tool metadata and return with public names
    const result: Tool[] = [];
    for (const metadata of this.state.tools.values()) {
      result.push({
        ...metadata.tool,
        name: metadata.publicName,
      });
    }
    return result;
  }

  /**
   * ツールを名前で取得
   */
  getTool(publicName: string): ToolMetadata | undefined {
    return getToolByName(this.state, publicName);
  }

  /**
   * サーバーのツールを取得
   */
  getServerTools(serverId: string): Tool[] {
    return getServerTools(this.state, serverId).map(({ tool, publicName }) => ({
      ...tool,
      name: publicName,
    }));
  }

  /**
   * ツール名から元のサーバーIDとツール名を解決
   */
  resolveTool(
    publicName: string,
  ): { serverId: string; originalName: string } | undefined {
    const metadata = getToolByName(this.state, publicName);
    if (!metadata) {
      return undefined;
    }

    return {
      serverId: metadata.serverId,
      originalName: metadata.originalName,
    };
  }

  /**
   * 衝突しているツールを検出
   */
  detectCollisions(): ToolCollision[] {
    const collisions = detectCollisions(this.state);
    const result: ToolCollision[] = [];

    for (const [toolName, serverIds] of collisions) {
      result.push({
        toolName,
        serverIds,
      });
    }

    return result;
  }

  /**
   * ツール数を取得
   */
  getToolCount(): number {
    return this.state.tools.size;
  }

  /**
   * サーバー数を取得
   */
  getServerCount(): number {
    return this.state.serverTools.size;
  }

  /**
   * デバッグ情報を取得
   */
  getDebugInfo(): {
    totalTools: number;
    totalServers: number;
    collisions: ToolCollision[];
    namingStrategy: ToolNamingStrategy;
    tools: Array<{
      publicName: string;
      serverId: string;
      originalName: string;
    }>;
  } {
    const stats = getStats(this.state);
    return {
      totalTools: stats.totalTools,
      totalServers: stats.serverCount,
      collisions: this.detectCollisions(),
      namingStrategy: this.state.namingConfig.strategy,
      tools: Array.from(this.state.tools.entries()).map(
        ([publicName, metadata]) => ({
          publicName,
          serverId: metadata.serverId,
          originalName: metadata.originalName,
        }),
      ),
    };
  }

  /**
   * すべてのツールとサーバー情報をクリア
   */
  clear(): void {
    this.state = clearRegistry(this.state);
  }
}
