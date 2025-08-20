/**
 * NPX MCP Server implementation for dynamic package execution
 */

import { type ChildProcess, spawn } from 'node:child_process';
import { EventEmitter } from 'node:events';
import type { NpxServerConfig } from '../config/types.js';
import { getRuntime } from '../runtime/types.js';

/**
 * Server state enum
 */
export enum ServerState {
  STOPPED = 'stopped',
  STARTING = 'starting',
  RUNNING = 'running',
  STOPPING = 'stopping',
  CRASHED = 'crashed',
}

/**
 * NPX MCP Server for spawning and managing MCP servers via npx
 */
export class NpxMcpServer extends EventEmitter {
  private config: NpxServerConfig;
  private process: ChildProcess | null = null;
  private state: ServerState = ServerState.STOPPED;
  private restartCount = 0;
  private lastStartTime: Date | null = null;
  private shutdownRequested = false;
  private runtime = getRuntime();
  private startPromise: Promise<void> | null = null;
  private stopPromise: Promise<void> | null = null;
  private initRequestId = '';

  // Default configuration
  private readonly defaults = {
    restartDelayMs: 1000,
    maxRestarts: 3,
    timeout: 30000,
    initTimeoutMs: 10000, // MCP initialization timeout
  };

  constructor(config: NpxServerConfig) {
    super();
    this.config = {
      ...this.defaults,
      ...config,
    };
  }

  /**
   * Get server ID
   */
  getId(): string {
    return this.config.id;
  }

  /**
   * Get server state
   */
  getState(): ServerState {
    return this.state;
  }

  /**
   * Get server configuration
   */
  getConfig(): NpxServerConfig {
    return this.config;
  }

  /**
   * Start the NPX server
   */
  async start(): Promise<void> {
    // Return existing start promise if already starting
    if (this.startPromise) {
      return this.startPromise;
    }

    // Check if already running
    if (this.state === ServerState.RUNNING) {
      return;
    }

    // Check if in invalid state
    if (
      this.state !== ServerState.STOPPED &&
      this.state !== ServerState.CRASHED
    ) {
      throw new Error(`Cannot start server in state: ${this.state}`);
    }

    // Start the server with proper concurrency control
    this.startPromise = this.performStart();
    try {
      await this.startPromise;
    } finally {
      this.startPromise = null;
    }
  }

  /**
   * Perform the actual start operation
   */
  private async performStart(): Promise<void> {
    this.shutdownRequested = false;
    this.state = ServerState.STARTING;
    this.lastStartTime = new Date();
    this.emit('starting', { serverId: this.config.id });

    try {
      await this.spawnProcess();
      this.state = ServerState.RUNNING;
      this.emit('started', { serverId: this.config.id });
    } catch (error) {
      this.state = ServerState.CRASHED;
      this.emit('error', {
        serverId: this.config.id,
        error: error instanceof Error ? error.message : String(error),
      });

      // Attempt auto-restart if configured
      if (this.shouldAutoRestart()) {
        await this.scheduleRestart();
      }

      throw error;
    }
  }

  /**
   * Spawn the child process
   */
  private async spawnProcess(): Promise<void> {
    const runtime = await this.runtime;

    // Build the npx command
    const command = 'npx';
    const args: string[] = [];

    // Add version specifier if provided
    if (this.config.version) {
      args.push(`${this.config.package}@${this.config.version}`);
    } else {
      args.push(this.config.package);
    }

    // Add additional arguments
    if (this.config.args) {
      args.push(...this.config.args);
    }

    // Spawn the process
    this.process = spawn(command, args, {
      cwd: this.config.workDir || process.cwd(),
      env: {
        ...process.env,
        ...this.config.env,
      },
      stdio: this.config.stdio || 'pipe',
    });

    // Set up event handlers
    this.process.on('error', (error) => {
      this.handleProcessError(error);
    });

    this.process.on('exit', (code, signal) => {
      this.handleProcessExit(code, signal);
    });

    // Set up timeout for startup
    const timeout = this.config.timeout || this.defaults.timeout;
    const timeoutId = runtime.setTimeout(() => {
      if (this.state === ServerState.STARTING) {
        this.handleStartupTimeout();
      }
    }, timeout);

    // Wait for process to be ready
    await this.waitForReady();
    runtime.clearTimeout(timeoutId);
  }

