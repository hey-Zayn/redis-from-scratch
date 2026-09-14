import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'fs';
import path from 'path';
import { Keyspace } from '../src/store/keyspace';
import { AOFManager, serializeCommandToRESP, canonicalizeForAOF } from '../src/store/persistence';
import { dispatchCommand } from '../src/commands';
import { keyspace } from '../src/store/keyspace';
import { aofManager } from '../src/store/persistence';

const TEST_DIR = path.join(process.cwd(), 'data', 'test_persistence');
const TEST_AOF = path.join(TEST_DIR, 'test_appendonly.aof');
const TEST_DUMP = path.join(TEST_DIR, 'test_dump.json');

describe('Persistence - RESP Serialization & Canonicalization', () => {
    it('serializes command arrays into valid RESP format', () => {
        const resp = serializeCommandToRESP(['SET', 'mykey', 'myval']);
        expect(resp).toBe('*3\r\n$3\r\nSET\r\n$5\r\nmykey\r\n$5\r\nmyval\r\n');
    });

    it('transforms EXPIRE into absolute PEXPIREAT to prevent TTL drift', () => {
        vi.useFakeTimers();
        const baseTime = 1700000000000;
        vi.setSystemTime(baseTime);

        const canonical = canonicalizeForAOF(['EXPIRE', 'token', '60']);
        expect(canonical[0]).toBe('PEXPIREAT');
        expect(canonical[1]).toBe('token');
        expect(canonical[2]).toBe((baseTime + 60000).toString());

        vi.useRealTimers();
    });

    it('leaves non-expiry mutating commands untouched', () => {
        const cmd = ['LPUSH', 'list1', 'val1', 'val2'];
        expect(canonicalizeForAOF(cmd)).toEqual(cmd);
    });
});

describe('Persistence - AOF Append and Replay', () => {
    let customAOF: AOFManager;

    beforeEach(() => {
        if (fs.existsSync(TEST_DIR)) {
            fs.rmSync(TEST_DIR, { recursive: true, force: true });
        }
        customAOF = new AOFManager(TEST_AOF);
        keyspace.clear();
        aofManager.filePath = TEST_AOF;
        aofManager.isEnabled = true;
    });

    afterEach(() => {
        aofManager.filePath = path.join(process.cwd(), 'data', 'appendonly.aof');
        if (fs.existsSync(TEST_DIR)) {
            fs.rmSync(TEST_DIR, { recursive: true, force: true });
        }
    });

    it('records mutating commands to AOF and replays them to reconstruct state', () => {
        // Execute mutating commands through dispatch
        dispatchCommand(['SET', 'str1', 'hello']);
        dispatchCommand(['RPUSH', 'list1', 'itemA', 'itemB']);
        dispatchCommand(['HSET', 'user:1', 'name', 'Zayn', 'role', 'admin']);
        dispatchCommand(['SADD', 'tags', 'redis', 'typescript']);

        // Non-mutating commands should NOT be appended
        dispatchCommand(['GET', 'str1']);
        dispatchCommand(['PING']);

        // Verify AOF file exists and has content
        expect(fs.existsSync(TEST_AOF)).toBe(true);
        const aofContent = fs.readFileSync(TEST_AOF, 'utf-8');
        expect(aofContent).toContain('SET');
        expect(aofContent).toContain('RPUSH');
        expect(aofContent).toContain('HSET');
        expect(aofContent).toContain('SADD');
        expect(aofContent).not.toContain('PING');

        // Simulate server crash/restart by wiping keyspace
        keyspace.clear();
        expect(keyspace.get('str1')).toBeNull();
        expect(keyspace.lrange('list1', 0, -1)).toEqual([]);

        // Replay AOF
        const replayed = customAOF.replay(dispatchCommand);
        expect(replayed).toBe(4);

        // Verify all data is fully restored
        expect(keyspace.get('str1')).toBe('hello');
        expect(keyspace.lrange('list1', 0, -1)).toEqual(['itemA', 'itemB']);
        expect(keyspace.hget('user:1', 'name')).toBe('Zayn');
        expect(keyspace.hget('user:1', 'role')).toBe('admin');
        expect(keyspace.smembers('tags').sort()).toEqual(['redis', 'typescript']);
    });

    it('restores TTL expiration accurately across replay', () => {
        vi.useFakeTimers();
        const baseTime = 1700000000000;
        vi.setSystemTime(baseTime);

        dispatchCommand(['SET', 'tempKey', 'tempVal']);
        dispatchCommand(['EXPIRE', 'tempKey', '10']); // expires at baseTime + 10000ms

        // Simulate 4 seconds elapsed
        vi.advanceTimersByTime(4000);

        // Wipe keyspace (server restart)
        keyspace.clear();
        expect(keyspace.get('tempKey')).toBeNull();

        // Replay
        customAOF.replay(dispatchCommand);

        // Key should still have 6 seconds of TTL remaining
        expect(keyspace.get('tempKey')).toBe('tempVal');
        expect(keyspace.ttl('tempKey')).toBe(6);

        // Advance past expiration time
        vi.advanceTimersByTime(6100);
        expect(keyspace.get('tempKey')).toBeNull();
        expect(keyspace.ttl('tempKey')).toBe(-2);

        vi.useRealTimers();
    });
});

