/**
 * Smoke tests for minimal internal resource: hatago://servers
 */

import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { HatagoHub } from './hub.js';
import { setPlatform, resetPlatform } from '@himorishige/hatago-runtime/platform';
import { createNodePlatform } from '@himorishige/hatago-runtime/platform/node';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = fileURLToPath(new URL('.', import.meta.url));

describe('Internal Resource: hatago://servers', () => {
  let fixturePath: string;

  beforeAll(() => {
    // Initialize platform for potential child process use
    setPlatform(createNodePlatform());
    // From packages/hub/src → ../../test-fixtures == packages/test-fixtures
    fixturePath = join(__dirname, '../../test-fixtures/dist/stdio-server.js');
  });

  beforeEach(() => {
    // Ensure clean platform state between tests
    resetPlatform();
    setPlatform(createNodePlatform());
  });

  it('returns zero servers before any connection', async () => {
    const hub = new HatagoHub();
    try {
      await hub.start();

      const res = await hub.resources.read('hatago://servers');
      const text = (res as any).contents?.[0]?.text ?? '{}';
      const payload = JSON.parse(String(text));

      expect(payload).toBeDefined();
      expect(payload.total).toBeTypeOf('number');
      expect(payload.total).toBe(0);
      expect(Array.isArray(payload.servers)).toBe(true);
    } finally {
      await hub.stop();
    }
  });

  it('lists a server after connection', async () => {
    const hub = new HatagoHub({ namingStrategy: 'prefix', separator: '__' });
    try {
      await hub.start();

      await hub.addServer('test', {
        command: 'node',
        args: [fixturePath, '--echo'],
        connectTimeout: 10000
      });

      const res = await hub.resources.read('hatago://servers');
      const text = (res as any).contents?.[0]?.text ?? '{}';
      const payload = JSON.parse(String(text));

      expect(payload.total).toBe(1);
      expect(payload.servers?.[0]?.id).toBe('test');
      expect(payload.servers?.[0]?.status).toBe('connected');
      // Tools are prefixed by server id with chosen strategy
      expect(Array.isArray(payload.servers?.[0]?.tools)).toBe(true);
    } finally {
      await hub.stop();
    }
  });
});
