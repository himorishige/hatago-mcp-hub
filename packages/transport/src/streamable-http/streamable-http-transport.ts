/**
 * StreamableHTTPTransport for MCP
 * Based on MCP SDK's StreamableHTTPServerTransport
 * Handles HTTP POST requests and SSE streaming for notifications
 */

import type { Transport } from '@modelcontextprotocol/sdk/shared/transport.js';
import { RPC_NOTIFICATION as CORE_RPC_NOTIFICATION } from '@himorishige/hatago-core';

// Fallback to literals if core export is not yet built in local dev/test. [REH][SF]
const FALLBACK_RPC_NOTIFICATION = {
  initialized: 'notifications/initialized',
  cancelled: 'notifications/cancelled',
  progress: 'notifications/progress',
  tools_list_changed: 'notifications/tools/list_changed'
} as const;
const RPC_NOTIFICATION = CORE_RPC_NOTIFICATION ?? FALLBACK_RPC_NOTIFICATION;
import type { JSONRPCMessage, JSONRPCNotification } from '@modelcontextprotocol/sdk/types.js';
import type { SSEStream } from './session-map.js';
import { SessionMaps } from './session-map.js';
import { CleanupScheduler } from './gc.js';
import { mapRequestsToStream, unmapRequests } from './progress-routing.js';
import {
  isInitializeRequest,
  isJSONRPCError,
  isJSONRPCRequest,
  isJSONRPCResponse
} from '@modelcontextprotocol/sdk/types.js';

export type StreamableHTTPTransportOptions = {
  sessionIdGenerator?: () => string;
  enableJsonResponse?: boolean;
  onsessioninitialized?: (sessionId: string) => void;
  onsessionclosed?: (sessionId: string) => void;
  // Heartbeat interval (milliseconds) for SSE keepalive. Default: 30000ms
  keepAliveMs?: number;
};

// moved SSEStream/StreamData to session-map.ts

export class StreamableHTTPTransport implements Transport {
  private started = false;
  private maps = new SessionMaps();
  private sessionIdGenerator?: () => string;
  private onsessioninitialized?: (sessionId: string) => void;
  private onsessionclosed?: (sessionId: string) => void;
  // Configurable heartbeat interval for SSE keepalive
  private keepAliveMs = 30000;

  // Stream management
  // moved to SessionMaps
  private cleanup?: CleanupScheduler;

  // Cleanup settings
  private readonly maxMapSize = 1000;
  // Consider a stream stale only after prolonged inactivity.
  // Keep above keepAliveMs to avoid dropping active streams. [REH][SF]
  private readonly ttlMs = 120000;
  private cleanupInterval?: ReturnType<typeof setInterval>; // kept for compatibility

  sessionId?: string;
  onclose?: () => void;
  onerror?: (error: Error) => void;
  onmessage?: (message: JSONRPCMessage) => void;

  constructor(options?: StreamableHTTPTransportOptions) {
    this.sessionIdGenerator = options?.sessionIdGenerator;
    // enableJsonResponse is reserved for future use
    // this._enableJsonResponse = options?.enableJsonResponse ?? true;
    this.onsessioninitialized = options?.onsessioninitialized;
    this.onsessionclosed = options?.onsessionclosed;
    if (options?.keepAliveMs && Number.isFinite(options.keepAliveMs)) {
      this.keepAliveMs = options.keepAliveMs;
    }
  }

  // eslint-disable-next-line @typescript-eslint/require-await
  async start(): Promise<void> {
    if (this.started) {
      throw new Error('Transport already started');
    }
    this.started = true;
    this.cleanup = new CleanupScheduler(this.maps, this.ttlMs, this.maxMapSize);
    this.cleanup.start();
  }

  async close(): Promise<void> {
    if (!this.started) {
      return;
    }

    // Close all streams
    for (const [, streamData] of this.maps.streamMapping.entries()) {
      if (streamData.keepaliveInterval) {
        clearInterval(streamData.keepaliveInterval);
      }
      await streamData.stream.close();
    }

    // Clear maps
    this.maps.clearAll();

    // Stop cleanup interval
    if (this.cleanupInterval) clearInterval(this.cleanupInterval);
    this.cleanup?.stop();

    // Call session closed callback
    if (this.sessionId && this.onsessionclosed) {
      this.onsessionclosed(this.sessionId);
    }

    this.started = false;
    this.onclose?.();
  }

  /**
   * Update keepalive interval (milliseconds) used for SSE heartbeats.
   * Should be called before start().
   */
  setKeepAliveMs(ms: number): void {
    if (Number.isFinite(ms) && ms > 0) {
      this.keepAliveMs = ms;
    }
  }

