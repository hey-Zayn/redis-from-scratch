export class WrongTypeError extends Error {
    constructor() {
        super('WRONGTYPE Operation against a key holding the wrong kind of value');
        this.name = 'WrongTypeError';
    }
}

export type RedisData =
    | { type: 'string'; value: string }
    | { type: 'list'; value: string[] }
    | { type: 'hash'; value: Map<string, string> }
    | { type: 'set'; value: Set<string> };

export interface StoredEntry {
    data: RedisData;
    expiresAt: number | null; // absolute timestamp in ms, or null = no expiry
}

export class Keyspace {
    private store = new Map<string, StoredEntry>();

    private isExpired(entry: StoredEntry): boolean {
        return entry.expiresAt !== null && Date.now() >= entry.expiresAt;
    }

    private getValidEntry(key: string): StoredEntry | null {
        const entry = this.store.get(key);
        if (!entry) return null;
        if (this.isExpired(entry)) {
            this.store.delete(key);
            return null;
        }
        return entry;
    }

    // --- Strings ---

    set(key: string, value: string, ttlMs?: number): void {
        const expiresAt = ttlMs !== undefined ? Date.now() + ttlMs : null;
        this.store.set(key, {
            data: { type: 'string', value },
            expiresAt,
        });
    }

    get(key: string): string | null {
        const entry = this.getValidEntry(key);
        if (!entry) return null;
        if (entry.data.type !== 'string') {
            throw new WrongTypeError();
        }
        return entry.data.value;
    }

    // --- Lists ---

    lpush(key: string, ...values: string[]): number {
        let entry = this.getValidEntry(key);
        if (!entry) {
            entry = { data: { type: 'list', value: [] }, expiresAt: null };
            this.store.set(key, entry);
        } else if (entry.data.type !== 'list') {
            throw new WrongTypeError();
        }

        const list = entry.data.value as string[];
        for (const val of values) {
            list.unshift(val);
        }
        return list.length;
    }

    rpush(key: string, ...values: string[]): number {
        let entry = this.getValidEntry(key);
        if (!entry) {
            entry = { data: { type: 'list', value: [] }, expiresAt: null };
            this.store.set(key, entry);
        } else if (entry.data.type !== 'list') {
            throw new WrongTypeError();
        }

        const list = entry.data.value as string[];
        list.push(...values);
        return list.length;
    }

    lpop(key: string): string | null {
        const entry = this.getValidEntry(key);
        if (!entry) return null;
        if (entry.data.type !== 'list') {
            throw new WrongTypeError();
        }

        const list = entry.data.value;
        const val = list.shift() ?? null;
        if (list.length === 0) {
            this.store.delete(key);
        }
        return val;
    }

    rpop(key: string): string | null {
        const entry = this.getValidEntry(key);
        if (!entry) return null;
        if (entry.data.type !== 'list') {
            throw new WrongTypeError();
        }

        const list = entry.data.value;
        const val = list.pop() ?? null;
        if (list.length === 0) {
            this.store.delete(key);
        }
        return val;
    }

    lrange(key: string, start: number, stop: number): string[] {
        const entry = this.getValidEntry(key);
        if (!entry) return [];
        if (entry.data.type !== 'list') {
            throw new WrongTypeError();
        }

        const list = entry.data.value;
        const len = list.length;
        if (len === 0) return [];

        let s = start < 0 ? len + start : start;
        let e = stop < 0 ? len + stop : stop;

        if (s < 0) s = 0;
        if (s >= len || s > e) return [];
        if (e >= len) e = len - 1;

        return list.slice(s, e + 1);
    }

    // --- Hashes ---

    hset(key: string, fieldValues: [string, string][]): number {
        let entry = this.getValidEntry(key);
        if (!entry) {
            entry = { data: { type: 'hash', value: new Map() }, expiresAt: null };
            this.store.set(key, entry);
        } else if (entry.data.type !== 'hash') {
            throw new WrongTypeError();
        }

        const map = entry.data.value as Map<string, string>;
        let addedCount = 0;
        for (const [field, val] of fieldValues) {
            if (!map.has(field)) {
                addedCount++;
            }
            map.set(field, val);
        }
        return addedCount;
    }

    hget(key: string, field: string): string | null {
        const entry = this.getValidEntry(key);
        if (!entry) return null;
        if (entry.data.type !== 'hash') {
            throw new WrongTypeError();
        }

        const map = entry.data.value;
        return map.get(field) ?? null;
    }

    hgetall(key: string): [string, string][] {
        const entry = this.getValidEntry(key);
        if (!entry) return [];
        if (entry.data.type !== 'hash') {
            throw new WrongTypeError();
        }

        const map = entry.data.value;
        return Array.from(map.entries());
    }

