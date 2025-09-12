/**
 * Audit logging system for security tracking
 * Records all configuration changes and access attempts
 */

import {
  appendFileSync,
  existsSync,
  readFileSync,
  writeFileSync,
  statSync,
  unlinkSync,
  renameSync
} from 'node:fs';
import { resolve } from 'node:path';

/**
 * Audit log entry
 */
export type AuditLogEntry = {
  /** Unique ID for the log entry */
  id: string;

  /** Timestamp of the event */
  timestamp: string;

  /** Type of audit event */
  eventType:
    | 'CONFIG_READ'
    | 'CONFIG_WRITE'
    | 'CONFIG_VALIDATION_FAILED'
    | 'SERVER_ADDED'
    | 'SERVER_REMOVED'
    | 'SERVER_MODIFIED'
    | 'SERVER_ACTIVATED'
    | 'SERVER_DEACTIVATED'
    | 'UNAUTHORIZED_ACCESS'
    | 'ERROR'
    | 'TOOL_CALLED';

  /** Source of the change */
  source: {
    type: 'mcp_tool' | 'api' | 'cli' | 'system';
    sessionId?: string;
    userId?: string;
    toolName?: string;
  };

  /** Details of the event */
  details: {
    serverId?: string;
    path?: string;
    changes?: unknown;
    error?: string;
    metadata?: Record<string, unknown>;
  };

  /** Security impact level */
  severity: 'info' | 'warning' | 'error' | 'critical';
};

/**
 * Audit statistics
 */
export type AuditStats = {
  totalEvents: number;
  eventsByType: Record<string, number>;
  eventsBySeverity: Record<string, number>;
  recentEvents: AuditLogEntry[];
  lastEventTime?: string;
};

/**
 * Audit logger for tracking configuration changes
 */
export class AuditLogger {
  private readonly logFilePath: string;
  private readonly maxFileSize: number;
  private readonly rotationCount: number;
  private cache: AuditLogEntry[] = [];
  private readonly maxCacheSize = 100;

  constructor(
    configFile: string,
    options: {
      maxFileSize?: number;
      rotationCount?: number;
    } = {}
  ) {
    // Audit log is stored alongside config file
    this.logFilePath = configFile ? `${resolve(configFile)}.audit.log` : '';
    this.maxFileSize = options.maxFileSize ?? 10 * 1024 * 1024; // 10MB default
    this.rotationCount = options.rotationCount ?? 5;

    // Load recent entries into cache
    this.loadRecentEntries();
  }

  /**
   * Log an audit event
   */
  async log(
    eventType: AuditLogEntry['eventType'],
    source: AuditLogEntry['source'],
    details: AuditLogEntry['details'],
    severity?: AuditLogEntry['severity']
  ): Promise<void> {
    const entry: AuditLogEntry = {
      id: this.generateId(),
      timestamp: new Date().toISOString(),
      eventType,
      source,
      details,
      severity: severity ?? this.getSeverityForEvent(eventType)
    };

    // Add to cache
    this.cache.push(entry);
    if (this.cache.length > this.maxCacheSize) {
      this.cache.shift();
    }

    // Write to file
    await this.writeEntry(entry);

    // Check rotation
    await this.rotateIfNeeded();
  }

  /**
   * Log configuration read
   */
  async logConfigRead(source: AuditLogEntry['source']): Promise<void> {
    await this.log('CONFIG_READ', source, {
      path: this.logFilePath.replace('.audit.log', '')
    });
  }

  /**
   * Log configuration write
   */
  async logConfigWrite(source: AuditLogEntry['source'], changes: unknown): Promise<void> {
    await this.log('CONFIG_WRITE', source, {
      path: this.logFilePath.replace('.audit.log', ''),
      changes
    });
  }

  /**
   * Log server state change
   */
  async logServerStateChange(
    serverId: string,
    eventType: 'SERVER_ACTIVATED' | 'SERVER_DEACTIVATED',
    source: AuditLogEntry['source'],
    metadata?: Record<string, unknown>
  ): Promise<void> {
    await this.log(eventType, source, {
      serverId,
      metadata
    });
  }

  /**
   * Log unauthorized access attempt
   */
  async logUnauthorizedAccess(
    path: string,
    source: AuditLogEntry['source'],
    error: string
  ): Promise<void> {
    await this.log(
      'UNAUTHORIZED_ACCESS',
      source,
      {
        path,
        error
      },
      'critical'
    );
  }

  /**
   * Get audit statistics
   */
  async getStatistics(): Promise<AuditStats> {
    const allEntries = await this.getAllEntries();

    const stats: AuditStats = {
      totalEvents: allEntries.length,
      eventsByType: {},
      eventsBySeverity: {},
      recentEvents: this.cache.slice(-10),
      lastEventTime: allEntries[allEntries.length - 1]?.timestamp
    };

    // Count by type and severity
    for (const entry of allEntries) {
      stats.eventsByType[entry.eventType] = (stats.eventsByType[entry.eventType] ?? 0) + 1;
      stats.eventsBySeverity[entry.severity] = (stats.eventsBySeverity[entry.severity] ?? 0) + 1;
    }

    return stats;
  }

