import fs from 'fs';
import path from 'path';
import { parseRESP } from '../resp/parser';
import { Keyspace, StoredEntry, keyspace as defaultKeyspace } from './keyspace';

export const MUTATING_COMMANDS = new Set([
    'SET',
    'DEL',
    'EXPIRE',
    'PEXPIREAT',
    'PERSIST',
    'LPUSH',
    'RPUSH',
    'LPOP',
    'RPOP',
    'HSET',
    'HDEL',
    'SADD',
    'SREM',
]);

/**
 * Serializes a command array to RESP format (*N\r\n$L\r\n...\r\n).
 */
export function serializeCommandToRESP(command: string[]): string {
    let out = `*${command.length}\r\n`;
    for (const part of command) {
        out += `$${Buffer.byteLength(part)}\r\n${part}\r\n`;
    }
    return out;
}

/**
 * Transforms relative expiry commands to absolute timestamp commands (PEXPIREAT)
 * so that replay after server restart does not reset TTL countdowns.
 */
export function canonicalizeForAOF(command: string[]): string[] {
    const cmd = command[0]?.toUpperCase();
    if (cmd === 'EXPIRE' && command.length >= 3) {
        const key = command[1];
        const seconds = Number(command[2]);
        if (!isNaN(seconds)) {
            const absoluteMs = Date.now() + seconds * 1000;
            return ['PEXPIREAT', key, absoluteMs.toString()];
        }
    }
    return command;
}

export interface SnapshotEntry {
    type: 'string' | 'list' | 'hash' | 'set';
    value: string | string[] | [string, string][] | string[];
    expiresAt: number | null;
}

export class AOFManager {
    public filePath: string;
    public isEnabled: boolean = true;
    private isReplaying: boolean = false;

    constructor(filePath: string = path.join(process.cwd(), 'data', 'appendonly.aof')) {
        this.filePath = filePath;
        this.ensureDirExists(this.filePath);
    }

    private ensureDirExists(targetPath: string): void {
        const dir = path.dirname(targetPath);
        if (!fs.existsSync(dir)) {
            fs.mkdirSync(dir, { recursive: true });
        }
    }

    public getReplaying(): boolean {
        return this.isReplaying;
    }

    public setReplaying(val: boolean): void {
        this.isReplaying = val;
    }

    /**
     * Appends a mutating command to the AOF log file if AOF is enabled and not replaying.
     */
    public appendCommand(command: string[]): void {
        if (!this.isEnabled || this.isReplaying) return;
        if (command.length === 0) return;

        const cmdName = command[0].toUpperCase();
        if (!MUTATING_COMMANDS.has(cmdName)) return;

        const canonical = canonicalizeForAOF(command);
        const respPayload = serializeCommandToRESP(canonical);

        try {
            this.ensureDirExists(this.filePath);
            fs.appendFileSync(this.filePath, respPayload, 'utf-8');
        } catch (err) {
            console.error('Failed to append to AOF:', err);
        }
    }

    /**
     * Replays all commands stored in the AOF file using the provided dispatch function.
     * Returns the count of replayed commands.
     */
    public replay(dispatchFn: (command: string[]) => string): number {
        if (!fs.existsSync(this.filePath)) {
            return 0;
        }

        const data = fs.readFileSync(this.filePath);
        if (data.length === 0) {
            return 0;
        }

        let buffer = data;
        let replayedCount = 0;
        this.isReplaying = true;

        try {
            while (buffer.length > 0) {
                const result = parseRESP(buffer);
                if (result === null) {
                    break;
                }
                const { command, consumed } = result;
                buffer = buffer.subarray(consumed);

                if (command.length > 0) {
                    dispatchFn(command);
                    replayedCount++;
                }
            }
        } finally {
            this.isReplaying = false;
        }

        return replayedCount;
    }

