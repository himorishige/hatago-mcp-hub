/**
 * Smoke tests for HatagoManagementServer resources and prompts
 */

import { ServerState } from '@himorishige/hatago-core';
import { beforeEach, describe, expect, it, vi } from 'vitest';

// FS mock to control config loading
let CURRENT_CONFIG: any = {};
vi.mock('node:fs', () => ({
  existsSync: vi.fn(() => true),
  readFileSync: vi.fn(() => JSON.stringify(CURRENT_CONFIG))
}));

// Side-effectful layers stubbed
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

describe('HatagoManagementServer resources/prompts (smoke)', () => {
  beforeEach(() => {
    vi.resetModules();
  });

  async function createServerWithConfig(config: any) {
    CURRENT_CONFIG = config;

    const stateMachine = {
      getState: vi.fn((id: string) => (id === 's1' ? ServerState.ACTIVE : ServerState.INACTIVE)),
      getAllStates: vi.fn(
        () =>
          new Map([
            ['s1', ServerState.ACTIVE],
            ['s2', ServerState.INACTIVE]
          ])
      ),
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

    const { HatagoManagementServer } = await import('./hatago-management-server.js');
    const server = new HatagoManagementServer({
      configFilePath: '/fake/hatago.config.json',
      stateMachine,
      activationManager,
      idleManager,
      enableAudit: false
    });
    return { server, stateMachine };
  }

  it('reads config resource (hatago://config)', async () => {
    const cfg = {
      version: 1,
      servers: { s1: { url: 'https://x' } },
      adminMode: false
    };
    const { server } = await createServerWithConfig(cfg);
    const result = await server.handleResourceRead('hatago://config');
    expect(result).toMatchObject(cfg);
  });

  it('lists servers resource (hatago://servers)', async () => {
    const cfg = {
      servers: { s1: { url: 'https://x' }, s2: { command: 'node' } }
    };
    const { server } = await createServerWithConfig(cfg);
    const list = await server.handleResourceRead('hatago://servers');
    const ids = (list as any[]).map((s) => s.id).sort();
    expect(ids).toEqual(['s1', 's2']);
  });

  it('returns states resource (hatago://states)', async () => {
    const cfg = {
      servers: { s1: { url: 'https://x' }, s2: { command: 'node' } }
    };
    const { server } = await createServerWithConfig(cfg);
    const states = await server.handleResourceRead('hatago://states');
    expect(Object.keys(states)).toEqual(expect.arrayContaining(['s1']));
  });

  it('returns prompt text for configure_new_server (local)', async () => {
    const cfg = { servers: {} };
    const { server } = await createServerWithConfig(cfg);
    const txt = await server.handlePrompt('configure_new_server', {
      serverType: 'local'
    });
    expect(txt).toContain('local MCP server');
    expect(txt).toContain('Server ID');
  });
});
