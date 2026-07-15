/**
 * Integration test: per-server tool filter must actually apply through
 * connectServer → registerServerTools. This guards the wiring at hub.ts (the
 * spec.toolFilter argument) — unit tests of filterToolsByName alone do NOT.
 */

import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { HatagoHub } from './hub.js';
import { setPlatform, resetPlatform } from '@himorishige/hatago-runtime/platform';
import { createNodePlatform } from '@himorishige/hatago-runtime/platform/node';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = fileURLToPath(new URL('.', import.meta.url));

// With all feature flags the fixture exposes: echo, echo_object, stream_echo, slow, fail
const FIXTURE_ARGS = ['--echo', '--stream', '--slow', '--fail'];
const ALL_TOOLS = ['echo', 'echo_object', 'fail', 'slow', 'stream_echo'];

describe('Integration: per-server tool filter', () => {
  let fixturePath: string;

  beforeAll(() => {
    setPlatform(createNodePlatform());
    fixturePath = join(__dirname, '../../test-fixtures/dist/stdio-server.js');
  });

  beforeEach(() => {
    resetPlatform();
    setPlatform(createNodePlatform());
  });

  // Exposed names are prefixed with the server id; strip it to compare upstream names.
  function exposedOriginals(hub: HatagoHub): string[] {
    return (hub.tools.list() as Array<{ name: string }>)
      .map((t) => t.name.replace(/^test_/, ''))
      .sort();
  }

  async function connect(toolFilter?: unknown): Promise<HatagoHub> {
    const hub = new HatagoHub();
    await hub.start();
    await hub.addServer('test', {
      command: 'node',
      args: [fixturePath, ...FIXTURE_ARGS],
      connectTimeout: 10000,
      ...(toolFilter ? { toolFilter } : {})
    } as never);
    return hub;
  }

  it('with no filter, exposes every upstream tool (baseline)', async () => {
    const hub = await connect();
    try {
      expect(exposedOriginals(hub)).toEqual(ALL_TOOLS);
    } finally {
      await hub.stop();
    }
  });

  it('include exposes ONLY the listed tools', async () => {
    const hub = await connect({ include: ['echo', 'echo_object'] });
    try {
      expect(exposedOriginals(hub)).toEqual(['echo', 'echo_object']);
    } finally {
      await hub.stop();
    }
  });

  it('exclude hides the listed tools', async () => {
    const hub = await connect({ exclude: ['fail', 'slow', 'stream_echo'] });
    try {
      expect(exposedOriginals(hub)).toEqual(['echo', 'echo_object']);
    } finally {
      await hub.stop();
    }
  });

  it('overrides rename the exposed tool', async () => {
    const hub = await connect({ include: ['echo'], overrides: { echo: { name: 'renamed_echo' } } });
    try {
      expect(exposedOriginals(hub)).toEqual(['renamed_echo']);
    } finally {
      await hub.stop();
    }
  });
});
