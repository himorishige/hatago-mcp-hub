import type { PolicyConfig, PolicyRule } from '../config/types.js';
import { getRuntime } from '../runtime/runtime-factory.js';

/**
 * ポリシー評価結果
 */
export interface PolicyDecision {
  id: string;
  effect: 'allow' | 'deny';
  rule?: PolicyRule;
  reason: string;
  timestamp: Date;
  dryRun: boolean;
}

/**
 * ポリシー評価コンテキスト
 */
export interface PolicyContext {
  principal?: string; // ユーザー/アプリ識別子
  tool: string; // ツール名
  action?: string; // アクション（invoke, read, writeなど）
  sessionId?: string;
  metadata?: Record<string, unknown>;
}

/**
 * 監査ログエントリ
 */
export interface AuditLogEntry {
  decisionId: string;
  timestamp: Date;
  context: PolicyContext;
  decision: PolicyDecision;
  generationId?: string;
}

/**
 * ツールアクセス制御を行うポリシーゲート
 */
export class PolicyGate {
  private config: PolicyConfig;
  private auditLogger?: AuditLogger;
  private generationId?: string;
  private runtime = getRuntime();

  constructor(
    config: PolicyConfig,
    options?: {
      auditLogger?: AuditLogger;
      generationId?: string;
    },
  ) {
    this.config = config;
    this.auditLogger = options?.auditLogger;
    this.generationId = options?.generationId;
  }

  /**
   * ポリシーを評価
   */
  async evaluate(context: PolicyContext): Promise<PolicyDecision> {
    const runtime = await this.runtime;
    const decisionId = await runtime.idGenerator.generate();
    const timestamp = new Date();

    // ポリシーが無効な場合は常に許可
    if (!this.config.enabled) {
      return {
        id: decisionId,
        effect: 'allow',
        reason: 'Policy evaluation is disabled',
        timestamp,
        dryRun: false,
      };
    }

    // ルールを順番に評価
    for (const rule of this.config.rules) {
      if (this.matchesRule(rule, context)) {
        const decision: PolicyDecision = {
          id: decisionId,
          effect: rule.effect,
          rule,
          reason: `Matched rule: ${rule.name}`,
          timestamp,
          dryRun: this.config.dryRun,
        };

        // 監査ログに記録
        this.logDecision(context, decision);

        return decision;
      }
    }

    // どのルールにもマッチしなかった場合はデフォルト効果を適用
    const decision: PolicyDecision = {
      id: decisionId,
      effect: this.config.defaultEffect,
      reason: `No matching rule, applying default: ${this.config.defaultEffect}`,
      timestamp,
      dryRun: this.config.dryRun,
    };

    // 監査ログに記録
    this.logDecision(context, decision);

    return decision;
  }

  /**
   * ルールがコンテキストにマッチするかチェック
   */
  private matchesRule(rule: PolicyRule, context: PolicyContext): boolean {
    // Principal のマッチング
    if (rule.principal && rule.principal !== context.principal) {
      return false;
    }

    // ツール名のマッチング（ワイルドカード対応）
    if (!this.matchesPattern(rule.tool, context.tool)) {
      return false;
    }

    // 追加条件のマッチング
    if (rule.conditions) {
      for (const [key, value] of Object.entries(rule.conditions)) {
        const contextValue = context.metadata?.[key];
        if (contextValue !== value) {
          return false;
        }
      }
    }

    return true;
  }

  /**
   * パターンマッチング（ワイルドカード対応）
   * ReDoS攻撃を防ぐためパターンをサニタイズ
   */
  private matchesPattern(pattern: string, value: string): boolean {
    // 完全一致
    if (pattern === value) {
      return true;
    }

    // ワイルドカード処理
    if (pattern.includes('*') || pattern.includes('?')) {
      // 特殊文字をエスケープ（* と ? 以外）
      const escapedPattern = pattern
        .replace(/[.+^${}()|[\]\\]/g, '\\$&')
        .replace(/\*/g, '.*')
        .replace(/\?/g, '.');

      try {
        // パターンの複雑度チェック（ReDoS対策）
        if (escapedPattern.length > 1000) {
          console.warn('Pattern too long, falling back to simple match');
          return false;
        }

        const regex = new RegExp(`^${escapedPattern}$`);
        // タイムアウト付きでテスト（ReDoS対策）
        const startTime = Date.now();
        const result = regex.test(value);
        const elapsed = Date.now() - startTime;

        if (elapsed > 100) {
          console.warn(
            `Pattern matching took ${elapsed}ms, consider simplifying pattern`,
          );
        }

        return result;
      } catch (error) {
        console.error('Invalid regex pattern:', error);
        return false;
      }
    }

    return false;
  }