    /**
     * Rewrites (compacts) the AOF file by serializing the current live state of the Keyspace
     * into minimal canonical commands, writing to a temp file and atomically renaming it.
     */
    public rewrite(ks: Keyspace = defaultKeyspace): void {
        const tempPath = `${this.filePath}.tmp`;
        this.ensureDirExists(tempPath);

        const entries = ks.dumpAll();
        let payload = '';

        for (const [key, entry] of entries) {
            const { data, expiresAt } = entry;

            // Generate canonical creation command
            if (data.type === 'string') {
                payload += serializeCommandToRESP(['SET', key, data.value]);
            } else if (data.type === 'list') {
                if (data.value.length > 0) {
                    payload += serializeCommandToRESP(['RPUSH', key, ...data.value]);
                }
            } else if (data.type === 'hash') {
                const pairs: string[] = [];
                for (const [f, v] of data.value.entries()) {
                    pairs.push(f, v);
                }
                if (pairs.length > 0) {
                    payload += serializeCommandToRESP(['HSET', key, ...pairs]);
                }
            } else if (data.type === 'set') {
                const members = Array.from(data.value);
                if (members.length > 0) {
                    payload += serializeCommandToRESP(['SADD', key, ...members]);
                }
            }

            // Expiry preservation
            if (expiresAt !== null) {
                payload += serializeCommandToRESP(['PEXPIREAT', key, expiresAt.toString()]);
            }
        }

        fs.writeFileSync(tempPath, payload, 'utf-8');
        fs.renameSync(tempPath, this.filePath);
    }

    /**
     * Point-in-time snapshotting (RDB-style): serializes current state to a JSON file.
     */
    public saveSnapshot(
        snapshotPath: string = path.join(process.cwd(), 'data', 'dump.json'),
        ks: Keyspace = defaultKeyspace
    ): void {
        const tempPath = `${snapshotPath}.tmp`;
        this.ensureDirExists(tempPath);

        const entries = ks.dumpAll();
        const serialized: Record<string, SnapshotEntry> = {};

        for (const [key, entry] of entries) {
            const { data, expiresAt } = entry;
            if (data.type === 'string') {
                serialized[key] = { type: 'string', value: data.value, expiresAt };
            } else if (data.type === 'list') {
                serialized[key] = { type: 'list', value: [...data.value], expiresAt };
            } else if (data.type === 'hash') {
                serialized[key] = { type: 'hash', value: Array.from(data.value.entries()), expiresAt };
            } else if (data.type === 'set') {
                serialized[key] = { type: 'set', value: Array.from(data.value), expiresAt };
            }
        }

        fs.writeFileSync(tempPath, JSON.stringify(serialized, null, 2), 'utf-8');
        fs.renameSync(tempPath, snapshotPath);
    }

    /**
     * Loads a point-in-time JSON snapshot into keyspace.
     */
    public loadSnapshot(
        snapshotPath: string = path.join(process.cwd(), 'data', 'dump.json'),
        ks: Keyspace = defaultKeyspace
    ): number {
        if (!fs.existsSync(snapshotPath)) {
            return 0;
        }

        const raw = fs.readFileSync(snapshotPath, 'utf-8');
        const serialized: Record<string, SnapshotEntry> = JSON.parse(raw);
        let loaded = 0;

        for (const [key, item] of Object.entries(serialized)) {
            let entry: StoredEntry;
            if (item.type === 'string') {
                entry = { data: { type: 'string', value: item.value as string }, expiresAt: item.expiresAt };
            } else if (item.type === 'list') {
                entry = { data: { type: 'list', value: item.value as string[] }, expiresAt: item.expiresAt };
            } else if (item.type === 'hash') {
                entry = {
                    data: { type: 'hash', value: new Map(item.value as [string, string][]) },
                    expiresAt: item.expiresAt,
                };
            } else if (item.type === 'set') {
                entry = {
                    data: { type: 'set', value: new Set(item.value as string[]) },
                    expiresAt: item.expiresAt,
                };
            } else {
                continue;
            }

            ks.loadEntry(key, entry);
            loaded++;
        }

        return loaded;
    }
}

export const aofManager = new AOFManager();
