/**
 * Tests for MCP Command
 */

import * as fs from 'node:fs';
import * as os from 'node:os';
import { Command } from 'commander';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { setupMcpCommand } from './mcp.js';

// Mock node modules
vi.mock('node:fs', () => ({
  existsSync: vi.fn(),
  readFileSync: vi.fn(),
  writeFileSync: vi.fn(),
  mkdirSync: vi.fn()
}));
vi.mock('node:os');

// Setup global require mock for dynamic imports
beforeAll(() => {
  if (typeof globalThis.require === 'undefined') {
    (globalThis as any).require = (module: string) => {
      if (module === 'node:fs') {
        return {
          mkdirSync: vi.fn(),
          existsSync: vi.fn(),
          readFileSync: vi.fn(),
          writeFileSync: vi.fn()
        };
      }
      return {};
    };
  }
});

describe('setupMcpCommand', () => {
  let program: Command;
  let consoleLogSpy: any;
  let consoleErrorSpy: any;
  let processExitSpy: any;

  beforeEach(() => {
    program = new Command();
    program.exitOverride();

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
    it('should register mcp command with subcommands', () => {
      setupMcpCommand(program);

      const mcpCommand = program.commands.find((cmd) => cmd.name() === 'mcp');
      expect(mcpCommand).toBeDefined();
      expect(mcpCommand?.description()).toBe('Manage MCP servers');

      const subcommands = mcpCommand?.commands.map((cmd) => cmd.name());
      expect(subcommands).toContain('list');
      expect(subcommands).toContain('add');
      expect(subcommands).toContain('remove');
    });
  });

  describe('List Command', () => {
    it('should show message when no servers configured', async () => {
      vi.mocked(fs.existsSync).mockReturnValue(false);

      setupMcpCommand(program);
      await program.parseAsync(['mcp', 'list'], { from: 'user' });

      expect(consoleLogSpy).toHaveBeenCalledWith('No MCP servers configured');
    });

    it('should list configured servers', async () => {
      const servers = [
        {
          id: 'test-server',
          type: 'local',
          command: 'node',
          args: ['server.js']
        },
        {
          id: 'remote-server',
          type: 'remote',
          url: 'https://example.com/mcp'
        }
      ];

      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify(servers));

      setupMcpCommand(program);
      await program.parseAsync(['mcp', 'list'], { from: 'user' });

      expect(consoleLogSpy).toHaveBeenCalledWith('Configured MCP servers:');
      expect(consoleLogSpy).toHaveBeenCalledWith('  test-server (local)');
      expect(consoleLogSpy).toHaveBeenCalledWith('    Command: node server.js');
      expect(consoleLogSpy).toHaveBeenCalledWith('  remote-server (remote)');
      expect(consoleLogSpy).toHaveBeenCalledWith('    URL: https://example.com/mcp');
    });

    it('should handle read errors gracefully', async () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockImplementation(() => {
        throw new Error('Read error');
      });

      setupMcpCommand(program);
      await program.parseAsync(['mcp', 'list'], { from: 'user' });

      expect(consoleErrorSpy).toHaveBeenCalledWith(
        'Error loading server configuration:',
        expect.any(Error)
      );
      expect(consoleLogSpy).toHaveBeenCalledWith('No MCP servers configured');
    });
  });

  describe('Add Command', () => {
    it('should add local server with command', async () => {
      // First call for loading servers, second for checking dir
      vi.mocked(fs.existsSync).mockReturnValueOnce(false).mockReturnValueOnce(true);
      vi.mocked(fs.writeFileSync).mockImplementation(() => {});

      setupMcpCommand(program);
      await program.parseAsync(['mcp', 'add', 'myserver', 'node', 'server.js'], { from: 'user' });

      expect(fs.writeFileSync).toHaveBeenCalledWith(
        '/home/user/.hatago/servers.json',
        expect.stringContaining('"id": "myserver"')
      );
      expect(consoleLogSpy).toHaveBeenCalledWith('Added MCP server "myserver"');
    });

    it('should add npx server', async () => {
      // First call for loading servers, second for checking dir
      vi.mocked(fs.existsSync).mockReturnValueOnce(false).mockReturnValueOnce(true);
      vi.mocked(fs.writeFileSync).mockImplementation(() => {});

      setupMcpCommand(program);
      await program.parseAsync(['mcp', 'add', 'npxserver', 'npx', '@example/server'], {
        from: 'user'
      });

      const savedData = JSON.parse(vi.mocked(fs.writeFileSync).mock.calls[0][1] as string);
      expect(savedData[0].type).toBe('npx');
      expect(savedData[0].command).toBe('npx');
      expect(savedData[0].args).toEqual(['@example/server']);
    });

    it('should add remote server with URL', async () => {
      // First call for loading servers, second for checking dir
      vi.mocked(fs.existsSync).mockReturnValueOnce(false).mockReturnValueOnce(true);
      vi.mocked(fs.writeFileSync).mockImplementation(() => {});

      setupMcpCommand(program);
      await program.parseAsync(['mcp', 'add', 'remote', '--url', 'https://example.com'], {
        from: 'user'
      });

      const savedData = JSON.parse(vi.mocked(fs.writeFileSync).mock.calls[0][1] as string);
      expect(savedData[0].type).toBe('remote');
      expect(savedData[0].url).toBe('https://example.com');
    });

    it('should error if server already exists', async () => {
      const existingServers = [{ id: 'existing', type: 'local', command: 'test' }];
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify(existingServers));

      setupMcpCommand(program);

      try {
        await program.parseAsync(['mcp', 'add', 'existing', 'node', 'server.js'], { from: 'user' });
      } catch (error) {
        expect(error).toBeDefined();
      }

      expect(consoleErrorSpy).toHaveBeenCalledWith('Server "existing" already exists');
      expect(processExitSpy).toHaveBeenCalledWith(1);
    });

    it('should error if neither URL nor command specified', async () => {
      vi.mocked(fs.existsSync).mockReturnValue(false);

      setupMcpCommand(program);

      try {
        await program.parseAsync(['mcp', 'add', 'invalid'], { from: 'user' });
      } catch (error) {
        expect(error).toBeDefined();
      }

      expect(consoleErrorSpy).toHaveBeenCalledWith('Either URL or command must be specified');
      expect(processExitSpy).toHaveBeenCalledWith(1);
    });

    it('should create config directory if not exists', async () => {
      // Both calls return false to trigger mkdir
      vi.mocked(fs.existsSync).mockReturnValue(false);
      vi.mocked(fs.mkdirSync).mockImplementation(() => undefined);
      vi.mocked(fs.writeFileSync).mockImplementation(() => {});

      setupMcpCommand(program);
      await program.parseAsync(['mcp', 'add', 'test', 'node', 'server.js'], {
        from: 'user'
      });

      // mkdirSync should be called with recursive option
      expect(fs.mkdirSync).toHaveBeenCalledWith('/home/user/.hatago', {
        recursive: true
      });
      expect(fs.writeFileSync).toHaveBeenCalled();
    });
  });

  describe('Remove Command', () => {
    it('should remove existing server', async () => {
      const servers = [
        { id: 'server1', type: 'local', command: 'test' },
        { id: 'server2', type: 'local', command: 'test' }
      ];

      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify(servers));
      vi.mocked(fs.writeFileSync).mockImplementation(() => {});

      setupMcpCommand(program);
      await program.parseAsync(['mcp', 'remove', 'server1'], { from: 'user' });

      const savedData = JSON.parse(vi.mocked(fs.writeFileSync).mock.calls[0][1] as string);
      expect(savedData).toHaveLength(1);
      expect(savedData[0].id).toBe('server2');
      expect(consoleLogSpy).toHaveBeenCalledWith('Removed MCP server "server1"');
    });

    it('should error if server not found', async () => {
      vi.mocked(fs.existsSync).mockReturnValue(false);

      setupMcpCommand(program);

      try {
        await program.parseAsync(['mcp', 'remove', 'nonexistent'], {
          from: 'user'
        });
      } catch (error) {
        expect(error).toBeDefined();
      }

      expect(consoleErrorSpy).toHaveBeenCalledWith('Server "nonexistent" not found');
      expect(processExitSpy).toHaveBeenCalledWith(1);
    });
  });

  describe('Error Handling', () => {
    it('should handle write errors', async () => {
      // First call for loading servers returns false, second for creating dir returns true
      vi.mocked(fs.existsSync).mockReturnValueOnce(false).mockReturnValueOnce(true);
      vi.mocked(fs.writeFileSync).mockImplementation(() => {
        throw new Error('Write error');
      });

      setupMcpCommand(program);

      try {
        await program.parseAsync(['mcp', 'add', 'test', 'node', 'server.js'], {
          from: 'user'
        });
      } catch (error) {
        expect(error).toBeDefined();
      }

      expect(consoleErrorSpy).toHaveBeenCalledWith(
        'Error saving server configuration:',
        expect.any(Error)
      );
      expect(processExitSpy).toHaveBeenCalledWith(1);
    });

    it('should handle invalid JSON in config file', async () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockReturnValue('invalid json');

      setupMcpCommand(program);
      await program.parseAsync(['mcp', 'list'], { from: 'user' });

      expect(consoleErrorSpy).toHaveBeenCalledWith(
        'Error loading server configuration:',
        expect.any(SyntaxError)
      );
    });
  });
});