  async send(message: JSONRPCMessage): Promise<void> {
    if (!this.started) {
      throw new Error('Transport not started');
    }

    // Handle response messages
    if (isJSONRPCResponse(message) || isJSONRPCError(message)) {
      const requestId = message.id;
      const streamId = this.maps.requestToStreamMapping.get(requestId);
      if (streamId) {
        await this.writeToStream(streamId, message, true);
        // Clean up mappings
        this.maps.requestToStreamMapping.delete(requestId);
        this.maps.requestResponseMap.delete(requestId);
      } else {
        // Store response for JSON response mode
        this.maps.requestResponseMap.set(requestId, message);
      }
    }
    // Handle notification messages
    else if (!('id' in message)) {
      // Route progress notifications to specific streams
      const notification = message as { method?: string; params?: { progressToken?: string } };
      if (notification.method === RPC_NOTIFICATION.progress && notification.params?.progressToken) {
        await this.routeProgressNotification(notification.params.progressToken, message);
      } else {
        await this.broadcastNotification(message);
      }
    }
  }

  // --- compatibility accessors for tests and internal tooling [PEC] ---
  // These mirror the previous private fields to keep `(transport as any).X`
  // usages in tests working after internal refactor.
  get streamMapping() {
    return this.maps.streamMapping;
  }
  get requestToStreamMapping() {
    return this.maps.requestToStreamMapping;
  }
  get requestResponseMap() {
    return this.maps.requestResponseMap;
  }
  get progressTokenToStream() {
    return this.maps.progressTokenToStream;
  }
  get sessionIdToStream() {
    return this.maps.sessionIdToStream;
  }
  get initializedSessions() {
    return this.maps.initializedSessions;
  }

  // --- notification helpers ---------------------------------------------

  private async writeToStream(
    streamId: string,
    message: JSONRPCMessage,
    isResponse = false
  ): Promise<void> {
    const streamData = this.maps.streamMapping.get(streamId);
    if (!streamData?.stream || streamData.stream.closed) return;
    try {
      await streamData.stream.write(`data: ${JSON.stringify(message)}\n\n`);
      streamData.lastActivityAt = Date.now();
      if (isResponse) streamData.resolveResponse?.();
    } catch (error) {
      console.error('Failed to send message to stream:', error);
    }
  }

  private async routeProgressNotification(
    token: string | number,
    message: JSONRPCMessage
  ): Promise<void> {
    const streamId = this.maps.progressTokenToStream.get(token);
    if (!streamId) return;
    await this.writeToStream(streamId, message, false);
  }

  private async broadcastNotification(message: JSONRPCMessage): Promise<void> {
    const tasks: Array<Promise<void>> = [];
    for (const [streamId, streamData] of this.maps.streamMapping.entries()) {
      if (!streamData.stream || streamData.stream.closed) continue;
      tasks.push(this.writeToStream(streamId, message, false));
    }
    await Promise.all(tasks);
  }

  /**
   * Send progress notification
   */
  async sendProgressNotification(
    progressToken: string | number,
    progress: number,
    total?: number,
    message?: string
  ): Promise<void> {
    const notification: JSONRPCNotification = {
      jsonrpc: '2.0',
      method: RPC_NOTIFICATION.progress,
      params: {
        progressToken,
        progress,
        ...(total !== undefined && { total }),
        ...(message !== undefined && { message })
      }
    };

    await this.send(notification);
  }

  /**
   * Handle incoming HTTP request
   */
  async handleHttpRequest(
    method: string,
    headers: Record<string, string | undefined>,
    body?: unknown,
    sseStream?: SSEStream
  ): Promise<
    | {
        status: number;
        headers?: Record<string, string>;
        body?: unknown;
      }
    | undefined
  > {
    switch (method) {
      case 'GET':
        return this.handleGetRequest(headers, sseStream);
      case 'POST':
        return this.handlePostRequest(headers, body, sseStream);
      case 'DELETE':
        return this.handleDeleteRequest(headers);
      default:
        return {
          status: 405,
          headers: { Allow: 'GET, POST, DELETE' },
          body: {
            jsonrpc: '2.0',
            error: {
              code: -32000,
              message: 'Method not allowed'
            },
            id: null
          }
        };
    }
  }

  // eslint-disable-next-line @typescript-eslint/require-await
  private async handleGetRequest(
    headers: Record<string, string | undefined>,
    sseStream?: SSEStream
  ): Promise<undefined> {
    if (!sseStream) throw new Error('SSE stream required for GET request');
    const sessionId = this.initSessionForGet(headers);
    const { streamId, keepaliveInterval } = this.createSseStream(sseStream);
    this.mapSessionToStream(sessionId, streamId);
    this.attachSseCleanup(sseStream, streamId, keepaliveInterval);
    return undefined; // SSE response handled by the server
  }

