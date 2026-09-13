import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { Keyspace } from '../src/store/keyspace';

describe('Keyspace TTL and Expiry', () => {
    let keyspace: Keyspace;

    beforeEach(() => {
        keyspace = new Keyspace();
        vi.useFakeTimers();
    });

    afterEach(() => {
        vi.useRealTimers();
    });

    it('handles TTL calculations and expiration with fake timers', () => {
        keyspace.set('foo', 'bar');
        keyspace.expire('foo', 5);          // expiresAt = now + 5000ms
        expect(keyspace.ttl('foo')).toBe(5); // remainingMs = 5000 → ceil(5000/1000) = 5 ✓

        vi.advanceTimersByTime(2000);        // fake clock jumps forward 2000ms
        expect(keyspace.ttl('foo')).toBe(3); // remainingMs = 5000-2000 = 3000 → ceil(3000/1000) = 3 ✓

        vi.advanceTimersByTime(3100);        // total elapsed: 2000+3100 = 5100ms
        expect(keyspace.ttl('foo')).toBe(-2); // remainingMs = 5000-5100 = -100 → isExpired() is true → -2 ✓
    });

    it('returns -1 for keys with no expiry set', () => {
        keyspace.set('foo', 'bar');
        expect(keyspace.ttl('foo')).toBe(-1);
    });

    it('returns -2 for non-existent keys', () => {
        expect(keyspace.ttl('does_not_exist')).toBe(-2);
    });

    it('handles lazy expiry on get() and exists()', () => {
        keyspace.set('temp', 'value');
        keyspace.expire('temp', 1);

        vi.advanceTimersByTime(1100);
        expect(keyspace.get('temp')).toBeNull();
        expect(keyspace.exists('temp')).toBe(0);
        expect(keyspace.size()).toBe(0);
    });

    it('handles active expiry via sweepExpired()', () => {
        keyspace.set('temp1', 'val1');
        keyspace.set('temp2', 'val2');
        keyspace.expire('temp1', 2);
        keyspace.expire('temp2', 10);

        expect(keyspace.size()).toBe(2);

        vi.advanceTimersByTime(2100);
        // Prior to sweep, unread expired key temp1 is still in memory
        expect(keyspace.size()).toBe(2);

        keyspace.sweepExpired();
        // temp1 was swept, temp2 remains
        expect(keyspace.size()).toBe(1);
        expect(keyspace.get('temp2')).toBe('val2');
    });

    it('persists a key by clearing its expiry', () => {
        keyspace.set('foo', 'bar');
        keyspace.expire('foo', 10);
        expect(keyspace.ttl('foo')).toBe(10);

        expect(keyspace.persist('foo')).toBe(1);
        expect(keyspace.ttl('foo')).toBe(-1);
        expect(keyspace.persist('foo')).toBe(0); // already has no expiry
    });
});
