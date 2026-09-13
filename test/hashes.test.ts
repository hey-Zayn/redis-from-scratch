import { describe, it, expect, beforeEach } from 'vitest';
import { Keyspace, WrongTypeError } from '../src/store/keyspace';
import { dispatchCommand } from '../src/commands';
import { keyspace } from '../src/store/keyspace';

describe('Hashes - Unit Tests', () => {
    let ks: Keyspace;

    beforeEach(() => {
        ks = new Keyspace();
    });

    it('HSET adds new fields and updates existing fields', () => {
        // Adding 2 new fields
        expect(ks.hset('user:1', [['name', 'Alice'], ['age', '30']])).toBe(2);
        // Updating 1 existing field + adding 1 new field
        expect(ks.hset('user:1', [['age', '31'], ['city', 'Paris']])).toBe(1);
        expect(ks.hget('user:1', 'age')).toBe('31');
    });

    it('HGET returns value or null for missing field/key', () => {
        ks.hset('user:1', [['name', 'Alice']]);
        expect(ks.hget('user:1', 'name')).toBe('Alice');
        expect(ks.hget('user:1', 'missing')).toBeNull();
        expect(ks.hget('missing_key', 'field')).toBeNull();
    });

    it('HGETALL returns all field-value pairs', () => {
        ks.hset('user:1', [['name', 'Bob'], ['role', 'admin']]);
        const all = ks.hgetall('user:1');
        expect(all).toEqual([['name', 'Bob'], ['role', 'admin']]);
    });

    it('HDEL deletes fields and cleans up empty hash', () => {
        ks.hset('user:1', [['f1', 'v1'], ['f2', 'v2']]);
        expect(ks.hdel('user:1', 'f1')).toBe(1);
        expect(ks.hexists('user:1', 'f1')).toBe(0);
        expect(ks.hexists('user:1', 'f2')).toBe(1);

        // Delete last field -> key should be deleted
        expect(ks.hdel('user:1', 'f2')).toBe(1);
        expect(ks.exists('user:1')).toBe(0);
    });

    it('throws WrongTypeError on mismatched types', () => {
        ks.set('str_key', 'string_val');
        expect(() => ks.hset('str_key', [['f', 'v']])).toThrow(WrongTypeError);
        expect(() => ks.hget('str_key', 'f')).toThrow(WrongTypeError);
        expect(() => ks.hgetall('str_key')).toThrow(WrongTypeError);
    });
});

describe('Hashes - Dispatch Integration', () => {
    beforeEach(() => {
        keyspace.clear();
    });

    it('dispatches HSET, HGET, HGETALL, HDEL, HEXISTS', () => {
        expect(dispatchCommand(['HSET', 'hash1', 'k1', 'v1', 'k2', 'v2'])).toBe(':2\r\n');
        expect(dispatchCommand(['HGET', 'hash1', 'k1'])).toBe('$2\r\nv1\r\n');
        expect(dispatchCommand(['HEXISTS', 'hash1', 'k1'])).toBe(':1\r\n');
        expect(dispatchCommand(['HEXISTS', 'hash1', 'missing'])).toBe(':0\r\n');
        expect(dispatchCommand(['HGETALL', 'hash1'])).toBe('*4\r\n$2\r\nk1\r\n$2\r\nv1\r\n$2\r\nk2\r\n$2\r\nv2\r\n');
        expect(dispatchCommand(['HDEL', 'hash1', 'k1', 'k2'])).toBe(':2\r\n');
        expect(dispatchCommand(['EXISTS', 'hash1'])).toBe(':0\r\n');
    });
});
