/**
 * Tests for Serve Command
 */

import { Command } from 'commander';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { setupServeCommand } from './serve.js';

// Mock @himorishige/hatago-server
vi.mock('@himorishige/hatago-server', () => ({
  startServer: vi.fn()
}));

describe('setupServeCommand', () => {
  let program: Command;
  let consoleErrorSpy: any;
  let processExitSpy: any;

  beforeEach(() => {
    program = new Command();
    program.exitOverride(); // Prevent actual process exit

    consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    processExitSpy = vi.spyOn(process, 'exit').mockImplementation(() => {
      throw new Error('Process exit');
    });

    vi.clearAllMocks();
  });

  afterEach(() => {
    consoleErrorSpy.mockRestore();
    processExitSpy.mockRestore();
  });

  describe('Command Setup', () => {
    it('should register serve command', () => {
      setupServeCommand(program);

      const command = program.commands.find((cmd) => cmd.name() === 'serve');
      expect(command).toBeDefined();
      expect(command?.description()).toBe('Start the MCP Hub server');
    });

    it('should register all options', () => {
      setupServeCommand(program);

      const command = program.commands.find((cmd) => cmd.name() === 'serve');
      const options = command?.options.map((opt) => opt.flags);

      expect(options).toContain('-m, --mode <mode>');
      expect(options).toContain('-c, --config <path>');
      expect(options).toContain('-p, --port <port>');
      expect(options).toContain('-h, --host <host>');
      expect(options).toContain('--stdio');
      expect(options).toContain('--http');
      expect(options).toContain('--verbose');
      expect(options).toContain('--quiet');
    });
  });

  describe('Server Execution', () => {
    it('should start server with default options', async () => {
      const { startServer } = await import('@himorishige/hatago-server');
      setupServeCommand(program);

      await program.parseAsync(['serve'], { from: 'user' });

      expect(startServer).toHaveBeenCalledWith({
        mode: 'stdio',
        config: undefined,
        port: 3535,
        host: '127.0.0.1',
        logLevel: 'info',
        verbose: undefined,
        quiet: undefined
      });
    });

    it('should start server in HTTP mode', async () => {
      const { startServer } = await import('@himorishige/hatago-server');
      setupServeCommand(program);

      await program.parseAsync(['serve', '--http'], { from: 'user' });

      expect(startServer).toHaveBeenCalledWith(
        expect.objectContaining({
          mode: 'http'
        })
      );
    });

    it('should use custom port and host', async () => {
      const { startServer } = await import('@himorishige/hatago-server');
      setupServeCommand(program);

      await program.parseAsync(['serve', '--port', '8080', '--host', '0.0.0.0'], { from: 'user' });

      expect(startServer).toHaveBeenCalledWith(
        expect.objectContaining({
          port: 8080,
          host: '0.0.0.0'
        })
      );
    });

    it('should use custom config file', async () => {
      const { startServer } = await import('@himorishige/hatago-server');
      setupServeCommand(program);

      await program.parseAsync(['serve', '--config', 'custom.json'], {
        from: 'user'
      });

      expect(startServer).toHaveBeenCalledWith(
        expect.objectContaining({
          config: 'custom.json'
        })
      );
    });

    it('should set verbose log level', async () => {
      const { startServer } = await import('@himorishige/hatago-server');
      setupServeCommand(program);

      await program.parseAsync(['serve', '--verbose'], { from: 'user' });

      expect(startServer).toHaveBeenCalledWith(
        expect.objectContaining({
          logLevel: 'debug',
          verbose: true
        })
      );
    });

    it('should set quiet log level', async () => {
      const { startServer } = await import('@himorishige/hatago-server');
      setupServeCommand(program);

      await program.parseAsync(['serve', '--quiet'], { from: 'user' });

      expect(startServer).toHaveBeenCalledWith(
        expect.objectContaining({
          logLevel: 'error',
          quiet: true
        })
      );
    });

    it('should prefer --http flag over --mode', async () => {
      const { startServer } = await import('@himorishige/hatago-server');
      setupServeCommand(program);

      await program.parseAsync(['serve', '--mode', 'stdio', '--http'], {
        from: 'user'
      });

      expect(startServer).toHaveBeenCalledWith(
        expect.objectContaining({
          mode: 'http'
        })
      );
    });
  });

  describe('Error Handling', () => {
    it('should handle server start errors', async () => {
      const { startServer } = await import('@himorishige/hatago-server');
      vi.mocked(startServer).mockRejectedValue(new Error('Server error'));

      setupServeCommand(program);

      try {
        await program.parseAsync(['serve'], { from: 'user' });
      } catch (error) {
        // Process.exit will throw due to our mock
        expect(error).toBeDefined();
      }

      expect(consoleErrorSpy).toHaveBeenCalledWith('Failed to start server:', expect.any(Error));
      expect(processExitSpy).toHaveBeenCalledWith(1);
    });
  });
});
