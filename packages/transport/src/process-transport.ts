/**
 * Process-based transport for Node.js (stdio)
 */

import { type ChildProcess, spawn } from 'node:child_process';
import type { ITransport, ProcessTransportOptions } from './types.js';

/**
 * Process transport using stdio for communication
 */
export class ProcessTransport implements ITransport {
  private process?: ChildProcess;
  private messageHandler?: (message: any) => void;
  private errorHandler?: (error: Error) => void;
  private options: ProcessTransportOptions;
  private isStarted = false;
  private readBuffer = '';

  constructor(options: ProcessTransportOptions) {
    this.options = options;
  }

  async send(message: any): Promise<void> {
    if (!this.process || !this.process.stdin) {
      throw new Error('Transport not started or stdin not available');
    }

    const json = `${JSON.stringify(message)}\n`;

    return new Promise((resolve, reject) => {
      this.process?.stdin?.write(json, (error) => {
        if (error) {
          reject(error);
        } else {
          resolve();
        }
      });
    });
  }

  onMessage(handler: (message: any) => void): void {
    this.messageHandler = handler;
  }

  onError(handler: (error: Error) => void): void {
    this.errorHandler = handler;
  }

  async start(): Promise<void> {
    if (this.isStarted) {
      throw new Error('Transport already started');
    }

    this.process = spawn(this.options.command, this.options.args || [], {
      env: { ...process.env, ...this.options.env },
      cwd: this.options.cwd,
      stdio: ['pipe', 'pipe', 'pipe'],
    });

    this.isStarted = true;

    // Handle stdout
    this.process.stdout?.on('data', (data) => {
      this.readBuffer += data.toString();
      this.processReadBuffer();
    });

    // Handle stderr
    this.process.stderr?.on('data', (data) => {
      console.error(`[ProcessTransport] stderr: ${data.toString()}`);
    });

    // Handle process errors
    this.process.on('error', (error) => {
      this.errorHandler?.(error);
    });

    // Handle process exit
    this.process.on('exit', (code, signal) => {
      this.isStarted = false;
      if (code !== 0) {
        this.errorHandler?.(
          new Error(`Process exited with code ${code}, signal ${signal}`),
        );
      }
    });
  }

  async close(): Promise<void> {
    if (this.process) {
      this.process.kill();
      this.process = undefined;
      this.isStarted = false;
    }
  }

  async ready(): Promise<boolean> {
    return this.isStarted && this.process !== undefined;
  }

  private processReadBuffer(): void {
    // Process all complete messages (newline-delimited)
    const lines = this.readBuffer.split('\n');
    this.readBuffer = lines.pop() || ''; // Keep incomplete line in buffer

    for (const line of lines) {
      if (!line.trim()) continue; // Skip empty lines

      try {
        const parsed = JSON.parse(line);
        this.messageHandler?.(parsed);
      } catch (error) {
        console.error(
          '[ProcessTransport] Failed to parse message:',
          error,
          'Line:',
          line,
        );
      }
    }
  }
}
