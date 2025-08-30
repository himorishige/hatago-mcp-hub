/**
 * StreamableHTTPTransport for MCP
 * Based on MCP SDK's StreamableHTTPServerTransport
 * Handles HTTP POST requests and SSE streaming for notifications
 */

import type { Transport } from '@modelcontextprotocol/sdk/shared/transport.js';
import type {
  JSONRPCMessage,
  JSONRPCNotification,
  RequestId,
} from '@modelcontextprotocol/sdk/types.js';
import {
  isInitializeRequest,
  isJSONRPCError,
  isJSONRPCRequest,
  isJSONRPCResponse,
} from '@modelcontextprotocol/sdk/types.js';

export interface StreamableHTTPTransportOptions {
  sessionIdGenerator?: () => string;
  enableJsonResponse?: boolean;
  onsessioninitialized?: (sessionId: string) => void;
  onsessionclosed?: (sessionId: string) => void;
}

export interface SSEStream {
  closed: boolean;
  close: () => Promise<void>;
  write: (data: string) => Promise<void>;
  onAbort?: (callback: () => void) => void;
}

interface StreamData {
  stream: SSEStream;
  createdAt: number;
  resolveResponse?: () => void;
  keepaliveInterval?: ReturnType<typeof setInterval>;
}

export class StreamableHTTPTransport implements Transport {
  private started = false;
  private initializedSessions = new Map<string, boolean>();
  private sessionIdGenerator?: () => string;
  private onsessioninitialized?: (sessionId: string) => void;
  private onsessionclosed?: (sessionId: string) => void;
  private enableJsonResponse = true;

  // Stream management
  private streamMapping = new Map<string, StreamData>();
  private requestToStreamMapping = new Map<RequestId, string>();
  private requestResponseMap = new Map<RequestId, JSONRPCMessage>();
  private progressTokenToStream = new Map<string | number, string>(); // progressToken -> streamId
  private sessionIdToStream = new Map<string, string>(); // sessionId -> streamId

  // Cleanup settings
  private readonly maxMapSize = 1000;
  private readonly ttlMs = 30000;
  private cleanupInterval?: ReturnType<typeof setInterval>;

  sessionId?: string;
  onclose?: () => void;
  onerror?: (error: Error) => void;
  onmessage?: (message: JSONRPCMessage) => void;