  /**
   * Query audit logs
   */
  async query(
    options: {
      eventTypes?: AuditLogEntry['eventType'][];
      severities?: AuditLogEntry['severity'][];
      serverId?: string;
      startTime?: string;
      endTime?: string;
      limit?: number;
    } = {}
  ): Promise<AuditLogEntry[]> {
    const allEntries = await this.getAllEntries();

    let filtered = allEntries;

    // Apply filters
    if (options.eventTypes?.length) {
      filtered = filtered.filter((e) => options.eventTypes?.includes(e.eventType));
    }

    if (options.severities?.length) {
      filtered = filtered.filter((e) => options.severities?.includes(e.severity));
    }

    if (options.serverId) {
      filtered = filtered.filter((e) => e.details.serverId === options.serverId);
    }

    if (options.startTime !== undefined) {
      const start = options.startTime;
      filtered = filtered.filter((e) => e.timestamp >= start);
    }

    if (options.endTime !== undefined) {
      const end = options.endTime;
      filtered = filtered.filter((e) => e.timestamp <= end);
    }

    // Apply limit
    if (options.limit && options.limit > 0) {
      filtered = filtered.slice(-options.limit);
    }

    return filtered;
  }

  /**
   * Get recent security events
   */
  async getSecurityEvents(limit: number = 50): Promise<AuditLogEntry[]> {
    return this.query({
      severities: ['warning', 'error', 'critical'],
      limit
    });
  }

  /**
   * Clear audit logs (for testing)
   */
  clear(): void {
    if (!this.logFilePath) return;

    this.cache = [];
    if (existsSync(this.logFilePath)) {
      writeFileSync(this.logFilePath, '', 'utf-8');
    }
  }

  // Private methods

  /**
   * Generate unique ID
   */
  private generateId(): string {
    return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Get default severity for event type
   */
  private getSeverityForEvent(eventType: AuditLogEntry['eventType']): AuditLogEntry['severity'] {
    switch (eventType) {
      case 'CONFIG_READ':
      case 'SERVER_ACTIVATED':
      case 'SERVER_DEACTIVATED':
        return 'info';

      case 'CONFIG_WRITE':
      case 'SERVER_ADDED':
      case 'SERVER_REMOVED':
      case 'SERVER_MODIFIED':
        return 'warning';

      case 'CONFIG_VALIDATION_FAILED':
      case 'ERROR':
        return 'error';

      case 'UNAUTHORIZED_ACCESS':
        return 'critical';

      default:
        return 'info';
    }
  }

  /**
   * Write entry to file
   */
  private writeEntry(entry: AuditLogEntry): void {
    if (!this.logFilePath) return;

    const line = `${JSON.stringify(entry)}\n`;
    appendFileSync(this.logFilePath, line, 'utf-8');
  }

  /**
   * Load recent entries into cache
   */
  private loadRecentEntries(): void {
    if (!this.logFilePath || !existsSync(this.logFilePath)) {
      return;
    }

    try {
      const content = readFileSync(this.logFilePath, 'utf-8');
      const lines = content
        .trim()
        .split('\n')
        .filter((l) => l);

      // Load last N entries
      const recent = lines.slice(-this.maxCacheSize);
      this.cache = recent
        .map((line) => {
          try {
            return JSON.parse(line) as AuditLogEntry;
          } catch {
            return null;
          }
        })
        .filter((e) => e !== null);
    } catch {
      // Ignore errors during cache loading
      this.cache = [];
    }
  }

  /**
   * Get all entries from file
   */
  private getAllEntries(): AuditLogEntry[] {
    if (!this.logFilePath || !existsSync(this.logFilePath)) {
      return [];
    }

    try {
      const content = readFileSync(this.logFilePath, 'utf-8');
      const lines = content
        .trim()
        .split('\n')
        .filter((l) => l);

      return lines
        .map((line) => {
          try {
            return JSON.parse(line) as AuditLogEntry;
          } catch {
            return null;
          }
        })
        .filter((e) => e !== null);
    } catch {
      return [];
    }
  }

  /**
   * Rotate log file if needed
   */
  private rotateIfNeeded(): void {
    if (!this.logFilePath || !existsSync(this.logFilePath)) {
      return;
    }

    const stats = statSync(this.logFilePath);
    if (stats.size < this.maxFileSize) {
      return;
    }

    // Rotate files
    for (let i = this.rotationCount - 1; i >= 0; i--) {
      const oldPath = i === 0 ? this.logFilePath : `${this.logFilePath}.${i}`;
      const newPath = `${this.logFilePath}.${i + 1}`;

      if (existsSync(oldPath)) {
        if (i === this.rotationCount - 1 && existsSync(newPath)) {
          // Delete oldest
          unlinkSync(newPath);
        }
        renameSync(oldPath, newPath);
      }
    }

    // Create new empty file
    writeFileSync(this.logFilePath, '', 'utf-8');

    // Clear cache after rotation
    this.cache = [];
  }

  /**
   * Export audit logs
   */
  async export(format: 'json' | 'csv' = 'json'): Promise<string> {
    const entries = await this.getAllEntries();

    if (format === 'json') {
      return JSON.stringify(entries, null, 2);
    }

    // CSV format
    const headers = [
      'id',
      'timestamp',
      'eventType',
      'severity',
      'sourceType',
      'sessionId',
      'userId',
      'toolName',
      'serverId',
      'path',
      'error'
    ];

    const rows = [headers.join(',')];

    for (const entry of entries) {
      const row = [
        entry.id,
        entry.timestamp,
        entry.eventType,
        entry.severity,
        entry.source.type,
        entry.source.sessionId ?? '',
        entry.source.userId ?? '',
        entry.source.toolName ?? '',
        entry.details.serverId ?? '',
        entry.details.path ?? '',
        entry.details.error ?? ''
      ];

      rows.push(row.map((v) => `"${v}"`).join(','));
    }

    return rows.join('\n');
  }
}
/**
 * @deprecated Use '@himorishige/hatago-hub-management/audit-logger.js'.
 * This in-repo implementation is retained for backward compatibility only.
 */
import { reportLegacyUsage } from '../utils/legacy-guard.js';
reportLegacyUsage('security', 'audit-logger');
