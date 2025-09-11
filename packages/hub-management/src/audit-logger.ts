/**
 * Audit logging system for security tracking (extracted)
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

export type AuditLogEntry = {
  id: string;
  timestamp: string;
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
  source: {
    type: 'mcp_tool' | 'api' | 'cli' | 'system';
    sessionId?: string;
    userId?: string;
    toolName?: string;
  };
  details: {
    serverId?: string;
    path?: string;
    changes?: unknown;
    error?: string;
    metadata?: Record<string, unknown>;
  };
  severity: 'info' | 'warning' | 'error' | 'critical';
};

export type AuditStats = {
  totalEvents: number;
  eventsByType: Record<string, number>;
  eventsBySeverity: Record<string, number>;
  recentEvents: AuditLogEntry[];
  lastEventTime?: string;
};

export class AuditLogger {
  private readonly logFilePath: string;
  private readonly maxFileSize: number;
  private readonly rotationCount: number;
  private cache: AuditLogEntry[] = [];
  private readonly maxCacheSize = 100;

  constructor(configFile: string, options: { maxFileSize?: number; rotationCount?: number } = {}) {
    this.logFilePath = configFile ? `${resolve(configFile)}.audit.log` : '';
    this.maxFileSize = options.maxFileSize ?? 10 * 1024 * 1024;
    this.rotationCount = options.rotationCount ?? 5;
    this.loadRecentEntries();
  }

  async log(
    eventType: AuditLogEntry['eventType'],
    source: AuditLogEntry['source'],
    details: AuditLogEntry['details'],
    severity?: AuditLogEntry['severity']
  ): Promise<void> {
    const entry: AuditLogEntry = {
      id: `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      timestamp: new Date().toISOString(),
      eventType,
      source,
      details,
      severity: severity ?? this.getSeverityForEvent(eventType)
    };
    this.cache.push(entry);
    if (this.cache.length > this.maxCacheSize) this.cache.shift();
    this.writeEntry(entry);
    this.rotateIfNeeded();
    // Ensure this async method contains an await for linting policy
    await Promise.resolve();
  }

  async logConfigRead(source: AuditLogEntry['source']): Promise<void> {
    await this.log('CONFIG_READ', source, { path: this.logFilePath.replace('.audit.log', '') });
  }
  async logConfigWrite(source: AuditLogEntry['source'], changes: unknown): Promise<void> {
    await this.log('CONFIG_WRITE', source, {
      path: this.logFilePath.replace('.audit.log', ''),
      changes
    });
  }
  async logServerStateChange(
    serverId: string,
    eventType: 'SERVER_ACTIVATED' | 'SERVER_DEACTIVATED',
    source: AuditLogEntry['source'],
    metadata?: Record<string, unknown>
  ): Promise<void> {
    await this.log(eventType, source, { serverId, metadata });
  }
  async logUnauthorizedAccess(
    path: string,
    source: AuditLogEntry['source'],
    error: string
  ): Promise<void> {
    await this.log('UNAUTHORIZED_ACCESS', source, { path, error }, 'critical');
  }

  async getStatistics(): Promise<AuditStats> {
    const allEntries = await this.getAllEntries();
    const stats: AuditStats = {
      totalEvents: allEntries.length,
      eventsByType: {},
      eventsBySeverity: {},
      recentEvents: this.cache.slice(-10),
      lastEventTime: allEntries[allEntries.length - 1]?.timestamp
    };
    for (const entry of allEntries) {
      stats.eventsByType[entry.eventType] = (stats.eventsByType[entry.eventType] ?? 0) + 1;
      stats.eventsBySeverity[entry.severity] = (stats.eventsBySeverity[entry.severity] ?? 0) + 1;
    }
    return stats;
  }

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
    if (options.eventTypes?.length)
      filtered = filtered.filter((e) => options.eventTypes?.includes(e.eventType));
    if (options.severities?.length)
      filtered = filtered.filter((e) => options.severities?.includes(e.severity));
    if (options.serverId)
      filtered = filtered.filter((e) => e.details.serverId === options.serverId);
    if (options.startTime !== undefined)
      filtered = filtered.filter((e) => e.timestamp >= (options.startTime as string));
    if (options.endTime !== undefined)
      filtered = filtered.filter((e) => e.timestamp <= (options.endTime as string));
    if (options.limit && options.limit > 0) filtered = filtered.slice(-options.limit);
    return filtered;
  }

  async getSecurityEvents(limit: number = 50): Promise<AuditLogEntry[]> {
    return this.query({ severities: ['warning', 'error', 'critical'], limit });
  }

  clear(): void {
    if (!this.logFilePath) return;
    this.cache = [];
    if (existsSync(this.logFilePath)) writeFileSync(this.logFilePath, '', 'utf-8');
  }

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

  private writeEntry(entry: AuditLogEntry): void {
    if (!this.logFilePath) return;
    const line = `${JSON.stringify(entry)}\n`;
    appendFileSync(this.logFilePath, line, 'utf-8');
  }

  private loadRecentEntries(): void {
    if (!this.logFilePath || !existsSync(this.logFilePath)) return;
    try {
      const content = readFileSync(this.logFilePath, 'utf-8');
      const lines = content
        .trim()
        .split('\n')
        .filter((l) => l);
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
      this.cache = [];
    }
  }

  private getAllEntries(): AuditLogEntry[] {
    if (!this.logFilePath || !existsSync(this.logFilePath)) return [];
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

  private rotateIfNeeded(): void {
    if (!this.logFilePath || !existsSync(this.logFilePath)) return;
    const stats = statSync(this.logFilePath);
    if (
      (stats as unknown as { size?: number }).size &&
      (stats as unknown as { size: number }).size < this.maxFileSize
    )
      return;

    for (let i = this.rotationCount - 1; i >= 0; i--) {
      const oldPath = i === 0 ? this.logFilePath : `${this.logFilePath}.${i}`;
      const newPath = `${this.logFilePath}.${i + 1}`;
      if (existsSync(oldPath)) {
        if (i === this.rotationCount - 1 && existsSync(newPath)) unlinkSync(newPath);
        renameSync(oldPath, newPath);
      }
    }
    writeFileSync(this.logFilePath, '', 'utf-8');
    this.cache = [];
  }

  async export(format: 'json' | 'csv' = 'json'): Promise<string> {
    const entries = await this.getAllEntries();
    if (format === 'json') return JSON.stringify(entries, null, 2);
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
