/**
 * Smoke tests for server CLI entry
 * Focus: mode selection (stdio/http) and basic wiring
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Mocks for dependencies used by cli.ts
vi.mock('./config.js', () => ({
  loadConfig: vi.fn().mockResolvedValue({ sessions: {} }),
}));
vi.mock('./stdio.js', () => ({
  startStdio: vi.fn().mockResolvedValue(undefined),
}));
vi.mock('./http.js', () => ({
  startHttp: vi.fn().mockResolvedValue(undefined),
}));

describe('server/cli (smoke)', () => {
  let processExitSpy: any;
  let consoleErrorSpy: any;

  beforeEach(() => {
    vi.resetModules();
    processExitSpy = vi.spyOn(process, 'exit').mockImplementation(() => {
      throw new Error('Process exit');
    });
    consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    processExitSpy.mockRestore();
    consoleErrorSpy.mockRestore();
  });

  it('starts in STDIO mode by default', async () => {
    // Arrange parseArgs to return no flags
    vi.mock('./utils.js', () => ({
      parseArgs: vi.fn().mockReturnValue({ command: undefined, flags: {} }),
      generateDefaultConfig: vi.fn(),
    }));

    const { startStdio } = await import('./stdio.js');

    // Act: importing runs main()
    await import('./cli.js');

    // Assert
    expect(startStdio).toHaveBeenCalledTimes(1);
  });

  it('starts in HTTP mode when --http is set', async () => {
    vi.mock('./utils.js', () => ({
      parseArgs: vi.fn().mockReturnValue({
        command: undefined,
        flags: { http: true, host: '0.0.0.0', port: '8080' },
      }),
    }));

    const { startHttp } = await import('./http.js');

    await import('./cli.js');

    expect(startHttp).toHaveBeenCalledWith(
      expect.objectContaining({ host: '0.0.0.0', port: 8080 }),
    );
  });
});
