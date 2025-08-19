import type { Tool } from '@modelcontextprotocol/sdk/types.js';
import type { ToolNamingConfig, ToolNamingStrategy } from '../config/types.js';

// ツールのメタデータ
export interface ToolMetadata {
  serverId: string;
  originalName: string;
  publicName: string;
  tool: Tool;
}

// ツール名の衝突情報
export interface ToolCollision {
  toolName: string;
  serverIds: string[];
}

// ツールレジストリのオプション
export interface ToolRegistryOptions {
  namingConfig: ToolNamingConfig;
}

/**
 * ツールレジストリ - ツール名の管理と衝突回避
 * Claude Code互換のため、内部的にはアンダースコア(_)を使用
 */
export class ToolRegistry {
  private tools = new Map<string, ToolMetadata>();
  private serverTools = new Map<string, Set<string>>();
  private namingConfig: ToolNamingConfig;

  constructor(options: ToolRegistryOptions) {
    this.namingConfig = options.namingConfig;
  }

  /**
   * サーバーのツールを登録
   */
  registerServerTools(serverId: string, tools: Tool[]): void {
    // 既存のツールをクリア
    this.clearServerTools(serverId);

    // サーバーのツールセットを初期化
    const toolSet = new Set<string>();
    this.serverTools.set(serverId, toolSet);

    // 各ツールを登録
    for (const tool of tools) {
      const publicName = this.generatePublicName(serverId, tool.name);

      // 衝突チェック
      if (
        this.namingConfig.strategy === 'error' &&
        this.tools.has(publicName)
      ) {
        const existing = this.tools.get(publicName);
        if (!existing) continue;
        if (existing.serverId !== serverId) {
          throw new Error(
            `Tool name collision: ${publicName} already exists from server ${existing.serverId}`,
          );
        }
      }

      // ツールメタデータを保存
      const metadata: ToolMetadata = {
        serverId,
        originalName: tool.name,
        publicName,
        tool,
      };

      this.tools.set(publicName, metadata);
      toolSet.add(publicName);
    }
  }

  /**
   * サーバーのツールをクリア
   */
  clearServerTools(serverId: string): void {
    const toolSet = this.serverTools.get(serverId);
    if (toolSet) {
      for (const publicName of toolSet) {
        this.tools.delete(publicName);
      }
      this.serverTools.delete(serverId);
    }
  }

  /**
   * 公開名を生成
   * Claude Code互換のため、必ずアンダースコアを使用
   */
  private generatePublicName(serverId: string, toolName: string): string {
    // エイリアスが定義されているか確認
    const aliasKey = `${serverId}_${toolName}`;
    if (this.namingConfig.aliases?.[aliasKey]) {
      return this.namingConfig.aliases[aliasKey];
    }

    // 名前空間戦略の場合
    if (this.namingConfig.strategy === 'namespace') {
      // フォーマット文字列を使用
      let publicName = this.namingConfig.format || '{serverId}_{toolName}';
      publicName = publicName.replace('{serverId}', serverId);
      publicName = publicName.replace('{toolName}', toolName);

      // ドットをアンダースコアに置換（Claude Code互換性）
      publicName = publicName.replace(/\./g, '_');

      return publicName;
    }

    // エイリアス戦略の場合、短い名前を試みる
    if (this.namingConfig.strategy === 'alias') {
      // まずツール名そのものを試す
      if (!this.tools.has(toolName)) {
        return toolName;
      }
      // 衝突している場合は名前空間を付与
      return `${serverId}_${toolName}`.replace(/\./g, '_');
    }

    // デフォルトは名前空間付き
    return `${serverId}_${toolName}`.replace(/\./g, '_');
  }

  /**
   * すべてのツールを取得
   */
  getAllTools(): Tool[] {
    return Array.from(this.tools.values()).map((metadata) => ({
      ...metadata.tool,
      name: metadata.publicName, // 公開名を使用
    }));
  }

  /**
   * ツールを名前で取得
   */
  getTool(publicName: string): ToolMetadata | undefined {
    return this.tools.get(publicName);
  }

  /**
   * サーバーのツールを取得
   */
  getServerTools(serverId: string): Tool[] {
    const toolSet = this.serverTools.get(serverId);
    if (!toolSet) {
      return [];
    }

    return Array.from(toolSet)
      .map((publicName) => this.tools.get(publicName))
      .filter((metadata): metadata is ToolMetadata => metadata !== undefined)
      .map((metadata) => ({
        ...metadata.tool,
        name: metadata.publicName,
      }));
  }

  /**
   * ツール名から元のサーバーIDとツール名を解決
   */
  resolveTool(
    publicName: string,
  ): { serverId: string; originalName: string } | undefined {
    const metadata = this.tools.get(publicName);
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
    const collisions = new Map<string, Set<string>>();

    for (const [_publicName, metadata] of this.tools) {
      const originalName = metadata.originalName;
      if (!collisions.has(originalName)) {
        collisions.set(originalName, new Set());
      }
      collisions.get(originalName)?.add(metadata.serverId);
    }

    const result: ToolCollision[] = [];
    for (const [toolName, serverIds] of collisions) {
      if (serverIds.size > 1) {
        result.push({
          toolName,
          serverIds: Array.from(serverIds),
        });
      }
    }

    return result;
  }

  /**
   * ツール数を取得
   */
  getToolCount(): number {
    return this.tools.size;
  }

  /**
   * サーバー数を取得
   */
  getServerCount(): number {
    return this.serverTools.size;
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
    return {
      totalTools: this.getToolCount(),
      totalServers: this.getServerCount(),
      collisions: this.detectCollisions(),
      namingStrategy: this.namingConfig.strategy,
      tools: Array.from(this.tools.entries()).map(([publicName, metadata]) => ({
        publicName,
        serverId: metadata.serverId,
        originalName: metadata.originalName,
      })),
    };
  }
}
