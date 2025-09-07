/**
 * StreamableHTTPTransport for MCP
 * Based on MCP SDK's StreamableHTTPServerTransport
 * Handles HTTP POST requests and SSE streaming for notifications
 */

import type { Transport } from '@modelcontextprotocol/sdk/shared/transport.js';
import type {
  JSONRPCMessage,
  JSONRPCNotification,
  RequestId
} from '@modelcontextprotocol/sdk/types.js';
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

export type SSEStream = {
  closed: boolean;
  close: () => Promise<void>;
  write: (data: string) => Promise<void>;
  onAbort?: (callback: () => void) => void;
};

type StreamData = {
  stream: SSEStream;
  createdAt: number;
  lastActivityAt?: number;
  resolveResponse?: () => void;
  keepaliveInterval?: ReturnType<typeof setInterval>;
};

export class StreamableHTTPTransport implements Transport {
  private started = false;
  private initializedSessions = new Map<string, boolean>();
  private sessionIdGenerator?: () => string;
  private onsessioninitialized?: (sessionId: string) => void;
  private onsessionclosed?: (sessionId: string) => void;
  // Configurable heartbeat interval for SSE keepalive
  private keepAliveMs = 30000;

  // Stream management
  private streamMapping = new Map<string, StreamData>();
  private requestToStreamMapping = new Map<RequestId, string>();
  private requestResponseMap = new Map<RequestId, JSONRPCMessage>();
  private progressTokenToStream = new Map<string | number, string>(); // progressToken -> streamId
  private sessionIdToStream = new Map<string, string>(); // sessionId -> streamId

