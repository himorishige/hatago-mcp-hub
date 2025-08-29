/**
 * Session Durable Object
 * 
 * Manages session state with strong consistency guarantees.
 * Uses WebSocket hibernation for cost-effective long connections.
 * Implements alarm API for session expiration management.
 */

import type { DurableObjectState } from '@cloudflare/workers-types';

interface SessionData {
  id: string;
  createdAt: number;
  lastAccessedAt: number;
  clients: Map<string, ClientInfo>;
  mcpServers: Map<string, ServerConnection>;
  progressTokens: Map<string, ProgressInfo>;
}

interface ClientInfo {
  id: string;
  connectedAt: number;
  capabilities?: any;
}

interface ServerConnection {
  id: string;
  url: string;
  type: 'http' | 'sse';
  status: 'connected' | 'disconnected' | 'error';
  lastError?: string;
}

interface ProgressInfo {
  token: string;
  serverId: string;
  startedAt: number;
  progress?: number;
  total?: number;
  message?: string;
}

export class SessionDurableObject {
  private state: DurableObjectState;
  private sessionData: SessionData;
  private eventSubscribers: Map<string, EventSubscriber>;
  private websockets: Set<WebSocket>;

  constructor(state: DurableObjectState, env: any) {
    this.state = state;
    this.eventSubscribers = new Map();
    this.websockets = new Set();
    
    // Initialize session data
    this.sessionData = {
      id: state.id.toString(),
      createdAt: Date.now(),
      lastAccessedAt: Date.now(),
      clients: new Map(),
      mcpServers: new Map(),
      progressTokens: new Map(),
    };
  }