describe('Persistence - AOF Compaction (Rewrite)', () => {
    let customAOF: AOFManager;

    beforeEach(() => {
        if (fs.existsSync(TEST_DIR)) {
            fs.rmSync(TEST_DIR, { recursive: true, force: true });
        }
        customAOF = new AOFManager(TEST_AOF);
        keyspace.clear();
        aofManager.filePath = TEST_AOF;
        aofManager.isEnabled = true;
    });

    afterEach(() => {
        aofManager.filePath = path.join(process.cwd(), 'data', 'appendonly.aof');
        if (fs.existsSync(TEST_DIR)) {
            fs.rmSync(TEST_DIR, { recursive: true, force: true });
        }
    });

    it('rewrites redundant operations into minimal state commands', () => {
        // Redundant operations on same key
        dispatchCommand(['SET', 'counter', '1']);
        dispatchCommand(['SET', 'counter', '2']);
        dispatchCommand(['SET', 'counter', '3']);
        dispatchCommand(['RPUSH', 'tasks', 't1', 't2', 't3']);
        dispatchCommand(['LPOP', 'tasks']);

        const originalSize = fs.statSync(TEST_AOF).size;

        // Trigger rewrite via BGREWRITEAOF or direct method
        dispatchCommand(['BGREWRITEAOF']);

        const compactedSize = fs.statSync(TEST_AOF).size;
        expect(compactedSize).toBeLessThan(originalSize);

        // Wipe memory and replay compacted file
        keyspace.clear();
        customAOF.replay(dispatchCommand);

        expect(keyspace.get('counter')).toBe('3');
        expect(keyspace.lrange('tasks', 0, -1)).toEqual(['t2', 't3']);
    });
});

describe('Persistence - Snapshotting (RDB-style SAVE)', () => {
    let ks: Keyspace;
    let customAOF: AOFManager;

    beforeEach(() => {
        if (fs.existsSync(TEST_DIR)) {
            fs.rmSync(TEST_DIR, { recursive: true, force: true });
        }
        ks = new Keyspace();
        customAOF = new AOFManager(TEST_AOF);
    });

    afterEach(() => {
        if (fs.existsSync(TEST_DIR)) {
            fs.rmSync(TEST_DIR, { recursive: true, force: true });
        }
    });

    it('saves snapshot to JSON and restores state', () => {
        ks.set('s1', 'val1');
        ks.rpush('l1', 'a', 'b', 'c');
        ks.hset('h1', [['f1', 'v1'], ['f2', 'v2']]);
        ks.sadd('set1', 'm1', 'm2');

        customAOF.saveSnapshot(TEST_DUMP, ks);
        expect(fs.existsSync(TEST_DUMP)).toBe(true);

        const newKs = new Keyspace();
        const loaded = customAOF.loadSnapshot(TEST_DUMP, newKs);
        expect(loaded).toBe(4);

        expect(newKs.get('s1')).toBe('val1');
        expect(newKs.lrange('l1', 0, -1)).toEqual(['a', 'b', 'c']);
        expect(newKs.hgetall('h1')).toEqual([['f1', 'v1'], ['f2', 'v2']]);
        expect(newKs.smembers('set1').sort()).toEqual(['m1', 'm2']);
    });
});