  // Cleanup settings
  private readonly maxMapSize = 1000;
  // Consider a stream stale only after prolonged inactivity.
  // Keep above keepAliveMs to avoid dropping active streams. [REH][SF]
  private readonly ttlMs = 120000;
  private cleanupInterval?: ReturnType<typeof setInterval>;

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
    this.startCleanupInterval();
  }

  async close(): Promise<void> {
    if (!this.started) {
      return;
    }

    // Close all streams
    for (const [, streamData] of this.streamMapping.entries()) {
      if (streamData.keepaliveInterval) {
        clearInterval(streamData.keepaliveInterval);
      }
      await streamData.stream.close();
    }

    // Clear maps
    this.streamMapping.clear();
    this.requestToStreamMapping.clear();
    this.requestResponseMap.clear();
    this.progressTokenToStream.clear();
    this.sessionIdToStream.clear();
    this.initializedSessions.clear();

    // Stop cleanup interval
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
    }

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
      const streamId = this.requestToStreamMapping.get(requestId);
      if (streamId) {
        await this.writeToStream(streamId, message, true);
        // Clean up mappings
        this.requestToStreamMapping.delete(requestId);
        this.requestResponseMap.delete(requestId);
      } else {
        // Store response for JSON response mode
        this.requestResponseMap.set(requestId, message);
      }
    }
    // Handle notification messages
    else if (!('id' in message)) {
      // Route progress notifications to specific streams
      const notification = message as { method?: string; params?: { progressToken?: string } };
      if (notification.method === 'notifications/progress' && notification.params?.progressToken) {
        await this.routeProgressNotification(notification.params.progressToken, message);
      } else {
        await this.broadcastNotification(message);
      }
    }
  }

  // --- notification helpers ---------------------------------------------

  private async writeToStream(
    streamId: string,
    message: JSONRPCMessage,
    isResponse = false
  ): Promise<void> {
    const streamData = this.streamMapping.get(streamId);
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
    const streamId = this.progressTokenToStream.get(token);
    if (!streamId) return;
    await this.writeToStream(streamId, message, false);
  }

  private async broadcastNotification(message: JSONRPCMessage): Promise<void> {
    const tasks: Array<Promise<void>> = [];
    for (const [streamId, streamData] of this.streamMapping.entries()) {
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
      method: 'notifications/progress',
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
          const sd = this.streamMapping.get(streamId);
          if (sd) sd.lastActivityAt = Date.now();
        } catch {
          clearInterval(keepaliveInterval);
        }
      })();
    }, this.keepAliveMs);

    this.streamMapping.set(streamId, {
      stream: sseStream,
      createdAt: Date.now(),
      lastActivityAt: Date.now(),
      keepaliveInterval
    });
    return { streamId, keepaliveInterval };
  }

  private mapSessionToStream(sessionId: string, streamId: string): void {
    this.sessionIdToStream.set(sessionId, streamId);
  }

  private attachSseCleanup(
    sseStream: SSEStream,
    streamId: string,
    keepaliveInterval: ReturnType<typeof setInterval>
  ): void {
    sseStream.onAbort?.(() => {
      clearInterval(keepaliveInterval);
      this.streamMapping.delete(streamId);

      for (const [sid, sId] of this.sessionIdToStream.entries()) {
        if (sId === streamId) {
          this.sessionIdToStream.delete(sid);
          break;
        }
      }

      const tokensToDelete: Array<string | number> = [];
      for (const [token, sid] of this.progressTokenToStream.entries()) {
        if (sid === streamId) tokensToDelete.push(token);
      }
      tokensToDelete.forEach((token) => this.progressTokenToStream.delete(token));
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
      this.initializedSessions.set(sessionId, true);
      this.onsessioninitialized?.(sessionId);
      return;
    }

    const sessionId = headers['mcp-session-id'];
    if (sessionId) {
      this.sessionId = sessionId;
      if (!this.initializedSessions.has(sessionId)) {
        this.initializedSessions.set(sessionId, true);
        this.onsessioninitialized?.(sessionId);
      }
      return;
    }

    if (!this.sessionId) {
      const newSessionId = this.sessionIdGenerator?.() ?? crypto.randomUUID();
      this.sessionId = newSessionId;
      this.initializedSessions.set(newSessionId, true);
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
    const existingStreamId = sessionId ? this.sessionIdToStream.get(sessionId) : undefined;
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
      this.streamMapping.set(streamId, {
        stream: sseStream,
        createdAt: Date.now(),
        lastActivityAt: Date.now(),
        resolveResponse: resolve
      });
    });

    // Map requests to stream
    for (const message of messages) {
      if (isJSONRPCRequest(message)) {
        this.requestToStreamMapping.set(message.id, streamId);
        if (message.params?._meta?.progressToken) {
          const streamIdToUse = existingStreamId ?? streamId;
          this.progressTokenToStream.set(message.params._meta.progressToken, streamIdToUse);
        }
      }
    }

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
      this.streamMapping.delete(streamId);
      for (const message of messages) {
        if (isJSONRPCRequest(message)) {
          this.requestToStreamMapping.delete(message.id);
          if (message.params?._meta?.progressToken) {
            this.progressTokenToStream.delete(message.params._meta.progressToken);
          }
        }
      }
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
        this.progressTokenToStream.set(message.params._meta.progressToken, existingStreamId);
      }

      this.onmessage?.(message);

      if (isJSONRPCRequest(message)) {
        const startTime = Date.now();
        while (Date.now() - startTime < 30000) {
          const response = this.requestResponseMap.get(message.id);
          if (response) {
            responses.push(response);
            this.requestResponseMap.delete(message.id);
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
    if (sessionId && this.initializedSessions.has(sessionId)) {
      // Clean up specific session
      this.initializedSessions.delete(sessionId);
      if (this.onsessionclosed) {
        this.onsessionclosed(sessionId);
      }
    }

    // Return success even without valid session
    return { status: 200 };
  }

  private startCleanupInterval(): void {
    this.cleanupInterval = setInterval(() => {
      const now = Date.now();

      // Clean up closed or truly idle streams only [REH]
      for (const [streamId, streamData] of this.streamMapping.entries()) {
        const idleFor = now - (streamData.lastActivityAt ?? streamData.createdAt);
        if (streamData.stream.closed || idleFor > this.ttlMs) {
          if (streamData.keepaliveInterval) {
            clearInterval(streamData.keepaliveInterval);
          }
          this.streamMapping.delete(streamId);
        }
      }

      // Clean up old sessions
      if (this.initializedSessions.size > this.maxMapSize) {
        const toDelete = this.initializedSessions.size - this.maxMapSize;
        const iterator = this.initializedSessions.keys();
        for (let i = 0; i < toDelete; i++) {
          const key = iterator.next().value;
          if (key) {
            this.initializedSessions.delete(key);
          }
        }
      }
    }, 10000);
  }
}
