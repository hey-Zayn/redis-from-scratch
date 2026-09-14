import { describe, it, expect, beforeEach } from 'vitest';
import { dispatchCommand } from '../src/commands';
import { keyspace } from '../src/store/keyspace';
import { ClientContext } from '../src/commands/types';

function createMockClient(id: number = 1): ClientContext {
    return {
        id,
        subscriptions: new Set(),
        inMulti: false,
        multiQueue: [],
    };
}

describe('Transactions (MULTI / EXEC / DISCARD)', () => {
    beforeEach(() => {
        keyspace.clear();
    });

    it('returns error when EXEC or DISCARD is called without MULTI', () => {
        const client = createMockClient();
        expect(dispatchCommand(['EXEC'], client)).toBe('-ERR EXEC without MULTI\r\n');
        expect(dispatchCommand(['DISCARD'], client)).toBe('-ERR DISCARD without MULTI\r\n');
    });

    it('starts a transaction with MULTI and forbids nested MULTI', () => {
        const client = createMockClient();
        const reply1 = dispatchCommand(['MULTI'], client);
        expect(reply1).toBe('+OK\r\n');
        expect(client.inMulti).toBe(true);

        const reply2 = dispatchCommand(['MULTI'], client);
        expect(reply2).toBe('-ERR MULTI calls can not be nested\r\n');
    });

    it('queues commands after MULTI and returns +QUEUED', () => {
        const client = createMockClient();
        dispatchCommand(['MULTI'], client);

        const q1 = dispatchCommand(['SET', 'txkey', 'txval'], client);
        const q2 = dispatchCommand(['GET', 'txkey'], client);

        expect(q1).toBe('+QUEUED\r\n');
        expect(q2).toBe('+QUEUED\r\n');
        expect(client.multiQueue).toHaveLength(2);

        // Not executed yet
        expect(keyspace.get('txkey')).toBeNull();
    });

    it('discards queued commands on DISCARD', () => {
        const client = createMockClient();
        dispatchCommand(['MULTI'], client);
        dispatchCommand(['SET', 'txkey', 'txval'], client);

        const reply = dispatchCommand(['DISCARD'], client);
        expect(reply).toBe('+OK\r\n');
        expect(client.inMulti).toBe(false);
        expect(client.multiQueue).toHaveLength(0);

        // Verification: key was never written
        expect(keyspace.get('txkey')).toBeNull();
    });

    it('executes queued commands atomically on EXEC', () => {
        const client = createMockClient();
        dispatchCommand(['MULTI'], client);
        dispatchCommand(['SET', 'user:1', 'Alice'], client);
        dispatchCommand(['GET', 'user:1'], client);
        dispatchCommand(['LPUSH', 'list:1', 'item1', 'item2'], client);

        const execReply = dispatchCommand(['EXEC'], client);

        // Expected responses:
        // SET -> +OK\r\n
        // GET -> $5\r\nAlice\r\n
        // LPUSH -> :2\r\n
        const expected = '*3\r\n+OK\r\n$5\r\nAlice\r\n:2\r\n';
        expect(execReply).toBe(expected);

        // Client transaction state should be reset
        expect(client.inMulti).toBe(false);
        expect(client.multiQueue).toHaveLength(0);

        // State is actually modified
        expect(keyspace.get('user:1')).toBe('Alice');
        expect(keyspace.lrange('list:1', 0, -1)).toEqual(['item2', 'item1']);
    });

    it('returns empty array when executing an empty transaction', () => {
        const client = createMockClient();
        dispatchCommand(['MULTI'], client);
        const reply = dispatchCommand(['EXEC'], client);
        expect(reply).toBe('*0\r\n');
    });

    it('handles per-command errors inside EXEC without aborting other commands', () => {
        const client = createMockClient();
        dispatchCommand(['SET', 'strkey', 'hello'], client);

        dispatchCommand(['MULTI'], client);
        dispatchCommand(['SET', 'foo', 'bar'], client);
        dispatchCommand(['LPUSH', 'strkey', 'val'], client); // WRONGTYPE error
        dispatchCommand(['GET', 'foo'], client);

        const reply = dispatchCommand(['EXEC'], client);

        // SET -> +OK\r\n
        // LPUSH -> -WRONGTYPE ...
        // GET -> $3\r\nbar\r\n
        expect(reply).toContain('+OK\r\n');
        expect(reply).toContain('-WRONGTYPE');
        expect(reply).toContain('$3\r\nbar\r\n');

        expect(keyspace.get('foo')).toBe('bar');
    });
});
