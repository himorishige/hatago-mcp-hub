/**
 * Configuration security checker using noren
 */

import { detectThreats, isContentSafe } from '@himorishige/noren';
import { sanitizeObject } from '../utils/security.js';

export interface SecurityIssue {
  field: string;
  risk: number;
  message: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
}

export interface SecurityCheckResult {
  safe: boolean;
  issues: SecurityIssue[];
  sanitizedConfig?: unknown;
}

/**
 * Determine severity level from risk score
 */
function getSeverity(risk: number): SecurityIssue['severity'] {
  if (risk >= 0.8) return 'critical';
  if (risk >= 0.6) return 'high';
  if (risk >= 0.3) return 'medium';
  return 'low';
}

/**
 * Check configuration for security issues
 */
export async function checkConfigSecurity(
  config: unknown,
): Promise<SecurityCheckResult> {
  const issues: SecurityIssue[] = [];

  // Convert config to string for pattern checking
  const configStr = JSON.stringify(config, null, 2);

  // Check overall content safety with noren
  const threats = await detectThreats(configStr);

  if (threats.risk > 0) {
    // Recursively check each field to identify specific issues
    await checkFieldRecursive(config, '', issues);
  }

  // Check for hardcoded credentials
  const credentialPatterns = [
    { pattern: /Bearer\s+[A-Za-z0-9\-._~+/]+=*/, name: 'Bearer token' },
    { pattern: /sk-[a-zA-Z0-9]{48}/, name: 'OpenAI API key' },
    { pattern: /ghp_[a-zA-Z0-9]{36}/, name: 'GitHub token' },
    { pattern: /npm_[a-zA-Z0-9]{36}/, name: 'NPM token' },
    { pattern: /[a-f0-9]{40}/, name: 'Potential API key/hash' },
  ];

  for (const { pattern, name } of credentialPatterns) {
    const matches = configStr.match(pattern);
    if (matches) {
      // Exclude common false positives (e.g., example values)
      const value = matches[0];
      if (!value.includes('example') && !value.includes('REDACTED')) {
        issues.push({
          field: 'configuration',
          risk: 0.9,
          message: `Hardcoded ${name} detected. Use environment variables instead.`,
          severity: 'critical',
        });
      }
    }
  }

  // Check for insecure URLs
  const urlMatches = configStr.matchAll(/"url"\s*:\s*"([^"]+)"/g);
  for (const match of urlMatches) {
    const url = match[1];

    // Check for HTTP usage (except localhost)
    if (
      url.startsWith('http://') &&
      !url.includes('localhost') &&
      !url.includes('127.0.0.1') &&
      !url.includes('0.0.0.0')
    ) {
      issues.push({
        field: 'url',
        risk: 0.4,
        message: `Insecure HTTP URL detected: ${url}. Consider using HTTPS.`,
        severity: 'medium',
      });
    }

    // Check URL safety with noren
    const urlSafe = await isContentSafe(url);
    if (!urlSafe) {
      const urlThreats = await detectThreats(url);
      issues.push({
        field: 'url',
        risk: urlThreats.risk,
        message: `Potentially unsafe URL detected: ${url}`,
        severity: getSeverity(urlThreats.risk),
      });
    }
  }

  // Check for dangerous environment variable names
  const dangerousEnvVars = [
    'LD_PRELOAD',
    'LD_LIBRARY_PATH',
    'DYLD_INSERT_LIBRARIES',
    'DYLD_LIBRARY_PATH',
  ];

  const envMatches = configStr.matchAll(/"env"\s*:\s*\{([^}]+)\}/g);
  for (const match of envMatches) {
    const envContent = match[1];
    for (const dangerous of dangerousEnvVars) {
      if (envContent.includes(dangerous)) {
        issues.push({
          field: 'env',
          risk: 0.7,
          message: `Dangerous environment variable ${dangerous} detected`,
          severity: 'high',
        });
      }
    }
  }

  // Sort issues by risk level (highest first)
  issues.sort((a, b) => b.risk - a.risk);

  return {
    safe:
      issues.filter((i) => i.severity === 'high' || i.severity === 'critical')
        .length === 0,
    issues,
    sanitizedConfig: sanitizeObject(config as Record<string, unknown>),
  };
}

/**
 * Recursively check fields for security issues
 */
async function checkFieldRecursive(
  obj: unknown,
  path: string,
  issues: SecurityIssue[],
): Promise<void> {
  if (typeof obj === 'string' && obj.length > 0) {
    // Skip checking common safe values
    if (obj === 'true' || obj === 'false' || /^\d+$/.test(obj)) {
      return;
    }

    const safe = await isContentSafe(obj);
    if (!safe) {
      const threats = await detectThreats(obj);

      // Only report if risk is significant
      if (threats.risk > 0.2) {
        issues.push({
          field: path || 'root',
          risk: threats.risk,
          message: `Potentially unsafe content detected`,
          severity: getSeverity(threats.risk),
        });
      }
    }
  } else if (Array.isArray(obj)) {
    for (let i = 0; i < obj.length; i++) {
      const newPath = path ? `${path}[${i}]` : `[${i}]`;
      await checkFieldRecursive(obj[i], newPath, issues);
    }
  } else if (typeof obj === 'object' && obj !== null) {
    for (const [key, value] of Object.entries(obj)) {
      const newPath = path ? `${path}.${key}` : key;
      await checkFieldRecursive(value, newPath, issues);
    }
  }
}

/**
 * Generate security report
 */
export function generateSecurityReport(result: SecurityCheckResult): string {
  if (result.safe) {
    return '✅ Configuration passed security check';
  }

  const lines: string[] = ['⚠️ Security issues detected in configuration:\n'];

  // Group by severity
  const bySeverity = result.issues.reduce(
    (acc, issue) => {
      if (!acc[issue.severity]) acc[issue.severity] = [];
      acc[issue.severity].push(issue);
      return acc;
    },
    {} as Record<string, SecurityIssue[]>,
  );

  const severityOrder: SecurityIssue['severity'][] = [
    'critical',
    'high',
    'medium',
    'low',
  ];

  for (const severity of severityOrder) {
    const severityIssues = bySeverity[severity];
    if (!severityIssues || severityIssues.length === 0) continue;

    const emoji = {
      critical: '🔴',
      high: '🟠',
      medium: '🟡',
      low: '🔵',
    }[severity];

    lines.push(
      `\n${emoji} ${severity.toUpperCase()} (${severityIssues.length}):`,
    );

    for (const issue of severityIssues) {
      lines.push(
        `  - [${issue.field}] ${issue.message} (risk: ${issue.risk.toFixed(2)})`,
      );
    }
  }

  return lines.join('\n');
}