  /**
   * Handle HTTP requests to the Durable Object
   */
  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);
    
    // Handle WebSocket upgrade
    if (request.headers.get('Upgrade') === 'websocket') {
      return this.handleWebSocketUpgrade(request);
    }

    // Handle regular HTTP requests
    switch (url.pathname) {
      case '/session':
        return this.handleSessionRequest(request);
      case '/subscribe':
        return this.handleSubscribeRequest(request);
      case '/progress':
        return this.handleProgressRequest(request);
      case '/cleanup':
        return this.handleCleanupRequest(request);
      default:
        return new Response('Not found', { status: 404 });
    }
  }

  /**
   * WebSocket upgrade handler with hibernation support
   */
  private async handleWebSocketUpgrade(request: Request): Promise<Response> {
    const pair = new WebSocketPair();
    const [client, server] = Object.values(pair);

    // Accept the WebSocket connection
    this.state.acceptWebSocket(server);
    this.websockets.add(server);

    // Set up message handler
    server.addEventListener('message', async (event) => {
      await this.handleWebSocketMessage(server, event.data);
    });

    // Clean up on close
    server.addEventListener('close', () => {
      this.websockets.delete(server);
    });

    // Return the client socket
    return new Response(null, {
      status: 101,
      webSocket: client,
    });
  }

  /**
   * Handle WebSocket messages
   */
  private async handleWebSocketMessage(ws: WebSocket, data: string) {
    try {
      const message = JSON.parse(data);
      
      switch (message.type) {
        case 'ping':
          ws.send(JSON.stringify({ type: 'pong' }));
          break;
        
        case 'subscribe':
          // Subscribe to events
          this.subscribeWebSocket(ws, message.events || ['progress']);
          break;
        
        case 'progress':
          // Forward progress update
          await this.updateProgress(message.token, message.data);
          break;
        
        default:
          ws.send(JSON.stringify({
            type: 'error',
            message: `Unknown message type: ${message.type}`,
          }));
      }
    } catch (error) {
      ws.send(JSON.stringify({
        type: 'error',
        message: 'Invalid message format',
      }));
    }
  }

  /**
   * Subscribe WebSocket to events
   */
  private subscribeWebSocket(ws: WebSocket, events: string[]) {
    // Implementation for WebSocket event subscription
    // Store WebSocket reference for event broadcasting
  }

  /**
   * Handle session information requests
   */
  private async handleSessionRequest(request: Request): Promise<Response> {
    if (request.method === 'GET') {
      // Return session information
      return new Response(JSON.stringify({
        id: this.sessionData.id,
        createdAt: this.sessionData.createdAt,
        lastAccessedAt: this.sessionData.lastAccessedAt,
        clientCount: this.sessionData.clients.size,
        serverCount: this.sessionData.mcpServers.size,
        progressCount: this.sessionData.progressTokens.size,
      }), {
        headers: { 'Content-Type': 'application/json' },
      });
    }

    if (request.method === 'POST') {
      // Update session data
      const body = await request.json();
      await this.updateSessionData(body);
      return new Response('OK');
    }

    return new Response('Method not allowed', { status: 405 });
  }

  /**
   * Handle event subscription requests
   */
  private async handleSubscribeRequest(request: Request): Promise<Response> {
    const clientId = new URL(request.url).searchParams.get('clientId');
    if (!clientId) {
      return new Response('Client ID required', { status: 400 });
    }

    // Create event subscriber
    const subscriber = new EventSubscriber(clientId);
    this.eventSubscribers.set(clientId, subscriber);

    return new Response(JSON.stringify({ subscribed: true }), {
      headers: { 'Content-Type': 'application/json' },
    });
  }

  /**
   * Handle progress update requests
   */
  private async handleProgressRequest(request: Request): Promise<Response> {
    if (request.method === 'POST') {
      const body = await request.json();
      const { token, progress, total, message } = body;
      
      await this.updateProgress(token, { progress, total, message });
      return new Response('OK');
    }

    if (request.method === 'GET') {
      const token = new URL(request.url).searchParams.get('token');
      if (!token) {
        return new Response('Token required', { status: 400 });
      }

      const progressInfo = this.sessionData.progressTokens.get(token);
      if (!progressInfo) {
        return new Response('Progress not found', { status: 404 });
      }

      return new Response(JSON.stringify(progressInfo), {
        headers: { 'Content-Type': 'application/json' },
      });
    }

    return new Response('Method not allowed', { status: 405 });
  }

  /**
   * Handle cleanup requests
   */
  private async handleCleanupRequest(request: Request): Promise<Response> {
    // Clean up expired progress tokens
    const now = Date.now();
    const expiredTokens = Array.from(this.sessionData.progressTokens.entries())
      .filter(([_, info]) => now - info.startedAt > 3600000) // 1 hour
      .map(([token, _]) => token);

    for (const token of expiredTokens) {
      this.sessionData.progressTokens.delete(token);
    }

    // Persist changes
    await this.state.storage.put('sessionData', this.sessionData);

    return new Response(JSON.stringify({
      cleaned: expiredTokens.length,
    }), {
      headers: { 'Content-Type': 'application/json' },
    });
  }

  /**
   * Update session data
   */
  private async updateSessionData(data: any) {
    this.sessionData.lastAccessedAt = Date.now();
    
    if (data.client) {
      this.sessionData.clients.set(data.client.id, {
        id: data.client.id,
        connectedAt: Date.now(),
        capabilities: data.client.capabilities,
      });
    }

    if (data.server) {
      this.sessionData.mcpServers.set(data.server.id, {
        id: data.server.id,
        url: data.server.url,
        type: data.server.type,
        status: data.server.status || 'connected',
      });
    }

    // Persist to storage
    await this.state.storage.put('sessionData', this.sessionData);
  }

  /**
   * Update progress information
   */
  private async updateProgress(token: string, data: any) {
    const progressInfo = this.sessionData.progressTokens.get(token) || {
      token,
      serverId: data.serverId || 'unknown',
      startedAt: Date.now(),
    };

    if (data.progress !== undefined) progressInfo.progress = data.progress;
    if (data.total !== undefined) progressInfo.total = data.total;
    if (data.message !== undefined) progressInfo.message = data.message;

    this.sessionData.progressTokens.set(token, progressInfo);

    // Broadcast to subscribers
    this.broadcastEvent('progress', progressInfo);

    // Persist to storage
    await this.state.storage.put('sessionData', this.sessionData);
  }

  /**
   * Broadcast event to all subscribers
   */
  private broadcastEvent(event: string, data: any) {
    // Send to WebSocket clients
    for (const ws of this.websockets) {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ event, data }));
      }
    }

    // Send to SSE subscribers
    for (const subscriber of this.eventSubscribers.values()) {
      subscriber.emit(event, data);
    }
  }

  /**
   * Public API for SSE event subscription
   */
  async subscribeToEvents(clientId: string): Promise<EventSubscriber> {
    const subscriber = new EventSubscriber(clientId);
    this.eventSubscribers.set(clientId, subscriber);
    return subscriber;
  }

  /**
   * Public API for SSE event unsubscription
   */
  async unsubscribeFromEvents(clientId: string) {
    this.eventSubscribers.delete(clientId);
  }

  /**
   * Alarm handler for session expiration
   */
  async alarm() {
    // Check if session has expired (e.g., 24 hours of inactivity)
    const now = Date.now();
    const inactivityThreshold = 24 * 60 * 60 * 1000; // 24 hours

    if (now - this.sessionData.lastAccessedAt > inactivityThreshold) {
      // Clean up session
      await this.cleanup();
    } else {
      // Schedule next check
      const nextCheck = this.sessionData.lastAccessedAt + inactivityThreshold;
      await this.state.storage.setAlarm(nextCheck);
    }
  }

  /**
   * Clean up session resources
   */
  private async cleanup() {
    // Close all WebSocket connections
    for (const ws of this.websockets) {
      ws.close(1000, 'Session expired');
    }

    // Clear data
    this.sessionData.clients.clear();
    this.sessionData.mcpServers.clear();
    this.sessionData.progressTokens.clear();

    // Clear storage
    await this.state.storage.deleteAll();
  }
}

/**
 * Event subscriber for SSE clients
 */
class EventSubscriber {
  private clientId: string;
  private listeners: Map<string, Function[]>;

  constructor(clientId: string) {
    this.clientId = clientId;
    this.listeners = new Map();
  }

  on(event: string, callback: Function) {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, []);
    }
    this.listeners.get(event)!.push(callback);
  }

  emit(event: string, data: any) {
    const callbacks = this.listeners.get(event);
    if (callbacks) {
      for (const callback of callbacks) {
        callback(data);
      }
    }
  }
}