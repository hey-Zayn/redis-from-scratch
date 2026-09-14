import { ClientContext } from '../commands/types';
import { pubsubEvent } from '../resp/serializer';

export class PubSubManager {
    // Maps channel name -> Set of client contexts subscribed
    private channels: Map<string, Set<ClientContext>> = new Map();

    /**
     * Subscribes a client to a channel.
     * Returns the total count of channels this client is now subscribed to.
     */
    public subscribe(client: ClientContext, channel: string): number {
        let subscribers = this.channels.get(channel);
        if (!subscribers) {
            subscribers = new Set();
            this.channels.set(channel, subscribers);
        }
        subscribers.add(client);
        client.subscriptions.add(channel);
        return client.subscriptions.size;
    }

    /**
     * Unsubscribes a client from a channel (or all channels if channel is not specified).
     * Returns an array of unsubscribe events ({ channel, remainingCount }).
     */
    public unsubscribe(client: ClientContext, channel?: string): Array<{ channel: string; remaining: number }> {
        const events: Array<{ channel: string; remaining: number }> = [];

        if (channel) {
            const subscribers = this.channels.get(channel);
            if (subscribers) {
                subscribers.delete(client);
                if (subscribers.size === 0) {
                    this.channels.delete(channel);
                }
            }
            client.subscriptions.delete(channel);
            events.push({ channel, remaining: client.subscriptions.size });
        } else {
            // Unsubscribe from all
            const allChannels = Array.from(client.subscriptions);
            if (allChannels.length === 0) {
                events.push({ channel: '', remaining: 0 });
            } else {
                for (const ch of allChannels) {
                    const subscribers = this.channels.get(ch);
                    if (subscribers) {
                        subscribers.delete(client);
                        if (subscribers.size === 0) {
                            this.channels.delete(ch);
                        }
                    }
                    client.subscriptions.delete(ch);
                    events.push({ channel: ch, remaining: client.subscriptions.size });
                }
            }
        }

        return events;
    }

    /**
     * Publishes a message to all subscribers of a channel.
     * Returns the count of subscribers that received the message.
     */
    public publish(channel: string, message: string): number {
        const subscribers = this.channels.get(channel);
        if (!subscribers || subscribers.size === 0) {
            return 0;
        }

        const msgPayload = pubsubEvent('message', channel, message);
        let delivered = 0;

        for (const client of subscribers) {
            if (client.socket && client.socket.writable) {
                try {
                    client.socket.write(msgPayload);
                    delivered++;
                } catch {
                    // Ignore write failures to closed sockets
                }
            }
        }

        return delivered;
    }

    /**
     * Called when a client disconnects to clean up all its channel registrations.
     */
    public removeClient(client: ClientContext): void {
        for (const channel of client.subscriptions) {
            const subscribers = this.channels.get(channel);
            if (subscribers) {
                subscribers.delete(client);
                if (subscribers.size === 0) {
                    this.channels.delete(channel);
                }
            }
        }
        client.subscriptions.clear();
    }
}

export const pubsubManager = new PubSubManager();