  // --- GET helpers -------------------------------------------------------

  private initSessionForGet(headers: Record<string, string | undefined>): string {
    const sessionId =
      headers['mcp-session-id'] ?? this.sessionIdGenerator?.() ?? crypto.randomUUID();
    this.sessionId = sessionId;
    this.onsessioninitialized?.(sessionId);
    return sessionId;
  }

  private createSseStream(sseStream: SSEStream): {
    streamId: string;
    keepaliveInterval: ReturnType<typeof setInterval>;
  } {
    const streamId = crypto.randomUUID();
    const keepaliveInterval = setInterval(() => {
      void (async () => {
        try {
          await sseStream.write(':heartbeat\n\n');
          const sd = this.maps.streamMapping.get(streamId);
          if (sd) sd.lastActivityAt = Date.now();
        } catch {
          clearInterval(keepaliveInterval);
        }
      })();
    }, this.keepAliveMs);

    this.maps.streamMapping.set(streamId, {
      stream: sseStream,
      createdAt: Date.now(),
      lastActivityAt: Date.now(),
      keepaliveInterval
    });
    return { streamId, keepaliveInterval };
  }

  private mapSessionToStream(sessionId: string, streamId: string): void {
    this.maps.sessionIdToStream.set(sessionId, streamId);
  }

  private attachSseCleanup(
    sseStream: SSEStream,
    streamId: string,
    keepaliveInterval: ReturnType<typeof setInterval>
  ): void {
    sseStream.onAbort?.(() => {
      clearInterval(keepaliveInterval);
      this.maps.streamMapping.delete(streamId);

      for (const [sid, sId] of this.maps.sessionIdToStream.entries()) {
        if (sId === streamId) {
          this.maps.sessionIdToStream.delete(sid);
          break;
        }
      }

      const tokensToDelete: Array<string | number> = [];
      for (const [token, sid] of this.maps.progressTokenToStream.entries()) {
        if (sid === streamId) tokensToDelete.push(token);
      }
      tokensToDelete.forEach((token) => this.maps.progressTokenToStream.delete(token));
    });
  }

  private async handlePostRequest(
    headers: Record<string, string | undefined>,
    body: unknown,
    sseStream?: SSEStream
  ): Promise<{ status: number; headers?: Record<string, string>; body?: unknown }> {
    // 1) Validate Accept header
    const acceptValidation = this.validateAccept(headers);
    if (acceptValidation) return acceptValidation;

    // 2) Normalize payload → messages
    const messages = this.normalizeMessages(body);

    // 3) Ensure session is initialized / associated
    this.ensureSession(headers, messages);

    // 4) Fast-path: notifications only
    if (!messages.some(isJSONRPCRequest)) {
      for (const message of messages) this.onmessage?.(message);
      return { status: 202 };
    }

    // 5) Decide response mode (SSE or JSON)
    const { existingStreamId, useSSE } = this.selectResponseMode(headers, messages, sseStream);

    if (useSSE && sseStream) {
      return this.processSSEFlow(headers, messages, sseStream, existingStreamId);
    }

    return this.processJsonFlow(headers, messages, existingStreamId);
  }

  // --- helpers -----------------------------------------------------------

  private validateAccept(
    headers: Record<string, string | undefined>
  ): { status: number; body: unknown } | undefined {
    const acceptHeader = headers.accept;
    if (
      acceptHeader &&
      !acceptHeader.includes('application/json') &&
      !acceptHeader.includes('text/event-stream')
    ) {
      return {
        status: 406,
        body: {
          jsonrpc: '2.0',
          error: {
            code: -32000,
            message: 'Not Acceptable: Client must accept application/json or text/event-stream'
          },
          id: null
        }
      };
    }
    return undefined;
  }

  private normalizeMessages(body: unknown): JSONRPCMessage[] {
    return Array.isArray(body) ? (body as JSONRPCMessage[]) : [body as JSONRPCMessage];
  }

  private ensureSession(
    headers: Record<string, string | undefined>,
    messages: JSONRPCMessage[]
  ): void {
    const isInitialization = messages.some(isInitializeRequest);
    if (isInitialization) {
      const sessionId =
        headers['mcp-session-id'] ?? this.sessionIdGenerator?.() ?? crypto.randomUUID();
      this.sessionId = sessionId;
      this.maps.initializedSessions.set(sessionId, true);
      this.onsessioninitialized?.(sessionId);
      return;
    }

    const sessionId = headers['mcp-session-id'];
    if (sessionId) {
      this.sessionId = sessionId;
      if (!this.maps.initializedSessions.has(sessionId)) {
        this.maps.initializedSessions.set(sessionId, true);
        this.onsessioninitialized?.(sessionId);
      }
      return;
    }

    if (!this.sessionId) {
      const newSessionId = this.sessionIdGenerator?.() ?? crypto.randomUUID();
      this.sessionId = newSessionId;
      this.maps.initializedSessions.set(newSessionId, true);
      this.onsessioninitialized?.(newSessionId);
    }
  }

