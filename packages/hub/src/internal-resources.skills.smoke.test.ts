/**
 * Smoke tests for per-server skill:// resources
 * (config `skills` on a server → skill://<serverId>/<name>)
 */

import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { HatagoHub } from './hub.js';
import { setPlatform, resetPlatform } from '@himorishige/hatago-runtime/platform';
import { createNodePlatform } from '@himorishige/hatago-runtime/platform/node';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';

const __dirname = fileURLToPath(new URL('.', import.meta.url));

describe('Per-server Resource: skill://', () => {
  let tmpDir: string;
  let fixturePath: string;

  beforeAll(async () => {
    setPlatform(createNodePlatform());
    fixturePath = join(__dirname, '../../test-fixtures/dist/stdio-server.js');

    tmpDir = await mkdtemp(join(tmpdir(), 'hatago-skills-smoke-'));
    await writeFile(
      join(tmpDir, 'demo-skill.md'),
      [
        '---',
        'name: demo-skill',
        'description: A demo skill for smoke testing',
        '---',
        '',
        '# Demo Skill\n\nThis is the body of the demo skill.'
      ].join('\n')
    );

    // Directory-per-skill bundle with a companion file (the routing-index.json case)
    const bundleDir = join(tmpDir, 'kb-router');
    await mkdir(join(bundleDir, 'references'), { recursive: true });
    await writeFile(
      join(bundleDir, 'SKILL.md'),
      ['---', 'name: kb-router', 'description: Routes questions', '---', '', 'Body'].join('\n')
    );
    await writeFile(join(bundleDir, 'routing-index.json'), '{"routes":["a","b"]}');
    await writeFile(join(bundleDir, 'references', 'notes.md'), '# Notes');
  });

  afterAll(async () => {
    await rm(tmpDir, { recursive: true, force: true });
  });

  beforeEach(() => {
    resetPlatform();
    setPlatform(createNodePlatform());
  });

  it('registers a server-namespaced skill resource and serves its content', async () => {
    const hub = new HatagoHub({
      preloadedConfig: { path: join(tmpDir, 'hatago.json'), data: { version: 1, mcpServers: {} } as never }
    });
    try {
      await hub.start();
      await hub.addServer('confluence-primary', {
        command: 'node',
        args: [fixturePath, '--echo'],
        connectTimeout: 10000,
        skillsPath: '.'
      });

      const resources = hub.resources.list() as Array<{
        uri: string;
        name: string;
        description: string;
        mimeType?: string;
      }>;

      const skill = resources.find((r) => r.uri === 'skill://confluence-primary/demo-skill');
      expect(skill).toBeDefined();
      expect(skill?.name).toBe('demo-skill');
      expect(skill?.description).toBe('A demo skill for smoke testing');
      expect(skill?.mimeType).toBe('text/markdown');

      // Appears under the owning server in the hatago://servers manifest
      const manifest = (await hub.resources.read('hatago://servers')) as {
        contents: Array<{ text: string }>;
      };
      const payload = JSON.parse(manifest.contents[0]!.text);
      const server = payload.servers.find((s: { id: string }) => s.id === 'confluence-primary');
      expect(server.resources).toContain('skill://confluence-primary/demo-skill');

      // Body is served on read
      const res = (await hub.resources.read('skill://confluence-primary/demo-skill')) as {
        contents: Array<{ text: string }>;
      };
      expect(res.contents[0]?.text).toBe('# Demo Skill\n\nThis is the body of the demo skill.');

      // Companion files are listed alongside their SKILL.md, with correct mime types
      const routing = resources.find(
        (r) => r.uri === 'skill://confluence-primary/kb-router/routing-index.json'
      );
      expect(routing).toBeDefined();
      expect(routing?.mimeType).toBe('application/json');
      const nested = resources.find(
        (r) => r.uri === 'skill://confluence-primary/kb-router/references/notes.md'
      );
      expect(nested?.mimeType).toBe('text/markdown');

      // And are readable by URI, returning the file's own mime type + content
      const routingRead = (await hub.resources.read(
        'skill://confluence-primary/kb-router/routing-index.json'
      )) as { contents: Array<{ text: string; mimeType?: string }> };
      expect(routingRead.contents[0]?.mimeType).toBe('application/json');
      expect(routingRead.contents[0]?.text).toBe('{"routes":["a","b"]}');
    } finally {
      await hub.stop();
    }
  });

  it('drops a server’s skills when the server is removed', async () => {
    const hub = new HatagoHub({
      preloadedConfig: { path: join(tmpDir, 'hatago.json'), data: { version: 1, mcpServers: {} } as never }
    });
    try {
      await hub.start();
      await hub.addServer('confluence-primary', {
        command: 'node',
        args: [fixturePath, '--echo'],
        connectTimeout: 10000,
        skillsPath: '.'
      });

      await hub.removeServer('confluence-primary');

      const resources = hub.resources.list() as Array<{ uri: string }>;
      expect(resources.find((r) => r.uri === 'skill://confluence-primary/demo-skill')).toBeUndefined();
      await expect(hub.resources.read('skill://confluence-primary/demo-skill')).rejects.toThrow();
    } finally {
      await hub.stop();
    }
  });

  it('throws when reading a nonexistent skill URI', async () => {
    const hub = new HatagoHub({
      preloadedConfig: { path: join(tmpDir, 'hatago.json'), data: { version: 1, mcpServers: {} } as never }
    });
    try {
      await hub.start();
      await expect(hub.resources.read('skill://confluence-primary/nonexistent')).rejects.toThrow();
    } finally {
      await hub.stop();
    }
  });
});