  constructor(options?: StreamableHTTPTransportOptions) {
    this.sessionIdGenerator = options?.sessionIdGenerator;
    this.enableJsonResponse = options?.enableJsonResponse ?? true;
    this.onsessioninitialized = options?.onsessioninitialized;
    this.onsessionclosed = options?.onsessionclosed;
  }

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
    for (const [_streamId, streamData] of this.streamMapping.entries()) {
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

  async send(message: JSONRPCMessage): Promise<void> {
    if (!this.started) {
      throw new Error('Transport not started');
    }

    // Handle response messages
    if (isJSONRPCResponse(message) || isJSONRPCError(message)) {
      const requestId = message.id;
      const streamId = this.requestToStreamMapping.get(requestId);

      if (streamId) {
        const streamData = this.streamMapping.get(streamId);
        if (streamData?.stream) {
          // Send response via SSE
          await streamData.stream.write(`data: ${JSON.stringify(message)}\n\n`);

          // Resolve the response promise to close the stream
          streamData.resolveResponse?.();

          // Clean up mappings
          this.requestToStreamMapping.delete(requestId);
          this.requestResponseMap.delete(requestId);
        }
      } else {
        // Store response for JSON response mode
        this.requestResponseMap.set(requestId, message);
      }
    }
    // Handle notification messages
    else if (!('id' in message)) {
      // Route progress notifications to specific streams
      const notification = message as any;
      if (
        notification.method === 'notifications/progress' &&
        notification.params?.progressToken
      ) {
        const streamId = this.progressTokenToStream.get(
          notification.params.progressToken,
        );
        if (streamId) {
          const streamData = this.streamMapping.get(streamId);
          if (streamData?.stream && !streamData.stream.closed) {
            try {
              await streamData.stream.write(
                `data: ${JSON.stringify(message)}\n\n`,
              );
            } catch (error) {
              console.error('Failed to send progress notification:', error);
            }
          }
        }
      } else {
        // For other notifications, broadcast to all active streams
        // (This could be further refined to use session-specific streams)
        for (const streamData of this.streamMapping.values()) {
          if (streamData.stream && !streamData.stream.closed) {
            try {
              await streamData.stream.write(
                `data: ${JSON.stringify(message)}\n\n`,
              );
            } catch (error) {
              console.error('Failed to send notification:', error);
            }
          }
        }
      }
    }
  }

  /**
   * Send progress notification
   */
  async sendProgressNotification(
    progressToken: string | number,
    progress: number,
    total?: number,
    message?: string,
  ): Promise<void> {
    const notification: JSONRPCNotification = {
      jsonrpc: '2.0',
      method: 'notifications/progress',
      params: {
        progressToken,
        progress,
        ...(total !== undefined && { total }),
        ...(message !== undefined && { message }),
      },
    };

    await this.send(notification);
  }

  /**
   * Handle incoming HTTP request
   */
  async handleHttpRequest(
    method: string,
    headers: Record<string, string | undefined>,
    body?: any,
    sseStream?: SSEStream,
  ): Promise<
    | {
        status: number;
        headers?: Record<string, string>;
        body?: any;
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
              message: 'Method not allowed',
            },
            id: null,
          },
        };
    }
  }

  private async handleGetRequest(
    headers: Record<string, string | undefined>,
    sseStream?: SSEStream,
  ): Promise<undefined> {
    if (!sseStream) {
      throw new Error('SSE stream required for GET request');
    }

    // Generate or get session ID
    const sessionId =
      headers['mcp-session-id'] ||
      this.sessionIdGenerator?.() ||
      crypto.randomUUID();

    this.sessionId = sessionId;

    // Initialize session
    if (this.onsessioninitialized) {
      this.onsessioninitialized(sessionId);
    }

    // Set up keepalive
    const keepaliveInterval = setInterval(async () => {
      try {
        await sseStream.write(':heartbeat\n\n');
      } catch {
        clearInterval(keepaliveInterval);
      }
    }, 30000);

    // Store stream data
    const streamId = crypto.randomUUID();
    this.streamMapping.set(streamId, {
      stream: sseStream,
      createdAt: Date.now(),
      keepaliveInterval,
    });

    // Map sessionId to streamId
    this.sessionIdToStream.set(sessionId, streamId);

    // Clean up on close
    sseStream.onAbort?.(() => {
      clearInterval(keepaliveInterval);
      this.streamMapping.delete(streamId);

      // Clean up sessionId mapping
      for (const [sid, sId] of this.sessionIdToStream.entries()) {
        if (sId === streamId) {
          this.sessionIdToStream.delete(sid);
          break;
        }
      }

      // Clean up any progressToken mappings for this stream
      const tokensToDelete: Array<string | number> = [];
      for (const [token, sid] of this.progressTokenToStream.entries()) {
        if (sid === streamId) {
          tokensToDelete.push(token);
        }
      }
      tokensToDelete.forEach((token) => {
        this.progressTokenToStream.delete(token);
      });
    });

    // Return undefined to indicate SSE response is handled
    return undefined;
  }

  private async handlePostRequest(
    headers: Record<string, string | undefined>,
    body: any,
    sseStream?: SSEStream,
  ): Promise<{ status: number; headers?: Record<string, string>; body?: any }> {
    // Validate Accept header - at least one of the required types
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
            message:
              'Not Acceptable: Client must accept application/json or text/event-stream',
          },
          id: null,
        },
      };
    }

    // Parse messages
    const messages: JSONRPCMessage[] = Array.isArray(body) ? body : [body];

    // Check for initialization
    const isInitialization = messages.some(isInitializeRequest);
    if (isInitialization) {
      const sessionId =
        headers['mcp-session-id'] ||
        this.sessionIdGenerator?.() ||
        crypto.randomUUID();

      this.sessionId = sessionId;
      this.initializedSessions.set(sessionId, true);

      if (this.onsessioninitialized) {
        this.onsessioninitialized(sessionId);
      }
    } else {
      // Handle non-initialization requests
      const sessionId = headers['mcp-session-id'];
      if (sessionId) {
        // Use provided session ID
        this.sessionId = sessionId;
        if (!this.initializedSessions.has(sessionId)) {
          // Auto-initialize if not already initialized
          this.initializedSessions.set(sessionId, true);
          if (this.onsessioninitialized) {
            this.onsessioninitialized(sessionId);
          }
        }
      } else if (!this.sessionId) {
        // Generate new session ID if none exists
        const newSessionId = this.sessionIdGenerator?.() || crypto.randomUUID();
        this.sessionId = newSessionId;
        this.initializedSessions.set(newSessionId, true);
        if (this.onsessioninitialized) {
          this.onsessioninitialized(newSessionId);
        }
      }
    }

    // Process messages
    const hasRequests = messages.some(isJSONRPCRequest);

    // Handle notifications only
    if (!hasRequests) {
      for (const message of messages) {
        this.onmessage?.(message);
      }
      return { status: 202 };
    }

    // Check if SSE response is needed
    const hasProgressToken = messages.some(
      (msg: any) => isJSONRPCRequest(msg) && msg.params?._meta?.progressToken,
    );
    const isToolCall = messages.some(
      (msg: any) => isJSONRPCRequest(msg) && msg.method === 'tools/call',
    );

    // Check if there's an existing SSE stream for this session (from GET request)
    const sessionId = headers['mcp-session-id'];
    const existingStreamId = sessionId
      ? this.sessionIdToStream.get(sessionId)
      : undefined;

    // Use SSE for long-running operations
    if (
      (hasProgressToken || isToolCall) &&
      sseStream &&
      headers.accept?.includes('text/event-stream')
    ) {
      const streamId = crypto.randomUUID();

      // Set up response promise
      const responsePromise = new Promise<void>((resolve) => {
        this.streamMapping.set(streamId, {
          stream: sseStream,
          createdAt: Date.now(),
          resolveResponse: resolve,
        });
      });

      // Map requests to stream
      for (const message of messages) {
        if (isJSONRPCRequest(message)) {
          this.requestToStreamMapping.set(message.id, streamId);

          // Map progressToken to stream if present
          if (message.params?._meta?.progressToken) {
            // If there's an existing GET SSE stream for this session, map to that instead
            const streamIdToUse = existingStreamId || streamId;
            this.progressTokenToStream.set(
              message.params._meta.progressToken,
              streamIdToUse,
            );
          }
        }
      }

      // Process messages
      for (const message of messages) {
        this.onmessage?.(message);
      }

      // Wait for response with timeout
      const timeout = new Promise((_, reject) =>
        setTimeout(() => reject(new Error('Timeout')), 120000),
      );

      try {
        await Promise.race([responsePromise, timeout]);
      } catch {
        // Send timeout error
        await sseStream.write(
          `data: ${JSON.stringify({
            jsonrpc: '2.0',
            error: { code: -32001, message: 'Request timed out' },
            id: messages.find(isJSONRPCRequest)?.id || null,
          })}\n\n`,
        );
      } finally {
        // Clean up
        this.streamMapping.delete(streamId);
        for (const message of messages) {
          if (isJSONRPCRequest(message)) {
            this.requestToStreamMapping.delete(message.id);

            // Clean up progressToken mapping
            if (message.params?._meta?.progressToken) {
              this.progressTokenToStream.delete(
                message.params._meta.progressToken,
              );
            }
          }
        }
      }

      return { status: 200 };
    }

    // JSON response mode
    const responses: JSONRPCMessage[] = [];

    for (const message of messages) {
      // Map progressToken to existing GET SSE stream if available
      if (
        isJSONRPCRequest(message) &&
        message.params?._meta?.progressToken &&
        existingStreamId
      ) {
        this.progressTokenToStream.set(
          message.params._meta.progressToken,
          existingStreamId,
        );
      }

      this.onmessage?.(message);

      if (isJSONRPCRequest(message)) {
        // Wait for response
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

    // Return response
    const responseHeaders: Record<string, string> = {};
    if (this.sessionId) {
      responseHeaders['mcp-session-id'] = this.sessionId;
    }

    return {
      status: 200,
      headers: responseHeaders,
      body: responses.length === 1 ? responses[0] : responses,
    };
  }

  private async handleDeleteRequest(
    headers: Record<string, string | undefined>,
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

      // Clean up old streams
      for (const [streamId, streamData] of this.streamMapping.entries()) {
        if (
          now - streamData.createdAt > this.ttlMs ||
          streamData.stream.closed
        ) {
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
