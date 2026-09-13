import { describe, it, expect, beforeEach } from 'vitest';
import { Keyspace, WrongTypeError } from '../src/store/keyspace';
import { dispatchCommand } from '../src/commands';
import { keyspace } from '../src/store/keyspace';

describe('Sets - Unit Tests', () => {
    let ks: Keyspace;

    beforeEach(() => {
        ks = new Keyspace();
    });

    it('SADD adds members and deduplicates', () => {
        expect(ks.sadd('myset', 'a', 'b', 'c')).toBe(3);
        // Adding duplicate 'a' and 'b', plus new 'd'
        expect(ks.sadd('myset', 'a', 'b', 'd')).toBe(1);
        expect(ks.scard('myset')).toBe(4);
    });

    it('SISMEMBER checks set membership', () => {
        ks.sadd('myset', 'apple', 'banana');
        expect(ks.sismember('myset', 'apple')).toBe(1);
        expect(ks.sismember('myset', 'cherry')).toBe(0);
        expect(ks.sismember('missing_set', 'apple')).toBe(0);
    });

    it('SMEMBERS returns all members', () => {
        ks.sadd('myset', 'x', 'y');
        const members = ks.smembers('myset');
        expect(members.sort()).toEqual(['x', 'y']);
    });

    it('SREM removes members and auto-deletes empty set', () => {
        ks.sadd('myset', 'm1', 'm2');
        expect(ks.srem('myset', 'm1', 'missing')).toBe(1);
        expect(ks.scard('myset')).toBe(1);

        expect(ks.srem('myset', 'm2')).toBe(1);
        expect(ks.exists('myset')).toBe(0);
    });

    it('reports TYPE correctly for all data types', () => {
        ks.set('k_str', 'val');
        ks.lpush('k_list', 'val');
        ks.hset('k_hash', [['f', 'v']]);
        ks.sadd('k_set', 'm');

        expect(ks.type('k_str')).toBe('string');
        expect(ks.type('k_list')).toBe('list');
        expect(ks.type('k_hash')).toBe('hash');
        expect(ks.type('k_set')).toBe('set');
        expect(ks.type('k_nonexistent')).toBe('none');
    });

    it('throws WrongTypeError on mismatched types', () => {
        ks.set('str_key', 'val');
        expect(() => ks.sadd('str_key', 'm')).toThrow(WrongTypeError);
        expect(() => ks.smembers('str_key')).toThrow(WrongTypeError);
        expect(() => ks.sismember('str_key', 'm')).toThrow(WrongTypeError);
    });
});

describe('Sets - Dispatch Integration', () => {
    beforeEach(() => {
        keyspace.clear();
    });

    it('dispatches SADD, SMEMBERS, SISMEMBER, SREM, SCARD, TYPE', () => {
        expect(dispatchCommand(['SADD', 'myset', 'one', 'two', 'one'])).toBe(':2\r\n');
        expect(dispatchCommand(['SCARD', 'myset'])).toBe(':2\r\n');
        expect(dispatchCommand(['SISMEMBER', 'myset', 'one'])).toBe(':1\r\n');
        expect(dispatchCommand(['SISMEMBER', 'myset', 'three'])).toBe(':0\r\n');
        expect(dispatchCommand(['TYPE', 'myset'])).toBe('+set\r\n');

        expect(dispatchCommand(['SREM', 'myset', 'one', 'two'])).toBe(':2\r\n');
        expect(dispatchCommand(['TYPE', 'myset'])).toBe('+none\r\n');
    });
});
