/**
 * SSE Manager - Manages Server-Sent Events connections and progress notifications
 */

import { Logger } from './logger.js';

export interface SSEClient {
  id: string;
  writer: WritableStreamDefaultWriter;
  closed: boolean;
}

export interface ProgressNotification {
  progressToken: string;
  progress: number;
  total?: number;
  message?: string;
  serverId?: string;
}

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
  addClient(clientId: string, writer: WritableStreamDefaultWriter): void {
    this.clients.set(clientId, {
      id: clientId,
      writer,
      closed: false
    });
    
    this.logger.debug('[SSE] Client connected', { clientId });
    
    // Send initial connection event
    this.sendToClient(clientId, 'connected', { clientId, timestamp: Date.now() });
  }

  /**
   * Remove a client
   */
  removeClient(clientId: string): void {
    const client = this.clients.get(clientId);
    if (client) {
      client.closed = true;
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
    this.logger.debug('[SSE] Progress token registered', { progressToken, clientId });
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
      this.sendToClient(clientId, 'progress', progress);
    } else {
      this.logger.warn('[SSE] No client found for progress token', { progressToken });
    }
  }

  /**
   * Send event to a specific client
   */
  private async sendToClient(clientId: string, event: string, data: any): Promise<void> {
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
  async broadcast(event: string, data: any): Promise<void> {
    const promises: Promise<void>[] = [];
    
    for (const clientId of this.clients.keys()) {
      promises.push(this.sendToClient(clientId, event, data));
    }
    
    await Promise.all(promises);
  }

  /**
   * Send keep-alive ping to all clients
   */
  async sendKeepAlive(): Promise<void> {
    const encoder = new TextEncoder();
    const keepAlive = encoder.encode(':keepalive\n\n');
    
    for (const [clientId, client] of this.clients.entries()) {
      if (!client.closed) {
        try {
          await client.writer.write(keepAlive);
        } catch (error) {
          this.logger.debug('[SSE] Keep-alive failed', { clientId });
          this.removeClient(clientId);
        }
      }
    }
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