    hdel(key: string, ...fields: string[]): number {
        const entry = this.getValidEntry(key);
        if (!entry) return 0;
        if (entry.data.type !== 'hash') {
            throw new WrongTypeError();
        }

        const map = entry.data.value;
        let deleted = 0;
        for (const field of fields) {
            if (map.delete(field)) {
                deleted++;
            }
        }
        if (map.size === 0) {
            this.store.delete(key);
        }
        return deleted;
    }

    hexists(key: string, field: string): number {
        const entry = this.getValidEntry(key);
        if (!entry) return 0;
        if (entry.data.type !== 'hash') {
            throw new WrongTypeError();
        }

        return entry.data.value.has(field) ? 1 : 0;
    }

    // --- Sets ---

    sadd(key: string, ...members: string[]): number {
        let entry = this.getValidEntry(key);
        if (!entry) {
            entry = { data: { type: 'set', value: new Set() }, expiresAt: null };
            this.store.set(key, entry);
        } else if (entry.data.type !== 'set') {
            throw new WrongTypeError();
        }

        const set = entry.data.value as Set<string>;
        let added = 0;
        for (const member of members) {
            if (!set.has(member)) {
                set.add(member);
                added++;
            }
        }
        return added;
    }

    smembers(key: string): string[] {
        const entry = this.getValidEntry(key);
        if (!entry) return [];
        if (entry.data.type !== 'set') {
            throw new WrongTypeError();
        }

        return Array.from(entry.data.value);
    }

    sismember(key: string, member: string): number {
        const entry = this.getValidEntry(key);
        if (!entry) return 0;
        if (entry.data.type !== 'set') {
            throw new WrongTypeError();
        }

        return entry.data.value.has(member) ? 1 : 0;
    }

    srem(key: string, ...members: string[]): number {
        const entry = this.getValidEntry(key);
        if (!entry) return 0;
        if (entry.data.type !== 'set') {
            throw new WrongTypeError();
        }

        const set = entry.data.value;
        let removed = 0;
        for (const member of members) {
            if (set.delete(member)) {
                removed++;
            }
        }
        if (set.size === 0) {
            this.store.delete(key);
        }
        return removed;
    }

    scard(key: string): number {
        const entry = this.getValidEntry(key);
        if (!entry) return 0;
        if (entry.data.type !== 'set') {
            throw new WrongTypeError();
        }

        return entry.data.value.size;
    }

    // --- General Keyspace Operations ---

    type(key: string): string {
        const entry = this.getValidEntry(key);
        if (!entry) return 'none';
        return entry.data.type;
    }

    del(...keys: string[]): number {
        let count = 0;
        for (const key of keys) {
            const entry = this.getValidEntry(key);
            if (entry) {
                this.store.delete(key);
                count++;
            }
        }
        return count;
    }

    exists(...keys: string[]): number {
        let count = 0;
        for (const key of keys) {
            if (this.getValidEntry(key)) {
                count++;
            }
        }
        return count;
    }

    expire(key: string, ttlSeconds: number): number {
        return this.pexpireat(key, Date.now() + ttlSeconds * 1000);
    }

    pexpireat(key: string, timestampMs: number): number {
        const entry = this.getValidEntry(key);
        if (!entry) return 0;
        if (timestampMs <= Date.now()) {
            this.store.delete(key);
            return 1;
        }
        entry.expiresAt = timestampMs;
        return 1;
    }

    ttl(key: string): number {
        const entry = this.getValidEntry(key);
        if (!entry) return -2; // key does not exist or expired
        if (entry.expiresAt === null) return -1; // no expiry
        const remainingMs = entry.expiresAt - Date.now();
        return Math.ceil(remainingMs / 1000);
    }

    persist(key: string): number {
        const entry = this.getValidEntry(key);
        if (!entry || entry.expiresAt === null) return 0;
        entry.expiresAt = null;
        return 1;
    }

    sweepExpired(): void {
        const now = Date.now();
        for (const [key, entry] of this.store.entries()) {
            if (entry.expiresAt !== null && now >= entry.expiresAt) {
                this.store.delete(key);
            }
        }
    }

    size(): number {
        return this.store.size;
    }

    clear(): void {
        this.store.clear();
    }

    dumpAll(): [string, StoredEntry][] {
        const result: [string, StoredEntry][] = [];
        const now = Date.now();
        for (const [key, entry] of this.store.entries()) {
            if (entry.expiresAt !== null && now >= entry.expiresAt) {
                this.store.delete(key);
                continue;
            }
            result.push([key, entry]);
        }
        return result;
    }

    loadEntry(key: string, entry: StoredEntry): void {
        const now = Date.now();
        if (entry.expiresAt !== null && now >= entry.expiresAt) {
            return;
        }
        this.store.set(key, entry);
    }
}

export const keyspace = new Keyspace();