import { describe, it, expect, beforeEach } from 'vitest';
import { pubsubManager } from '../src/pubsub';
import { dispatchCommand } from '../src/commands';
import { ClientContext } from '../src/commands/types';
import net from 'net';

function createMockClient(id: number): { client: ClientContext; received: string[] } {
    const received: string[] = [];
    const mockSocket = {
        writable: true,
        write: (data: string | Buffer) => {
            received.push(data.toString());
            return true;
        },
    } as unknown as net.Socket;

    const client: ClientContext = {
        id,
        socket: mockSocket,
        subscriptions: new Set(),
        inMulti: false,
        multiQueue: [],
    };

    return { client, received };
}

describe('Pub/Sub', () => {
    beforeEach(() => {
        // Clear subscriptions
    });

    it('subscribes a client to a channel and returns RESP array', () => {
        const { client } = createMockClient(1);
        const reply = dispatchCommand(['SUBSCRIBE', 'news'], client);

        expect(reply).toBe('*3\r\n$9\r\nsubscribe\r\n$4\r\nnews\r\n:1\r\n');
        expect(client.subscriptions.has('news')).toBe(true);

        pubsubManager.removeClient(client);
    });

    it('subscribes to multiple channels in a single command', () => {
        const { client } = createMockClient(1);
        const reply = dispatchCommand(['SUBSCRIBE', 'ch1', 'ch2'], client);

        const expected =
            '*3\r\n$9\r\nsubscribe\r\n$3\r\nch1\r\n:1\r\n' +
            '*3\r\n$9\r\nsubscribe\r\n$3\r\nch2\r\n:2\r\n';
        expect(reply).toBe(expected);
        expect(client.subscriptions.size).toBe(2);

        pubsubManager.removeClient(client);
    });

    it('publishes to channel with 0 subscribers', () => {
        const reply = dispatchCommand(['PUBLISH', 'empty-channel', 'hello']);
        expect(reply).toBe(':0\r\n');
    });

    it('publishes message to multiple subscribed clients', () => {
        const sub1 = createMockClient(1);
        const sub2 = createMockClient(2);
        const nonSub = createMockClient(3);

        dispatchCommand(['SUBSCRIBE', 'sports'], sub1.client);
        dispatchCommand(['SUBSCRIBE', 'sports'], sub2.client);
        dispatchCommand(['SUBSCRIBE', 'tech'], nonSub.client);

        const publishReply = dispatchCommand(['PUBLISH', 'sports', 'Goal!']);
        expect(publishReply).toBe(':2\r\n');

        const expectedMsg = '*3\r\n$7\r\nmessage\r\n$6\r\nsports\r\n$5\r\nGoal!\r\n';
        expect(sub1.received).toContain(expectedMsg);
        expect(sub2.received).toContain(expectedMsg);
        expect(nonSub.received).not.toContain(expectedMsg);

        pubsubManager.removeClient(sub1.client);
        pubsubManager.removeClient(sub2.client);
        pubsubManager.removeClient(nonSub.client);
    });

    it('unsubscribes from a specific channel', () => {
        const { client } = createMockClient(1);
        dispatchCommand(['SUBSCRIBE', 'c1', 'c2'], client);

        const reply = dispatchCommand(['UNSUBSCRIBE', 'c1'], client);
        expect(reply).toBe('*3\r\n$11\r\nunsubscribe\r\n$2\r\nc1\r\n:1\r\n');
        expect(client.subscriptions.has('c1')).toBe(false);
        expect(client.subscriptions.has('c2')).toBe(true);

        pubsubManager.removeClient(client);
    });

    it('unsubscribes from all channels if none specified', () => {
        const { client } = createMockClient(1);
        dispatchCommand(['SUBSCRIBE', 'c1', 'c2'], client);

        const reply = dispatchCommand(['UNSUBSCRIBE'], client);
        expect(client.subscriptions.size).toBe(0);
        expect(reply).toContain('unsubscribe');

        pubsubManager.removeClient(client);
    });

    it('removeClient stops delivering messages after disconnect', () => {
        const { client, received } = createMockClient(1);
        dispatchCommand(['SUBSCRIBE', 'alerts'], client);

        pubsubManager.removeClient(client);

        const pubReply = dispatchCommand(['PUBLISH', 'alerts', 'Warning!']);
        expect(pubReply).toBe(':0\r\n');
        expect(received).toHaveLength(0);
    });

    it('errors on invalid arguments', () => {
        expect(dispatchCommand(['SUBSCRIBE'])).toMatch(/wrong number of arguments/);
        expect(dispatchCommand(['PUBLISH', 'only-one-arg'])).toMatch(/wrong number of arguments/);
    });
});
