/**
 * Node.js ProcessRunner implementation using child_process
 */
import { type ChildProcess, spawn } from 'node:child_process';
import { Readable, Writable } from 'node:stream';
import type { Process, ProcessRunner } from '../types.js';

/**
 * Node.js Process wrapper
 */
class NodeProcess implements Process {
  private child: ChildProcess;
  private _exitCode: Promise<number>;

  constructor(child: ChildProcess) {
    this.child = child;

    this._exitCode = new Promise((resolve, reject) => {
      child.on('exit', (code) => {
        resolve(code ?? -1);
      });
      child.on('error', reject);
    });
  }

  get pid(): number {
    return this.child.pid ?? -1;
  }

  get stdin(): WritableStream<Uint8Array> {
    return Writable.toWeb(this.child.stdin!) as WritableStream<Uint8Array>;
  }

  get stdout(): ReadableStream<Uint8Array> {
    return Readable.toWeb(this.child.stdout!) as ReadableStream<Uint8Array>;
  }

  get stderr(): ReadableStream<Uint8Array> {
    return Readable.toWeb(this.child.stderr!) as ReadableStream<Uint8Array>;
  }

  kill(signal?: string): void {
    this.child.kill(signal as NodeJS.Signals | undefined);
  }

  get exitCode(): Promise<number> {
    return this._exitCode;
  }
}

/**
 * Node.js ProcessRunner implementation
 */
export class NodeProcessRunner implements ProcessRunner {
  readonly supported = true;

  async run(
    command: string,
    args: string[],
    opts?: {
      cwd?: string;
      env?: Record<string, string>;
      stdin?: Uint8Array;
      timeout?: number;
    },
  ): Promise<{ code: number; stdout: Uint8Array; stderr: Uint8Array }> {
    return new Promise((resolve, reject) => {
      const child = spawn(command, args, {
        cwd: opts?.cwd,
        env: opts?.env ? { ...process.env, ...opts.env } : process.env,
        timeout: opts?.timeout,
      });

      const stdout: Buffer[] = [];
      const stderr: Buffer[] = [];

      child.stdout?.on('data', (chunk) => stdout.push(chunk));
      child.stderr?.on('data', (chunk) => stderr.push(chunk));

      if (opts?.stdin) {
        child.stdin?.write(opts.stdin);
        child.stdin?.end();
      }

      child.on('error', reject);

      child.on('exit', (code) => {
        resolve({
          code: code ?? -1,
          stdout: new Uint8Array(Buffer.concat(stdout)),
          stderr: new Uint8Array(Buffer.concat(stderr)),
        });
      });

      // Handle timeout
      if (opts?.timeout) {
        setTimeout(() => {
          child.kill('SIGKILL');
          reject(new Error(`Process timed out after ${opts.timeout}ms`));
        }, opts.timeout);
      }
    });
  }

  async spawn(
    command: string,
    args: string[],
    opts?: {
      cwd?: string;
      env?: Record<string, string>;
    },
  ): Promise<Process> {
    const child = spawn(command, args, {
      cwd: opts?.cwd,
      env: opts?.env ? { ...process.env, ...opts.env } : process.env,
      stdio: 'pipe',
    });

    return new NodeProcess(child);
  }
}

/**
 * Stub ProcessRunner for environments without process support
 */
export class StubProcessRunner implements ProcessRunner {
  readonly supported = false;

  async run(): Promise<{
    code: number;
    stdout: Uint8Array;
    stderr: Uint8Array;
  }> {
    throw new Error('Process execution is not supported in this environment');
  }
}
