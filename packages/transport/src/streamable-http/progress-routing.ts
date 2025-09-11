import type { JSONRPCMessage, JSONRPCRequest } from '@modelcontextprotocol/sdk/types.js';
import type { SessionMaps } from './session-map.js';

export function mapRequestsToStream(
  maps: SessionMaps,
  messages: JSONRPCMessage[],
  streamId: string,
  existingStreamId?: string
): void {
  for (const message of messages) {
    if (isRequest(message)) {
      maps.requestToStreamMapping.set(message.id, streamId);
      const meta = (message.params as { _meta?: { progressToken?: string } } | undefined)?._meta;
      if (meta?.progressToken !== undefined) {
        const idToUse = existingStreamId ?? streamId;
        maps.progressTokenToStream.set(meta.progressToken, idToUse);
      }
    }
  }
}

export function unmapRequests(maps: SessionMaps, messages: JSONRPCMessage[]): void {
  for (const message of messages) {
    if (isRequest(message)) {
      maps.requestToStreamMapping.delete(message.id);
      const meta = (message.params as { _meta?: { progressToken?: string } } | undefined)?._meta;
      if (meta?.progressToken !== undefined) {
        maps.progressTokenToStream.delete(meta.progressToken);
      }
    }
  }
}

export function isRequest(msg: JSONRPCMessage): msg is JSONRPCRequest {
  return 'method' in msg && 'id' in msg;
}
