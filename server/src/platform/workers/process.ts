/**
 * Cloudflare Workers ProcessRunner implementation
 * Workers doesn't support child processes, so this is a stub implementation
 */
import type { ProcessHandle, ProcessRunner } from '../types.js';

/**
 * Stub process handle for Workers
 */
class WorkersProcessHandle implements ProcessHandle {
  readonly stdout = null;
  readonly stderr = null;
  readonly stdin = null;

  async wait(): Promise<number> {
    throw new Error('Process execution not supported in Workers environment');
  }

  kill(_signal?: string): void {
    throw new Error('Process execution not supported in Workers environment');
  }
}

/**
 * Stub process runner for Workers
 */
export class WorkersProcessRunner implements ProcessRunner {
  run(
    _command: string,
    _args?: string[],
    _options?: {
      cwd?: string;
      env?: Record<string, string>;
    },
  ): ProcessHandle {
    console.warn('Process execution not supported in Workers environment');
    return new WorkersProcessHandle();
  }
}
