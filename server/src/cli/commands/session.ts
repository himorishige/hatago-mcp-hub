/**
 * Session command - Manage sessions
 */

import type { Command } from 'commander';
import { loadConfig } from '../../config/loader.js';
import { sanitizeLog } from '../../utils/security.js';

export function createSessionCommand(program: Command): void {
  program
    .command('session')
    .description('Manage sessions')
    .option('-c, --config <path>', 'Path to config file')
    .option('--list', 'List active sessions')
    .option('--share <id>', 'Generate share token for session')
    .option('--join <token>', 'Join a shared session')
    .option('--clients <id>', 'Show connected clients for session')
    .option('--history <id>', 'Show session history')
    .action(async (options) => {
      try {
        const config = await loadConfig(options.config);

        // SharedSessionManagerを作成
        const { SharedSessionManager } = await import(
          '../../core/shared-session-manager.js'
        );
        const sessionManager = new SharedSessionManager(
          config.sessionSharing || {},
        );

        if (options.list) {
          // アクティブセッション一覧
          const sessions = await sessionManager.getActiveSessions();
          console.log('\n🏨 === Active Sessions ===');
          for (const { session, clients } of sessions) {
            const shared = clients.length > 1 ? ' [SHARED]' : '';
            console.log(`Session ${session.id}${shared}`);
            console.log(`  Created: ${session.createdAt.toISOString()}`);
            console.log(`  Clients: ${clients.length}`);
            console.log(`  History: ${session.history.length} entries`);
            if (session.sharedToken) {
              console.log(`  Token: ${session.sharedToken}`);
            }
          }

          // 統計情報
          const stats = sessionManager.getStats();
          console.log('\n🏨 === Statistics ===');
          console.log(`Total Sessions: ${stats.totalSessions}`);
          console.log(`Total Clients: ${stats.totalClients}`);
          console.log(`Shared Sessions: ${stats.sharedSessions}`);
          console.log(
            `Avg Clients/Session: ${stats.averageClientsPerSession.toFixed(2)}`,
          );
        } else if (options.share) {
          // セッション共有トークンを生成
          const { getRuntime } = await import(
            '../../runtime/runtime-factory.js'
          );
          const runtime = await getRuntime();
          const clientId = await runtime.idGenerator.generate(); // 仮のクライアントID
          await sessionManager.createSession(clientId);
          const token = await sessionManager.generateShareToken(
            options.share,
            clientId,
          );
          console.log(`\nShare token generated for session ${options.share}:`);
          console.log(`Token: ${token}`);
          console.log(
            `Expires: ${new Date(
              Date.now() +
                (config.sessionSharing?.tokenTtlSeconds || 86400) * 1000,
            ).toISOString()}`,
          );
          console.log('\nTo join this session, run:');
          console.log(`  hatago session --join ${token}`);
        } else if (options.join) {
          // 共有セッションに参加
          const { getRuntime } = await import(
            '../../runtime/runtime-factory.js'
          );
          const runtime = await getRuntime();
          const clientId = await runtime.idGenerator.generate();
          const sessionId = await sessionManager.joinSessionWithToken(
            options.join,
            clientId,
          );
          console.log(`Successfully joined session: ${sessionId}`);
          console.log(`Your client ID: ${clientId}`);
        } else if (options.clients) {
          // セッションのクライアント一覧
          const clients = await sessionManager.getConnectedClients(
            options.clients,
          );
          console.log(`\n🏨 === Clients for Session ${options.clients} ===`);
          for (const client of clients) {
            console.log(`Client ${client.id}`);
            console.log(`  Connected: ${client.connectedAt.toISOString()}`);
            console.log(`  Active: ${client.active}`);
          }
        } else if (options.history) {
          // セッションの履歴
          const session = await sessionManager.getSession(options.history);
          if (!session) {
            console.error(`Session ${options.history} not found`);
            process.exit(1);
          }
          console.log(`\n🏨 === History for Session ${options.history} ===`);
          for (const entry of session.history) {
            console.log(
              `[${entry.timestamp.toISOString()}] ${entry.type}: ${entry.action}`,
            );
          }
        } else {
          // デフォルト: アクティブセッション一覧
          const sessions = await sessionManager.getActiveSessions();
          console.log(`Active sessions: ${sessions.length}`);
        }
      } catch (error) {
        const safeError = await sanitizeLog(String(error));
        console.error('Failed to manage sessions:', safeError);
        process.exit(1);
      }
    });
}
