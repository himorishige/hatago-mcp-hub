import type { JSONRPCMessage, RequestId } from '@modelcontextprotocol/sdk/types.js';

export type SSEStream = {
  closed: boolean;
  close: () => Promise<void>;
  write: (data: string) => Promise<void>;
  onAbort?: (callback: () => void) => void;
};

export type StreamData = {
  stream: SSEStream;
  createdAt: number;
  lastActivityAt?: number;
  resolveResponse?: () => void;
  keepaliveInterval?: ReturnType<typeof setInterval>;
};

export class SessionMaps {
  readonly streamMapping = new Map<string, StreamData>();
  readonly requestToStreamMapping = new Map<RequestId, string>();
  readonly requestResponseMap = new Map<RequestId, JSONRPCMessage>();
  readonly progressTokenToStream = new Map<string | number, string>();
  readonly sessionIdToStream = new Map<string, string>();
  readonly initializedSessions = new Map<string, boolean>();

  clearAll(): void {
    this.streamMapping.clear();
    this.requestToStreamMapping.clear();
    this.requestResponseMap.clear();
    this.progressTokenToStream.clear();
    this.sessionIdToStream.clear();
    this.initializedSessions.clear();
  }
}
