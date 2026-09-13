export function simpleString(s: string): string {
    return `+${s}\r\n`;
}

export function bulkString(s: string | null): string {
    if (s === null) return `$-1\r\n`; // RESP null
    return `$${s.length}\r\n${s}\r\n`;
}

export function errorReply(msg: string): string {
    return `-ERR ${msg}\r\n`;
}

export function integer(n: number): string {
    return `:${n}\r\n`;
}

export function array(items: (string | null)[] | null): string {
    if (items === null) return `*-1\r\n`;
    let out = `*${items.length}\r\n`;
    for (const item of items) {
        out += bulkString(item);
    }
    return out;
}

export function wrongTypeReply(): string {
    return `-WRONGTYPE Operation against a key holding the wrong kind of value\r\n`;
}