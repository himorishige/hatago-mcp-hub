/**
 * Smoke tests for HatagoManagementServer
 * Focused on regression of critical features only
 */

import { ServerState } from '@himorishige/hatago-core';
import { beforeEach, describe, expect, it, vi } from 'vitest';

// Mock FS to control initial config loading
let CURRENT_CONFIG: any = {};
vi.mock('node:fs', () => ({
  existsSync: vi.fn(() => true),
  readFileSync: vi.fn(() => JSON.stringify(CURRENT_CONFIG))
}));

// Stub security modules that have side effects
vi.mock('../security/audit-logger.js', () => ({
  AuditLogger: class {
    async log() {}
    async logConfigRead() {}
    async logConfigWrite() {}
    async getStatistics() {
      return {};
    }
    async query() {
      return [];
    }
    async logServerStateChange() {}
  }
}));
vi.mock('../security/file-guard.js', () => ({
  FileAccessGuard: class {
    async previewChanges() {
      return { validation: { valid: true, errors: [] }, impacts: [] };
    }
    async safeWrite() {}
  }
}));

describe('HatagoManagementServer (smoke)', () => {
  beforeEach(() => {
    vi.resetModules();
  });

  async function createServerWithConfig(config: any) {
    CURRENT_CONFIG = config;

    // Minimal stub
    const stateMachine = {
      getState: vi.fn((id: string) => (id === 's1' ? ServerState.ACTIVE : ServerState.INACTIVE)),
      getAllStates: vi.fn(() => new Map([['s1', ServerState.ACTIVE]])),
      canActivate: vi.fn(() => true)
    } as any;

    const activationManager = {
      getActivationHistory: vi.fn(() => []),
      activate: vi.fn(async () => ({
        success: true,
        serverId: 's1',
        state: ServerState.ACTIVE
      })),
      deactivate: vi.fn(async () => ({
        success: true,
        serverId: 's1',
        state: ServerState.INACTIVE
      })),
      registerServer: vi.fn(),
      resetServer: vi.fn(async () => ({}))
    } as any;

    const idleManager = {
      getActivityStats: vi.fn(() => ({
        totalCalls: 0,
        startTime: Date.now(),
        referenceCount: 0
      })),
      getAllActivities: vi.fn(
        () => new Map([['s1', { totalCalls: 0, startTime: Date.now(), referenceCount: 0 }]])
      ),
      stopIdleServers: vi.fn(async () => new Map([['s1', { stopped: true }]]))
    } as any;

    // Reflect module mocks via dynamic import
    const { HatagoManagementServer } = await import('./hatago-management-server.js');
    const server = new HatagoManagementServer({
      configFilePath: '/fake/hatago.config.json',
      stateMachine,
      activationManager,
      idleManager,
      enableAudit: false
    });
    return { server, stateMachine, activationManager, idleManager };
  }

  it('exposes simplified management tools', async () => {
    const cfg = { version: 1, servers: { s1: { url: 'https://x' } } };
    const { server } = await createServerWithConfig(cfg);
    const tools = server.getTools().map((t: any) => t.name);

    expect(tools).toContain('hatago_get_config');
    expect(tools).toContain('hatago_list_servers');
    expect(tools).toContain('hatago_get_server_states');
  });

  it('returns summary config via tool call', async () => {
    const cfg = {
      version: 1,
      mcpServers: { s1: { command: 'node', args: ['srv.js'] } },
      servers: { s2: { url: 'https://remote' } },
      adminMode: true
    };
    const { server } = await createServerWithConfig(cfg);

    const result = await server.handleToolCall('hatago_get_config', {
      format: 'summary'
    });
    expect(result.serverCount).toBe(2);
    expect(result.adminMode).toBe(true);
  });

  it('lists only active servers when filtered', async () => {
    const cfg = {
      servers: { s1: { url: 'https://x' }, s2: { command: 'node' } }
    };
    const { server } = await createServerWithConfig(cfg);

    const list = await server.handleToolCall('hatago_list_servers', {
      filter: 'active'
    });
    const ids = list.map((s: any) => s.id);
    expect(ids).toEqual(['s1']);
  });

  it('returns optimization and diagnostic prompts (smoke)', async () => {
    const cfg = {
      servers: { s1: { url: 'https://x', activationPolicy: 'manual' } }
    };
    const { server } = await createServerWithConfig(cfg);

    const diag = await server.handlePrompt('diagnose_server_issues', {
      serverId: 's1'
    });
    expect(diag).toContain('diagnostic');
    expect(diag).toContain('Suggested actions');

    const opt = await server.handlePrompt('optimize_server_policies', {});
    expect(opt).toContain('Optimization suggestions');
  });
});
