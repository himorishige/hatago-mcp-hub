import type { Prompt, Resource, Tool } from '@himorishige/hatago-core';

// Internal event map used for typed emitter experiments. Not wired yet. [SF][DM]
export type HubEvents = {
  'server:connected': { serverId: string };
  'server:disconnected': { serverId: string };
  'server:error': { serverId: string; error: unknown };
  'server:notification': { serverId: string; notification: unknown };

  'tool:registered': { serverId: string; tool: Tool };
  'tool:called': { name: string; serverId?: string; publicName: string; result: unknown };
  // Present in implementation but not part of public HubEvent union yet
  'tool:error': {
    name: string;
    serverId?: string;
    publicName: string;
    error: { name?: string; message: string };
  };

  'resource:registered': { serverId: string; resource: Resource };
  'resource:read': { uri: string; serverId?: string; result: unknown };

  'prompt:registered': { serverId: string; prompt: Prompt };
  'prompt:got': { name: string; args?: unknown; result: unknown };
};

export const HUB_EVENT_KEYS = {
  serverConnected: 'server:connected',
  serverDisconnected: 'server:disconnected',
  serverError: 'server:error',
  serverNotification: 'server:notification',
  toolRegistered: 'tool:registered',
  toolCalled: 'tool:called',
  toolError: 'tool:error',
  resourceRegistered: 'resource:registered',
  resourceRead: 'resource:read',
  promptRegistered: 'prompt:registered',
  promptGot: 'prompt:got'
} as const;
