/**
 * Tests for Config Command
 */

import * as fs from 'node:fs';
import * as os from 'node:os';
import { Command } from 'commander';
import {
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest';
import { setupConfigCommand } from './config.js';

// Mock node modules
vi.mock('node:fs', () => ({
  existsSync: vi.fn(),
  readFileSync: vi.fn(),
  writeFileSync: vi.fn(),
  mkdirSync: vi.fn(),
}));
vi.mock('node:os');

// Setup global require mock for dynamic imports used in saveConfig
beforeAll(() => {
  if (typeof globalThis.require === 'undefined') {
    (globalThis as any).require = (module: string) => {
      if (module === 'node:fs') {
        return {
          mkdirSync: vi.fn(),
          existsSync: vi.fn(),
          readFileSync: vi.fn(),
          writeFileSync: vi.fn(),
        };
      }
      return {};
    };
  }
});

describe('setupConfigCommand', () => {
  let program: Command;
  let consoleLogSpy: any;
  let consoleErrorSpy: any;
  let processExitSpy: any;

  beforeEach(() => {
    program = new Command();
    program.exitOverride(); // avoid Commander exiting the process

    consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    processExitSpy = vi.spyOn(process, 'exit').mockImplementation(() => {
      throw new Error('Process exit');
    });

    // Mock homedir
    vi.mocked(os.homedir).mockReturnValue('/home/user');

    vi.clearAllMocks();
  });

  afterEach(() => {
    consoleLogSpy.mockRestore();
    consoleErrorSpy.mockRestore();
    processExitSpy.mockRestore();
  });

  describe('Command Setup', () => {
    it('should register config command with subcommands', () => {
      setupConfigCommand(program);

      const configCommand = program.commands.find(
        (cmd) => cmd.name() === 'config',
      );
      expect(configCommand).toBeDefined();
      expect(configCommand?.description()).toBe('Manage Hatago configuration');

      const subcommands = configCommand?.commands.map((cmd) => cmd.name());
      expect(subcommands).toContain('show');
      expect(subcommands).toContain('set');
      expect(subcommands).toContain('get');
      expect(subcommands).toContain('reset');
    });
  });

  describe('Show Command', () => {
    it('should print default configuration when file does not exist', async () => {
      vi.mocked(fs.existsSync).mockReturnValue(false);

      setupConfigCommand(program);
      await program.parseAsync(['config', 'show'], { from: 'user' });

      expect(consoleLogSpy).toHaveBeenCalledWith('Current configuration:');
      // Default config includes port 3000 and host 127.0.0.1
      expect(consoleLogSpy).toHaveBeenCalledWith(
        expect.stringContaining('"port": 3000'),
      );
      expect(consoleLogSpy).toHaveBeenCalledWith(
        expect.stringContaining('"host": "127.0.0.1"'),
      );
    });

    it('should handle read errors and print empty object', async () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockImplementation(() => {
        throw new Error('read error');
      });

      setupConfigCommand(program);
      await program.parseAsync(['config', 'show'], { from: 'user' });

      expect(consoleErrorSpy).toHaveBeenCalledWith(
        'Error loading configuration:',
        expect.any(Error),
      );
      expect(consoleLogSpy).toHaveBeenCalledWith('Current configuration:');
      expect(consoleLogSpy).toHaveBeenCalledWith('{}');
    });
  });

  describe('Set Command', () => {
    it('should set nested key and write file (JSON number)', async () => {
      // loadConfig path: file not exists -> default config
      // saveConfig path: dir exists -> no mkdir
      vi.mocked(fs.existsSync)
        .mockReturnValueOnce(false) // loadConfig file check
        .mockReturnValueOnce(true); // saveConfig dir check

      const writeSpy = vi.mocked(fs.writeFileSync);
      writeSpy.mockImplementation(() => {});

      setupConfigCommand(program);
      await program.parseAsync(['config', 'set', 'session.timeout', '1234'], {
        from: 'user',
      });

      expect(writeSpy).toHaveBeenCalledWith(
        '/home/user/.hatago/config.json',
        expect.any(String),
      );

      const [, content] = writeSpy.mock.calls[0] as [string, string];
      const saved = JSON.parse(content);
      expect(saved.session.timeout).toBe(1234);
      // default remains when not touched
      expect(saved.session.maxSessions).toBe(100);
    });

    it('should set string value when JSON.parse fails', async () => {
      vi.mocked(fs.existsSync)
        .mockReturnValueOnce(false) // loadConfig file check
        .mockReturnValueOnce(true); // saveConfig dir check
      const writeSpy = vi.mocked(fs.writeFileSync);
      writeSpy.mockImplementation(() => {});

      setupConfigCommand(program);
      await program.parseAsync(['config', 'set', 'host', '0.0.0.0'], {
        from: 'user',
      });

      const [, content] = writeSpy.mock.calls[0] as [string, string];
      const saved = JSON.parse(content);
      expect(saved.host).toBe('0.0.0.0');
    });

    it('should exit on invalid key path', async () => {
      vi.mocked(fs.existsSync)
        .mockReturnValueOnce(false) // loadConfig file check
        .mockReturnValueOnce(true); // saveConfig dir check

      setupConfigCommand(program);
      await expect(
        program.parseAsync(['config', 'set', '', 'value'], { from: 'user' }),
      ).rejects.toThrow('Process exit');
    });

    it('should handle save errors gracefully (exit 1)', async () => {
      vi.mocked(fs.existsSync)
        .mockReturnValueOnce(false) // loadConfig file check
        .mockReturnValueOnce(true); // saveConfig dir check

      vi.mocked(fs.writeFileSync).mockImplementation(() => {
        throw new Error('write error');
      });

      setupConfigCommand(program);
      await expect(
        program.parseAsync(['config', 'set', 'port', '8080'], { from: 'user' }),
      ).rejects.toThrow('Process exit');

      expect(consoleErrorSpy).toHaveBeenCalledWith(
        'Error saving configuration:',
        expect.any(Error),
      );
    });
  });

  describe('Get Command', () => {
    it('should get nested key value', async () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockReturnValue(
        JSON.stringify({ session: { timeout: 4321 } }),
      );

      setupConfigCommand(program);
      await program.parseAsync(['config', 'get', 'session.timeout'], {
        from: 'user',
      });

      expect(consoleLogSpy).toHaveBeenCalledWith('4321');
    });

    it('should print not found for missing key', async () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockReturnValue(
        JSON.stringify({ port: 3000 }),
      );

      setupConfigCommand(program);
      await program.parseAsync(['config', 'get', 'session.timeout'], {
        from: 'user',
      });

      expect(consoleLogSpy).toHaveBeenCalledWith(
        'Key "session.timeout" not found',
      );
    });

    it('should get deep nested session.maxSessions value', async () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockReturnValue(
        JSON.stringify({ session: { timeout: 1000, maxSessions: 42 } }),
      );

      setupConfigCommand(program);
      await program.parseAsync(['config', 'get', 'session.maxSessions'], {
        from: 'user',
      });

      expect(consoleLogSpy).toHaveBeenCalledWith('42');
    });
  });

  describe('Reset Command', () => {
    it('should write default configuration', async () => {
      // saveConfig dir check
      vi.mocked(fs.existsSync).mockReturnValue(true);
      const writeSpy = vi.mocked(fs.writeFileSync);
      writeSpy.mockImplementation(() => {});

      setupConfigCommand(program);
      await program.parseAsync(['config', 'reset'], { from: 'user' });

      expect(writeSpy).toHaveBeenCalledWith(
        '/home/user/.hatago/config.json',
        expect.any(String),
      );
      const [, content] = writeSpy.mock.calls[0] as [string, string];
      const saved = JSON.parse(content);
      expect(saved).toMatchObject({
        port: 3000,
        host: '127.0.0.1',
        session: { timeout: 3600000, maxSessions: 100 },
      });
    });
  });
});
