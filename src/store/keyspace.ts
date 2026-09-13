interface StoredValue {
    value: string;
    expiresAt: number | null; // absolute timestamp in ms, or null = no expiry
}

export class Keyspace {
    private store = new Map<string, StoredValue>();

    set(key: string, value: string, ttlMs?: number): void {
        const expiresAt = ttlMs !== undefined ? Date.now() + ttlMs : null;
        this.store.set(key, { value, expiresAt });
    }

    get(key: string): string | null {
        const entry = this.store.get(key);
        if (!entry) return null;

        if (this.isExpired(entry)) {
            this.store.delete(key); // lazy expiry: clean up on access
            return null;
        }

        return entry.value;
    }

    del(key: string): number {
        return this.store.delete(key) ? 1 : 0;
    }

    exists(key: string): number {
        const entry = this.store.get(key);
        if (!entry) return 0;
        if (this.isExpired(entry)) {
            this.store.delete(key);
            return 0;
        }
        return 1;
    }

    expire(key: string, ttlSeconds: number): number {
        const entry = this.store.get(key);
        if (!entry || this.isExpired(entry)) return 0;
        entry.expiresAt = Date.now() + ttlSeconds * 1000;
        return 1;
    }

    ttl(key: string): number {
        const entry = this.store.get(key);
        if (!entry || this.isExpired(entry)) return -2; // key doesn't exist
        if (entry.expiresAt === null) return -1; // no expiry set
        const remainingMs = entry.expiresAt - Date.now();
        return Math.ceil(remainingMs / 1000);
    }

    persist(key: string): number {
        const entry = this.store.get(key);
        if (!entry || this.isExpired(entry) || entry.expiresAt === null) return 0;
        entry.expiresAt = null;
        return 1;
    }

    private isExpired(entry: StoredValue): boolean {
        return entry.expiresAt !== null && Date.now() >= entry.expiresAt;
    }

    // Active expiry: called periodically to sweep expired keys
    // even if nobody reads them.
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
}

export const keyspace = new Keyspace();