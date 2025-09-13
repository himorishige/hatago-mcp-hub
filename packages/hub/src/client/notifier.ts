import type { Client } from '@modelcontextprotocol/sdk/client/index.js';
import type { JSONRPCMessage } from '@modelcontextprotocol/sdk/types.js';
import type { Logger } from '../logger.js';
import type { HubEvent } from '../types.js';
import type { RelayTransport } from '@himorishige/hatago-transport';

type NotifierHub = {
  logger: Logger;
  emit: (event: HubEvent, data: unknown) => void;
  onNotification?: (n: JSONRPCMessage) => Promise<void>;
  getStreamableTransport: () => RelayTransport | undefined;
};

export function attachClientNotificationForwarder(
  hub: NotifierHub,
  client: Client,
  serverId: string
): void {
  const clientWithHandler = client as Client & {
    // Be permissive on the notification type to satisfy SDK overloads
    fallbackNotificationHandler?: (notification: unknown) => Promise<void>;
  };

  clientWithHandler.fallbackNotificationHandler = async (notification: unknown) => {
    hub.logger.debug(`[Hub] Notification from server ${serverId}`, { notification });

    if (hub.onNotification) {
      await hub.onNotification(notification as JSONRPCMessage);
    }

    const transport = hub.getStreamableTransport();
    if (transport) {
      await (transport as unknown).send(notification as JSONRPCMessage);
    }

    hub.emit('server:notification', { serverId, notification });
  };
}
