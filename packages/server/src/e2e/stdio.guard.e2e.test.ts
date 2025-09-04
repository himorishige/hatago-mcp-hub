/**
 * STDIO guard smoke test
 * - Verifies that startServer in STDIO mode rejects when config file is missing
 */

import { describe, expect, it } from 'vitest';

import { startServer } from '../index.js';

describe('server/stdio config guard (smoke)', () => {
  it('throws ENOENT when config file does not exist', async () => {
    // Use a surely-nonexistent path
    const missingPath = `./__definitely_missing__/hatago.config.${Date.now()}.json`;

    await expect(
      startServer({ mode: 'stdio', config: missingPath, logLevel: 'silent' })
    ).rejects.toMatchObject({ code: 'ENOENT' });
  });
});
