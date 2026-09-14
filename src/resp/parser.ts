export interface ParseResult {
    command: string[];
    consumed: number; // number of bytes consumed from the buffer
}

export function parseRESP(buffer: Buffer): ParseResult | null {
    let offset = 0;

    function readLine(): string | null {
        const idx = buffer.indexOf('\r\n', offset);
        if (idx === -1) return null;
        const line = buffer.subarray(offset, idx).toString();
        offset = idx + 2;
        return line;
    }

    const arrayLine = readLine();
    if (arrayLine === null) return null;
    if (!arrayLine.startsWith('*')) throw new Error('Expected array type for command');

    const numElements = parseInt(arrayLine.slice(1), 10);
    const elements: string[] = [];

    for (let i = 0; i < numElements; i++) {
        const lengthLine = readLine();
        if (lengthLine === null) return null;
        if (!lengthLine.startsWith('$')) throw new Error('Expected bulk string type');

        const len = parseInt(lengthLine.slice(1), 10);
        if (len === -1) {
            elements.push('');
            continue;
        }
        if (offset + len + 2 > buffer.length) return null; // not enough bytes yet

        const value = buffer.subarray(offset, offset + len).toString();
        offset += len + 2; // +2 to skip the trailing \r\n after the value
        elements.push(value);
    }

    return { command: elements, consumed: offset };
}