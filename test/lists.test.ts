import { describe, it, expect, beforeEach } from 'vitest';
import { Keyspace, WrongTypeError } from '../src/store/keyspace';
import { dispatchCommand } from '../src/commands';
import { keyspace } from '../src/store/keyspace';

describe('Lists - Unit Tests', () => {
    let ks: Keyspace;

    beforeEach(() => {
        ks = new Keyspace();
    });

    it('LPUSH prepends elements to the list head', () => {
        expect(ks.lpush('mylist', 'world')).toBe(1);
        expect(ks.lpush('mylist', 'hello')).toBe(2);
        expect(ks.lrange('mylist', 0, -1)).toEqual(['hello', 'world']);
    });

    it('RPUSH appends elements to the list tail', () => {
        expect(ks.rpush('mylist', 'hello')).toBe(1);
        expect(ks.rpush('mylist', 'world', 'again')).toBe(3);
        expect(ks.lrange('mylist', 0, -1)).toEqual(['hello', 'world', 'again']);
    });

    it('LPOP removes and returns the first element', () => {
        ks.rpush('mylist', 'one', 'two', 'three');
        expect(ks.lpop('mylist')).toBe('one');
        expect(ks.lrange('mylist', 0, -1)).toEqual(['two', 'three']);
    });

    it('RPOP removes and returns the last element', () => {
        ks.rpush('mylist', 'one', 'two', 'three');
        expect(ks.rpop('mylist')).toBe('three');
        expect(ks.lrange('mylist', 0, -1)).toEqual(['one', 'two']);
    });

    it('deletes key when list becomes empty after pop', () => {
        ks.rpush('mylist', 'only');
        expect(ks.lpop('mylist')).toBe('only');
        expect(ks.exists('mylist')).toBe(0);
        expect(ks.lpop('mylist')).toBeNull();
    });

    it('LRANGE handles negative indices and out of bound indices', () => {
        ks.rpush('nums', '0', '1', '2', '3', '4');
        expect(ks.lrange('nums', 0, 1)).toEqual(['0', '1']);
        expect(ks.lrange('nums', -3, -1)).toEqual(['2', '3', '4']);
        expect(ks.lrange('nums', 0, 100)).toEqual(['0', '1', '2', '3', '4']);
        expect(ks.lrange('nums', 5, 10)).toEqual([]);
        expect(ks.lrange('nums', 3, 1)).toEqual([]);
    });

    it('throws WrongTypeError on mismatched types', () => {
        ks.set('str_key', 'just_a_string');
        expect(() => ks.lpush('str_key', 'item')).toThrow(WrongTypeError);
        expect(() => ks.rpop('str_key')).toThrow(WrongTypeError);
        expect(() => ks.lrange('str_key', 0, -1)).toThrow(WrongTypeError);
    });
});

describe('Lists - Dispatch Integration', () => {
    beforeEach(() => {
        keyspace.clear();
    });

    it('dispatches LPUSH, RPUSH, LRANGE, LPOP, RPOP and handles WRONGTYPE', () => {
        expect(dispatchCommand(['RPUSH', 'mylist', 'a', 'b'])).toBe(':2\r\n');
        expect(dispatchCommand(['LPUSH', 'mylist', 'start'])).toBe(':3\r\n');
        expect(dispatchCommand(['LRANGE', 'mylist', '0', '-1'])).toBe('*3\r\n$5\r\nstart\r\n$1\r\na\r\n$1\r\nb\r\n');
        expect(dispatchCommand(['LPOP', 'mylist'])).toBe('$5\r\nstart\r\n');
        expect(dispatchCommand(['RPOP', 'mylist'])).toBe('$1\r\nb\r\n');

        // Test WRONGTYPE error reply
        dispatchCommand(['SET', 'mystring', 'hello']);
        expect(dispatchCommand(['LPUSH', 'mystring', 'fail'])).toBe(
            '-WRONGTYPE Operation against a key holding the wrong kind of value\r\n'
        );
    });
});
