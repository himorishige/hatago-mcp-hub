/**
 * SSE Manager - Manages Server-Sent Events connections and progress notifications
 */

import type { Logger } from './logger.js';

export type SSEClient = {
  id: string;
  writer: WritableStreamDefaultWriter;
  closed: boolean;
  keepAliveInterval?: ReturnType<typeof setInterval>;
  stream?: unknown; // For framework-specific streams
};

export type ProgressNotification = {
  progressToken: string;
  progress: number;
  total?: number;
  message?: string;
  serverId?: string;
};

/**
 * SSE Manager for handling progress notifications
 */
export class SSEManager {
  private clients = new Map<string, SSEClient>();
  private progressRoutes = new Map<string, string>(); // progressToken -> clientId
  private logger: Logger;

  constructor(logger: Logger) {
    this.logger = logger;
  }

  /**
   * Add a new SSE client
   */
  addClient(clientId: string, writer: WritableStreamDefaultWriter, stream?: unknown): void {
    // Set up keepalive interval
    const keepAliveInterval = setInterval(() => {
      void this.sendKeepAliveToClient(clientId);
    }, 30000); // Every 30 seconds

    this.clients.set(clientId, {
      id: clientId,
      writer,
      closed: false,
      keepAliveInterval,
      stream
    });

    this.logger.debug('[SSE] Client connected', { clientId });

    // Send initial connection event
    void this.sendToClient(clientId, 'connected', {
      clientId,
      timestamp: Date.now()
    });
  }

  /**
   * Remove a client
   */
  removeClient(clientId: string): void {
    const client = this.clients.get(clientId);
    if (client) {
      client.closed = true;

      // Clear keepalive interval
      if (client.keepAliveInterval) {
        clearInterval(client.keepAliveInterval);
      }

      this.clients.delete(clientId);

      // Clean up progress routes for this client
      for (const [token, cid] of this.progressRoutes.entries()) {
        if (cid === clientId) {
          this.progressRoutes.delete(token);
        }
      }

      this.logger.debug('[SSE] Client disconnected', { clientId });
    }
  }

  /**
   * Register a progress token for a client
   */
  registerProgressToken(progressToken: string, clientId: string): void {
    this.progressRoutes.set(progressToken, clientId);
    this.logger.debug('[SSE] Progress token registered', {
      progressToken,
      clientId
    });
  }

  /**
   * Unregister a progress token
   */
  unregisterProgressToken(progressToken: string): void {
    this.progressRoutes.delete(progressToken);
    this.logger.debug('[SSE] Progress token unregistered', { progressToken });
  }

  /**
   * Send progress notification
   */
  sendProgress(progressToken: string, progress: ProgressNotification): void {
    const clientId = this.progressRoutes.get(progressToken);
    if (clientId) {
      void this.sendToClient(clientId, 'progress', progress);
    } else {
      this.logger.warn('[SSE] No client found for progress token', {
        progressToken
      });
    }
  }

  /**
   * Send event to a specific client
   */
  private async sendToClient(clientId: string, event: string, data: unknown): Promise<void> {
    const client = this.clients.get(clientId);
    if (!client || client.closed) {
      return;
    }

    try {
      const encoder = new TextEncoder();
      const message = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
      await client.writer.write(encoder.encode(message));

      this.logger.debug('[SSE] Event sent', { clientId, event });
    } catch (error) {
      this.logger.error('[SSE] Failed to send event', {
        clientId,
        event,
        error: error instanceof Error ? error.message : String(error)
      });

      // Mark client as closed on error
      client.closed = true;
      this.removeClient(clientId);
    }
  }

  /**
   * Broadcast to all clients
   */
  async broadcast(event: string, data: unknown): Promise<void> {
    const promises: Promise<void>[] = [];

    for (const clientId of this.clients.keys()) {
      promises.push(this.sendToClient(clientId, event, data));
    }

    await Promise.all(promises);
  }

  /**
   * Send keep-alive ping to a specific client
   */
  async sendKeepAliveToClient(clientId: string): Promise<void> {
    const client = this.clients.get(clientId);
    if (!client || client.closed) {
      return;
    }

    try {
      const streamWithWriteSSE = client.stream as
        | { writeSSE?: (message: { comment: string }) => void }
        | undefined;
      if (streamWithWriteSSE?.writeSSE) {
        // Framework-specific stream (e.g., Hono)
        streamWithWriteSSE.writeSSE({ comment: 'keepalive' });
      } else {
        // Standard SSE stream
        const encoder = new TextEncoder();
        const keepAlive = encoder.encode(':keepalive\n\n');
        await client.writer.write(keepAlive);
      }

      this.logger.debug('[SSE] Keep-alive sent', { clientId });
    } catch (error) {
      this.logger.warn('[SSE] Keep-alive failed', {
        clientId,
        error: error instanceof Error ? error.message : String(error)
      });
      this.removeClient(clientId);
    }
  }

  /**
   * Send keep-alive ping to all clients
   */
  async sendKeepAlive(): Promise<void> {
    const promises: Promise<void>[] = [];

    for (const clientId of this.clients.keys()) {
      promises.push(this.sendKeepAliveToClient(clientId));
    }

    await Promise.all(promises);
  }

  /**
   * Get number of connected clients
   */
  getClientCount(): number {
    return this.clients.size;
  }

  /**
   * Check if a client is connected
   */
  isClientConnected(clientId: string): boolean {
    const client = this.clients.get(clientId);
    return client ? !client.closed : false;
  }
}
