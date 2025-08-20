import { describe, expect, it } from 'vitest';
import {
  checkConfigSecurity,
  generateSecurityReport,
} from './security-checker.js';

describe('Security Checker', () => {
  describe('checkConfigSecurity', () => {
    it('should pass safe configuration', async () => {
      const config = {
        version: 1,
        logLevel: 'info',
        servers: [
          {
            id: 'test_server',
            type: 'local',
            command: 'node',
            args: ['server.js'],
          },
        ],
      };

      const result = await checkConfigSecurity(config);
      expect(result.safe).toBe(true);
      expect(result.issues).toHaveLength(0);
    });

    it('should detect hardcoded Bearer tokens', async () => {
      const config = {
        servers: [
          {
            id: 'api_server',
            auth: {
              token: 'Bearer sk-1234567890abcdef1234567890abcdef12345678',
            },
          },
        ],
      };

      const result = await checkConfigSecurity(config);
      expect(result.safe).toBe(false);
      expect(
        result.issues.some((i) => i.message.includes('Bearer token')),
      ).toBe(true);
      expect(result.issues.some((i) => i.severity === 'critical')).toBe(true);
    });

    it('should detect potential API keys', async () => {
      const config = {
        servers: [
          {
            env: {
              API_KEY: 'a1b2c3d4e5f6789012345678901234567890abcd',
            },
          },
        ],
      };

      const result = await checkConfigSecurity(config);
      expect(result.safe).toBe(false);
      expect(
        result.issues.some((i) => i.message.includes('Potential API key/hash')),
      ).toBe(true);
    });

    it('should detect GitHub tokens', async () => {
      const config = {
        env: {
          GH_TOKEN: 'ghp_1234567890abcdef1234567890abcdef1234',
        },
      };

      const result = await checkConfigSecurity(config);
      expect(result.safe).toBe(false);
      expect(
        result.issues.some((i) => i.message.includes('GitHub token')),
      ).toBe(true);
    });

    it('should detect insecure HTTP URLs', async () => {
      const config = {
        servers: [
          {
            id: 'remote',
            url: 'http://api.example.com/mcp',
          },
        ],
      };

      const result = await checkConfigSecurity(config);
      expect(result.safe).toBe(true); // HTTP is medium severity
      expect(
        result.issues.some((i) => i.message.includes('Insecure HTTP URL')),
      ).toBe(true);
      expect(result.issues.some((i) => i.severity === 'medium')).toBe(true);
    });

    it('should allow localhost HTTP URLs', async () => {
      const config = {
        servers: [
          {
            id: 'local',
            url: 'http://localhost:3000',
          },
          {
            id: 'local2',
            url: 'http://127.0.0.1:8080',
          },
        ],
      };

      const result = await checkConfigSecurity(config);
      const httpIssues = result.issues.filter((i) =>
        i.message.includes('Insecure HTTP'),
      );
      expect(httpIssues).toHaveLength(0);
    });

    it('should detect dangerous environment variables', async () => {
      const config = {
        env: {
          LD_PRELOAD: '/malicious/lib.so',
          NORMAL_VAR: 'value',
        },
      };

      const result = await checkConfigSecurity(config);
      expect(result.safe).toBe(false);
      expect(result.issues.some((i) => i.message.includes('LD_PRELOAD'))).toBe(
        true,
      );
      expect(result.issues.some((i) => i.severity === 'high')).toBe(true);
    });

    it('should ignore example and REDACTED values', async () => {
      const config = {
        servers: [
          {
            id: 'example',
            auth: {
              token: 'Bearer example-token-here',
            },
          },
          {
            id: 'redacted',
            auth: {
              token: 'Bearer [REDACTED]',
            },
          },
        ],
      };

      const result = await checkConfigSecurity(config);
      expect(
        result.issues.filter((i) => i.message.includes('Bearer token')),
      ).toHaveLength(0);
    });

    it('should provide sanitized config', async () => {
      const config = {
        servers: [
          {
            id: 'test',
            apiKey: 'secret-key-123',
            password: 'my-password',
          },
        ],
      };

      const result = await checkConfigSecurity(config);
      expect(result.sanitizedConfig).toBeDefined();
      // biome-ignore lint/suspicious/noExplicitAny: Test needs to access dynamic properties
      const sanitized = result.sanitizedConfig as any;
      expect(sanitized.servers[0].apiKey).toBe('[REDACTED]');
      expect(sanitized.servers[0].password).toBe('[REDACTED]');
    });
  });

  describe('generateSecurityReport', () => {
    it('should generate safe report', () => {
      const result = {
        safe: true,
        issues: [],
      };

      const report = generateSecurityReport(result);
      expect(report).toContain('✅');
      expect(report).toContain('passed security check');
    });

    it('should generate report with issues grouped by severity', () => {
      const result = {
        safe: false,
        issues: [
          {
            field: 'auth.token',
            risk: 0.9,
            message: 'Critical issue',
            severity: 'critical' as const,
          },
          {
            field: 'env.VAR',
            risk: 0.7,
            message: 'High issue',
            severity: 'high' as const,
          },
          {
            field: 'url',
            risk: 0.4,
            message: 'Medium issue',
            severity: 'medium' as const,
          },
          {
            field: 'config',
            risk: 0.2,
            message: 'Low issue',
            severity: 'low' as const,
          },
        ],
      };

      const report = generateSecurityReport(result);

      // Check for warning header
      expect(report).toContain('⚠️');
      expect(report).toContain('Security issues detected');

      // Check for severity sections
      expect(report).toContain('🔴 CRITICAL');
      expect(report).toContain('🟠 HIGH');
      expect(report).toContain('🟡 MEDIUM');
      expect(report).toContain('🔵 LOW');

      // Check for issue details
      expect(report).toContain('Critical issue');
      expect(report).toContain('High issue');
      expect(report).toContain('Medium issue');
      expect(report).toContain('Low issue');

      // Check for risk scores
      expect(report).toContain('0.90');
      expect(report).toContain('0.70');
      expect(report).toContain('0.40');
      expect(report).toContain('0.20');
    });

    it('should skip empty severity levels', () => {
      const result = {
        safe: false,
        issues: [
          {
            field: 'field',
            risk: 0.9,
            message: 'Critical only',
            severity: 'critical' as const,
          },
        ],
      };

      const report = generateSecurityReport(result);
      expect(report).toContain('🔴 CRITICAL');
      expect(report).not.toContain('🟠 HIGH');
      expect(report).not.toContain('🟡 MEDIUM');
      expect(report).not.toContain('🔵 LOW');
    });
  });
});
