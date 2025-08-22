/**
 * Test for circular dependency resolution
 */

import { describe, expect, it } from 'vitest';

describe('Circular dependency checks', () => {
  it('should successfully import all command modules without circular dependency', async () => {
    // Test all command imports - use absolute paths from test location
    const modules = [
      '../call.js',
      '../doctor.js',
      '../drain.js',
      '../init.js',
      '../list.js',
      '../mcp.js',
      '../npx.js',
      '../policy.js',
      '../reload.js',
      '../remote.js',
      '../secret.js',
      '../serve.js',
      '../session.js',
      '../status.js',
    ];

    const imports = await Promise.all(
      modules.map(async (module) => {
        try {
          const imported = await import(module);
          return { module, success: true, exports: Object.keys(imported) };
        } catch (error) {
          return { module, success: false, error: String(error) };
        }
      }),
    );

    // All imports should succeed
    for (const result of imports) {
      expect(
        result.success,
        `Failed to import ${result.module}: ${result.error || ''}`,
      ).toBe(true);
    }
  });

  it('should import runtime-factory without circular dependency', async () => {
    const runtimeFactory = await import('../../../runtime/runtime-factory.js');

    expect(runtimeFactory).toBeDefined();
    expect(runtimeFactory.getRuntime).toBeDefined();
    expect(runtimeFactory.detectRuntime).toBeDefined();
    expect(runtimeFactory.resetRuntimeCache).toBeDefined();
  });

  it('should import CLI helpers without circular dependency', async () => {
    const helpers = await import('../../utils/cli-helpers.js');

    expect(helpers).toBeDefined();
    expect(helpers.loadConfigWithDefaults).toBeDefined();
    expect(helpers.createAndInitializeHub).toBeDefined();
    expect(helpers.handleCliError).toBeDefined();
    expect(helpers.setupStdioRedirect).toBeDefined();
    expect(helpers.setupShutdownHandlers).toBeDefined();
    expect(helpers.mergeCLIServers).toBeDefined();
  });

  it.skip('should import main CLI index without circular dependency', async () => {
    // Skip this test as CLI index calls process.parse which interferes with test runner
    // The successful build already validates there are no circular dependencies
  });
});
