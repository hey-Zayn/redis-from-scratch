import { describe, it, expect } from 'vitest';
import { parseRESP } from '../src/resp/parser';
import { simpleString, bulkString, errorReply, integer } from '../src/resp/serializer';

describe('RESP Serializer', () => {
    it('serializes simple strings', () => {
        expect(simpleString('PONG')).toBe('+PONG\r\n');
        expect(simpleString('OK')).toBe('+OK\r\n');
    });

    it('serializes bulk strings', () => {
        expect(bulkString('hello')).toBe('$5\r\nhello\r\n');
        expect(bulkString('')).toBe('$0\r\n\r\n');
        expect(bulkString(null)).toBe('$-1\r\n');
    });

    it('serializes error replies', () => {
        expect(errorReply('unknown command')).toBe('-ERR unknown command\r\n');
    });

    it('serializes integers', () => {
        expect(integer(1)).toBe(':1\r\n');
        expect(integer(0)).toBe(':0\r\n');
        expect(integer(-2)).toBe(':-2\r\n');
    });
});

describe('RESP Parser', () => {
    it('parses a single-element array (PING)', () => {
        const buf = Buffer.from('*1\r\n$4\r\nping\r\n');
        const res = parseRESP(buf);
        expect(res).not.toBeNull();
        expect(res?.command).toEqual(['ping']);
        expect(res?.consumed).toBe(buf.length);
    });

    it('parses a multi-element array (ECHO hello)', () => {
        const buf = Buffer.from('*2\r\n$4\r\necho\r\n$5\r\nhello\r\n');
        const res = parseRESP(buf);
        expect(res).not.toBeNull();
        expect(res?.command).toEqual(['echo', 'hello']);
        expect(res?.consumed).toBe(buf.length);
    });

    it('returns null for incomplete buffer', () => {
        expect(parseRESP(Buffer.from('*1\r\n'))).toBeNull();
    });

    it('correctly parses bulk strings with embedded CRLF', () => {
        const valWithCrlf = 'hello\r\nworld';
        const byteLen = Buffer.byteLength(valWithCrlf);
        const buf = Buffer.from(`*2\r\n$3\r\nSET\r\n$${byteLen}\r\n${valWithCrlf}\r\n`);
        const res = parseRESP(buf);
        expect(res).not.toBeNull();
        expect(res?.command).toEqual(['SET', valWithCrlf]);
        expect(res?.consumed).toBe(buf.length);
    });

    it('correctly parses multi-byte UTF-8 characters and computes byte consumption', () => {
        const utf8Val = '🔥🚀Redis';
        const byteLen = Buffer.byteLength(utf8Val);
        const buf = Buffer.from(`*2\r\n$4\r\nECHO\r\n$${byteLen}\r\n${utf8Val}\r\n`);
        const res = parseRESP(buf);
        expect(res).not.toBeNull();
        expect(res?.command).toEqual(['ECHO', utf8Val]);
        expect(res?.consumed).toBe(buf.length);
    });
});