  private selectResponseMode(
    headers: Record<string, string | undefined>,
    messages: JSONRPCMessage[],
    _sseStream?: SSEStream
  ): { existingStreamId?: string; useSSE: boolean } {
    const hasProgressToken = messages.some(
      (msg) =>
        isJSONRPCRequest(msg) &&
        (msg as { params?: { _meta?: { progressToken?: string } } }).params?._meta?.progressToken
    );
    const isToolCall = messages.some((msg) => isJSONRPCRequest(msg) && msg.method === 'tools/call');
    const sessionId = headers['mcp-session-id'];
    const existingStreamId = sessionId ? this.maps.sessionIdToStream.get(sessionId) : undefined;
    const useSSE = Boolean(
      (hasProgressToken || isToolCall) && headers.accept?.includes('text/event-stream')
    );
    return { existingStreamId, useSSE };
  }

  private async processSSEFlow(
    _headers: Record<string, string | undefined>,
    messages: JSONRPCMessage[],
    sseStream: SSEStream,
    existingStreamId?: string
  ): Promise<{ status: number }> {
    const streamId = crypto.randomUUID();

    const responsePromise = new Promise<void>((resolve) => {
      this.maps.streamMapping.set(streamId, {
        stream: sseStream,
        createdAt: Date.now(),
        lastActivityAt: Date.now(),
        resolveResponse: resolve
      });
    });

    // Map requests to stream
    mapRequestsToStream(this.maps, messages, streamId, existingStreamId);

    // Process
    for (const message of messages) this.onmessage?.(message);

    // Wait for response with timeout
    const timeout = new Promise((_, reject) =>
      setTimeout(() => reject(new Error('Timeout')), 120000)
    );
    try {
      await Promise.race([responsePromise, timeout]);
    } catch {
      await sseStream.write(
        `data: ${JSON.stringify({
          jsonrpc: '2.0',
          error: { code: -32001, message: 'Request timed out' },
          id: messages.find(isJSONRPCRequest)?.id ?? null
        })}\n\n`
      );
    } finally {
      this.maps.streamMapping.delete(streamId);
      unmapRequests(this.maps, messages);
    }

    return { status: 200 };
  }

  private async processJsonFlow(
    _headers: Record<string, string | undefined>,
    messages: JSONRPCMessage[],
    existingStreamId?: string
  ): Promise<{ status: number; headers: Record<string, string>; body: unknown }> {
    const responses: JSONRPCMessage[] = [];

    for (const message of messages) {
      if (isJSONRPCRequest(message) && message.params?._meta?.progressToken && existingStreamId) {
        this.maps.progressTokenToStream.set(message.params._meta.progressToken, existingStreamId);
      }

      this.onmessage?.(message);

      if (isJSONRPCRequest(message)) {
        const startTime = Date.now();
        while (Date.now() - startTime < 30000) {
          const response = this.maps.requestResponseMap.get(message.id);
          if (response) {
            responses.push(response);
            this.maps.requestResponseMap.delete(message.id);
            break;
          }
          await new Promise((resolve) => setTimeout(resolve, 10));
        }
      }
    }

    const responseHeaders: Record<string, string> = {};
    if (this.sessionId) responseHeaders['mcp-session-id'] = this.sessionId;

    return {
      status: 200,
      headers: responseHeaders,
      body: responses.length === 1 ? responses[0] : responses
    };
  }

  // eslint-disable-next-line @typescript-eslint/require-await
  private async handleDeleteRequest(
    headers: Record<string, string | undefined>
  ): Promise<{ status: number }> {
    // Optional session validation - be permissive
    const sessionId = headers['mcp-session-id'];
    if (sessionId && this.maps.initializedSessions.has(sessionId)) {
      // Clean up specific session
      this.maps.initializedSessions.delete(sessionId);
      if (this.onsessionclosed) {
        this.onsessionclosed(sessionId);
      }
    }

    // Return success even without valid session
    return { status: 200 };
  }

  // startCleanupInterval removed in favor of CleanupScheduler (kept via constructor/start)
}

// Re-export SSEStream type for public API compatibility
export type { SSEStream } from './session-map.js';
