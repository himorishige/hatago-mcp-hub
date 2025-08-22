/**
 * Policy command - Manage access policies
 */

import type { Command } from 'commander';
import { loadConfig } from '../../config/loader.js';
import { sanitizeLog } from '../../utils/security.js';

export function createPolicyCommand(program: Command): void {
  program
    .command('policy')
    .description('Manage access policies')
    .option('-c, --config <path>', 'Path to config file')
    .option('--dry-run', 'Run in dry-run mode')
    .option('--stats', 'Show policy statistics')
    .action(async (options) => {
      try {
        const config = await loadConfig(options.config);

        // PolicyGateとAuditLoggerを作成
        const { PolicyGate, AuditLogger } = await import(
          '../../core/policy-gate.js'
        );
        const auditLogger = new AuditLogger({ outputToConsole: true });
        const policyGate = new PolicyGate(config.policy || {}, { auditLogger });

        if (options.stats) {
          // 統計情報を表示
          const stats = policyGate.getStats();
          console.log('\n🏨 === Policy Statistics ===');
          console.log(`Enabled: ${stats.enabled}`);
          console.log(`Dry Run: ${stats.dryRun}`);
          console.log(`Rule Count: ${stats.ruleCount}`);
          console.log(`Default Effect: ${stats.defaultEffect}`);

          const auditStats = auditLogger.getStats();
          console.log('\n=== Audit Statistics ===');
          console.log(`Total Entries: ${auditStats.totalEntries}`);
          console.log(`Allow Count: ${auditStats.allowCount}`);
          console.log(`Deny Count: ${auditStats.denyCount}`);
          console.log(`Dry Run Count: ${auditStats.dryRunCount}`);
        } else if (options.dryRun) {
          // ドライランモードを有効化
          const updatedConfig = {
            ...config.policy,
            dryRun: true,
          };
          policyGate.updateConfig(updatedConfig);
          console.log('Policy dry-run mode enabled');
        } else {
          // 現在のポリシー設定を表示
          const policyConfig = policyGate.getConfig();
          console.log('\n=== Policy Configuration ===');
          console.log(JSON.stringify(policyConfig, null, 2));
        }
      } catch (error) {
        const safeError = await sanitizeLog(String(error));
        console.error('Failed to manage policy:', safeError);
        process.exit(1);
      }
    });
}