  /**
   * Wait for the process to be ready
   */
  private async waitForReady(): Promise<void> {
    const runtime = await this.runtime;

    return new Promise((resolve, reject) => {
      if (!this.process) {
        reject(new Error('Process not spawned'));
        return;
      }

      let buffer = '';
      let initRequestSent = false;
      let cleanupStdout: (() => void) | null = null;
      let cleanupStderr: (() => void) | null = null;
      let timeoutId: NodeJS.Timeout | null = null;

      const cleanup = () => {
        if (cleanupStdout) cleanupStdout();
        if (cleanupStderr) cleanupStderr();
        if (timeoutId) runtime.clearTimeout(timeoutId);
      };

      // Handle stdout data
      const onData = async (data: Buffer) => {
        buffer += data.toString();
        const lines = buffer.split('\n');

        // Keep the last incomplete line in the buffer
        buffer = lines.pop() || '';

        for (const line of lines) {
          if (!line.trim()) continue;

          try {
            const message = JSON.parse(line);

            // Check if this is an initialize response
            if (message.id === this.initRequestId && message.result) {
              console.log(
                `🏮 Server ${this.config.id} initialized successfully`,
              );
              cleanup();
              resolve();
              return;
            }

            // Check for error response
            if (message.id === this.initRequestId && message.error) {
              cleanup();
              reject(
                new Error(
                  `MCP initialization failed: ${message.error.message}`,
                ),
              );
              return;
            }
          } catch {
            // Not valid JSON, might be server logs
            // Continue processing
          }
        }

        // Send initialize request after receiving first output
        if (!initRequestSent) {
          initRequestSent = true;
          await this.sendInitializeRequest();
        }
      };

      // Handle stderr data
      const onError = (data: Buffer) => {
        const error = data.toString();
        // Log stderr but don't reject unless it's critical
        console.error(`Server ${this.config.id} stderr:`, error);
      };

      // Setup listeners with cleanup functions
      if (this.process.stdout) {
        this.process.stdout.on('data', onData);
        cleanupStdout = () =>
          this.process?.stdout?.removeListener('data', onData);
      }

      if (this.process.stderr) {
        this.process.stderr.on('data', onError);
        cleanupStderr = () =>
          this.process?.stderr?.removeListener('data', onError);
      }

      // Set timeout for initialization
      const initTimeout = this.config.initTimeoutMs || 10000;
      timeoutId = runtime.setTimeout(() => {
        cleanup();
        reject(new Error(`MCP initialization timeout after ${initTimeout}ms`));
      }, initTimeout);
    });
  }

  /**
   * Send MCP initialize request
   */
  private async sendInitializeRequest(): Promise<void> {
    const runtime = await this.runtime;
    this.initRequestId = await runtime.idGenerator.generate();

    const initRequest = {
      jsonrpc: '2.0',
      id: this.initRequestId,
      method: 'initialize',
      params: {
        protocolVersion: '2025-06-18',
        capabilities: {
          tools: {},
          prompts: {},
          resources: {},
        },
        clientInfo: {
          name: 'hatago-npx-server',
          version: '0.0.1',
        },
      },
    };

    try {
      await this.send(`${JSON.stringify(initRequest)}\n`);
    } catch (error) {
      console.error(`Failed to send initialize request: ${error}`);
    }
  }

  /**
   * Handle process error
   */
  private handleProcessError(error: Error): void {
    console.error(`Server ${this.config.id} process error:`, error);
    this.state = ServerState.CRASHED;
    this.emit('error', {
      serverId: this.config.id,
      error: error.message,
    });

    if (this.shouldAutoRestart()) {
      this.scheduleRestart();
    }
  }

  /**
   * Handle process exit
   */
  private handleProcessExit(code: number | null, signal: string | null): void {
    console.log(
      `Server ${this.config.id} exited with code ${code}, signal ${signal}`,
    );

    if (!this.shutdownRequested) {
      this.state = ServerState.CRASHED;
      this.emit('crashed', {
        serverId: this.config.id,
        code,
        signal,
      });

      if (this.shouldAutoRestart()) {
        this.scheduleRestart();
      }
    } else {
      this.state = ServerState.STOPPED;
      this.emit('stopped', { serverId: this.config.id });
    }

    this.process = null;
  }

  /**
   * Handle startup timeout
   */
  private handleStartupTimeout(): void {
    console.error(`Server ${this.config.id} startup timeout`);

    if (this.process) {
      this.process.kill('SIGTERM');
    }

    this.state = ServerState.CRASHED;
    this.emit('error', {
      serverId: this.config.id,
      error: 'Startup timeout',
    });
  }

  /**
   * Check if server should auto-restart
   */
  private shouldAutoRestart(): boolean {
    if (this.shutdownRequested) {
      return false;
    }

    if (!this.config.autoRestart) {
      return false;
    }

    const maxRestarts = this.config.maxRestarts || this.defaults.maxRestarts;
    return this.restartCount < maxRestarts;
  }

