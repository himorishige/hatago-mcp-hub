/**
 * Smoke tests for per-server instructions aggregated into initialize.instructions
 */

import { beforeEach, describe, expect, it } from 'vitest';
import { HatagoHub } from './hub.js';
import { setPlatform, resetPlatform } from '@himorishige/hatago-runtime/platform';
import { createNodePlatform } from '@himorishige/hatago-runtime/platform/node';

// Lazy servers so start() aggregates instructions without attempting a connection.
function config() {
  return {
    version: 1 as const,
    mcpServers: {
      'confluence-primary': {
        command: 'noop',
        hatagoOptions: { start: 'lazy' },
        instructions: 'For strategy questions, search this server first.'
      },
      'confluence-internal': {
        command: 'noop',
        hatagoOptions: { start: 'lazy' },
        instructions: 'Internal engineering Confluence.'
      },
      'disabled-one': {
        command: 'noop',
        disabled: true,
        instructions: 'Should not appear.'
      }
    }
  };
}

describe('initialize.instructions', () => {
  beforeEach(() => {
    resetPlatform();
    setPlatform(createNodePlatform());
  });

  it('aggregates active servers’ instructions (excluding disabled)', async () => {
    const hub = new HatagoHub({ preloadedConfig: { path: '/tmp/hatago.json', data: config() as never } });
    try {
      await hub.start();
      expect(hub.instructions).toBe(
        '## confluence-primary\nFor strategy questions, search this server first.\n\n' +
          '## confluence-internal\nInternal engineering Confluence.'
      );
      expect(hub.instructions).not.toContain('Should not appear');
    } finally {
      await hub.stop();
    }
  });

  it('includes instructions in the initialize result', async () => {
    const hub = new HatagoHub({ preloadedConfig: { path: '/tmp/hatago.json', data: config() as never } });
    try {
      await hub.start();
      const res = (await hub.handleJsonRpcRequest({
        jsonrpc: '2.0',
        id: 1,
        method: 'initialize',
        params: {}
      })) as { result?: { instructions?: string } };
      expect(res.result?.instructions).toContain('## confluence-primary');
      expect(res.result?.instructions).toContain('## confluence-internal');
    } finally {
      await hub.stop();
    }
  });

  it('omits the instructions field when no server defines any', async () => {
    const hub = new HatagoHub({
      preloadedConfig: {
        path: '/tmp/hatago.json',
        data: { version: 1, mcpServers: {} } as never
      }
    });
    try {
      await hub.start();
      expect(hub.instructions).toBe('');
      const res = (await hub.handleJsonRpcRequest({
        jsonrpc: '2.0',
        id: 1,
        method: 'initialize',
        params: {}
      })) as { result?: { instructions?: string } };
      expect(res.result?.instructions).toBeUndefined();
    } finally {
      await hub.stop();
    }
  });
});