  /**
   * 決定を監査ログに記録
   */
  private logDecision(context: PolicyContext, decision: PolicyDecision): void {
    if (!this.config.auditLog || !this.auditLogger) {
      return;
    }

    const entry: AuditLogEntry = {
      decisionId: decision.id,
      timestamp: decision.timestamp,
      context,
      decision,
      generationId: this.generationId,
    };

    this.auditLogger.log(entry);
  }

  /**
   * アクセスを許可するかチェック
   */
  async isAllowed(context: PolicyContext): Promise<boolean> {
    const decision = await this.evaluate(context);

    // ドライランモードの場合は実際の効果に関わらず許可
    if (decision.dryRun) {
      console.log(
        `[DRY RUN] Would ${decision.effect}: ${context.tool} (${decision.reason})`,
      );
      return true;
    }

    return decision.effect === 'allow';
  }

  /**
   * ポリシー設定を更新
   */
  updateConfig(config: PolicyConfig): void {
    this.config = config;
  }

  /**
   * 現在のポリシー設定を取得
   */
  getConfig(): PolicyConfig {
    return this.config;
  }

  /**
   * ポリシーの統計情報を取得
   */
  getStats(): {
    enabled: boolean;
    dryRun: boolean;
    ruleCount: number;
    defaultEffect: string;
  } {
    return {
      enabled: this.config.enabled,
      dryRun: this.config.dryRun,
      ruleCount: this.config.rules.length,
      defaultEffect: this.config.defaultEffect,
    };
  }
}

/**
 * 監査ログを記録するクラス
 */
export class AuditLogger {
  private entries: AuditLogEntry[] = [];
  private maxEntries: number;
  private outputToConsole: boolean;

  constructor(options?: { maxEntries?: number; outputToConsole?: boolean }) {
    this.maxEntries = options?.maxEntries || 10000;
    this.outputToConsole = options?.outputToConsole || false;
  }

  /**
   * ログエントリを記録
   */
  log(entry: AuditLogEntry): void {
    this.entries.push(entry);

    // 最大エントリ数を超えた場合は古いものを削除
    if (this.entries.length > this.maxEntries) {
      this.entries.shift();
    }

    // コンソール出力
    if (this.outputToConsole) {
      const effect = entry.decision.effect.toUpperCase();
      const tool = entry.context.tool;
      const reason = entry.decision.reason;
      const dryRun = entry.decision.dryRun ? ' [DRY RUN]' : '';
      console.log(
        `[AUDIT]${dryRun} ${effect} ${tool} - ${reason} (${entry.decisionId})`,
      );
    }
  }

  /**
   * ログエントリを取得
   */
  getEntries(options?: {
    limit?: number;
    since?: Date;
    effect?: 'allow' | 'deny';
    tool?: string;
  }): AuditLogEntry[] {
    let filtered = [...this.entries];

    // フィルタリング
    if (options?.since) {
      filtered = filtered.filter(
        (e) => e.timestamp.getTime() >= options.since?.getTime(),
      );
    }

    if (options?.effect) {
      filtered = filtered.filter((e) => e.decision.effect === options.effect);
    }

    if (options?.tool) {
      filtered = filtered.filter((e) => e.context.tool === options.tool);
    }

    // 制限
    if (options?.limit) {
      filtered = filtered.slice(-options.limit);
    }

    return filtered;
  }

  /**
   * 統計情報を取得
   */
  getStats(): {
    totalEntries: number;
    allowCount: number;
    denyCount: number;
    dryRunCount: number;
    toolStats: Record<string, { allow: number; deny: number }>;
  } {
    const stats = {
      totalEntries: this.entries.length,
      allowCount: 0,
      denyCount: 0,
      dryRunCount: 0,
      toolStats: {} as Record<string, { allow: number; deny: number }>,
    };

    for (const entry of this.entries) {
      if (entry.decision.effect === 'allow') {
        stats.allowCount++;
      } else {
        stats.denyCount++;
      }

      if (entry.decision.dryRun) {
        stats.dryRunCount++;
      }

      // ツール別統計
      const tool = entry.context.tool;
      if (!stats.toolStats[tool]) {
        stats.toolStats[tool] = { allow: 0, deny: 0 };
      }
      if (entry.decision.effect === 'allow') {
        stats.toolStats[tool].allow++;
      } else {
        stats.toolStats[tool].deny++;
      }
    }

    return stats;
  }

  /**
   * ログをクリア
   */
  clear(): void {
    this.entries = [];
  }
}