  /**
   * Schedule a restart
   */
  private async scheduleRestart(): Promise<void> {
    const runtime = await this.runtime;
    const delay = this.config.restartDelayMs || this.defaults.restartDelayMs;

    this.restartCount++;
    console.log(
      `Scheduling restart ${this.restartCount} for server ${this.config.id} in ${delay}ms`,
    );

    // Prevent race condition with proper promise handling
    await new Promise<void>((resolve) => {
      runtime.setTimeout(async () => {
        // Double-check shutdown flag to avoid race condition
        if (!this.shutdownRequested) {
          try {
            await this.start();
            // Reset restart count on successful start
            this.restartCount = 0;
          } catch (error) {
            console.error(`Failed to restart server ${this.config.id}:`, error);
          }
        }
        resolve();
      }, delay);
    });
  }

  /**
   * Stop the server
   */
  async stop(): Promise<void> {
    // Return existing stop promise if already stopping
    if (this.stopPromise) {
      return this.stopPromise;
    }

    // Check if already stopped
    if (this.state === ServerState.STOPPED) {
      return;
    }

    // Stop the server with proper concurrency control
    this.stopPromise = this.performStop();
    try {
      await this.stopPromise;
    } finally {
      this.stopPromise = null;
    }
  }

  /**
   * Perform the actual stop operation
   */
  private async performStop(): Promise<void> {
    if (this.state === ServerState.STOPPING) {
      // Already stopping, wait for completion
      return new Promise((resolve) => {
        this.once('stopped', resolve);
      });
    }

    this.shutdownRequested = true;
    this.state = ServerState.STOPPING;
    this.emit('stopping', { serverId: this.config.id });

    if (this.process) {
      // Send SIGTERM first
      this.process.kill('SIGTERM');

      // Give process time to exit gracefully (configurable timeout)
      const gracefulShutdownTimeout = this.config.shutdownTimeoutMs || 10000;

      await new Promise((resolve) => {
        const timeout = setTimeout(() => {
          // Force kill if not exited
          if (this.process) {
            console.warn(`Force killing server ${this.config.id}`);
            this.process.kill('SIGKILL');
          }
          resolve(undefined);
        }, gracefulShutdownTimeout);

        this.once('stopped', () => {
          clearTimeout(timeout);
          resolve(undefined);
        });
      });
    } else {
      this.state = ServerState.STOPPED;
      this.emit('stopped', { serverId: this.config.id });
    }
  }

  /**
   * Restart the server
   */
  async restart(): Promise<void> {
    await this.stop();
    this.restartCount = 0; // Reset restart count for manual restart
    await this.start();
  }

  /**
   * Get server statistics
   */
  getStats(): {
    id: string;
    state: ServerState;
    pid?: number;
    restartCount: number;
    uptime?: number;
  } {
    return {
      id: this.config.id,
      state: this.state,
      pid: this.process?.pid,
      restartCount: this.restartCount,
      uptime: this.lastStartTime
        ? Date.now() - this.lastStartTime.getTime()
        : undefined,
    };
  }

  /**
   * Send data to the server's stdin
   */
  async send(data: string | Buffer): Promise<void> {
    if (!this.process || !this.process.stdin) {
      throw new Error(`Server ${this.config.id} is not running`);
    }

    // Check process state before writing
    if (
      this.state !== ServerState.RUNNING &&
      this.state !== ServerState.STARTING
    ) {
      throw new Error(
        `Server ${this.config.id} is not in a writable state: ${this.state}`,
      );
    }

    return new Promise((resolve, reject) => {
      if (!this.process?.stdin) {
        reject(new Error('Process stdin not available'));
        return;
      }

      this.process.stdin.write(data, (error) => {
        if (error) {
          // Check if error is due to process termination
          if (
            error.message.includes('EPIPE') ||
            error.message.includes('write after end')
          ) {
            reject(
              new Error(`Server ${this.config.id} process has terminated`),
            );
          } else {
            reject(error);
          }
        } else {
          resolve();
        }
      });
    });
  }

  /**
   * Read from server's stdout
   */
  onStdout(callback: (data: Buffer) => void): (() => void) | null {
    if (this.process?.stdout) {
      this.process.stdout.on('data', callback);
      // Return cleanup function
      return () => this.process?.stdout?.removeListener('data', callback);
    }
    return null;
  }

  /**
   * Read from server's stderr
   */
  onStderr(callback: (data: Buffer) => void): (() => void) | null {
    if (this.process?.stderr) {
      this.process.stderr.on('data', callback);
      // Return cleanup function
      return () => this.process?.stderr?.removeListener('data', callback);
    }
    return null;
  }
}
