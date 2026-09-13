interface ParseResult {
    command: string[];
    consumed: number; // number of bytes consumed from the buffer
}

export function parseRESP(buffer: Buffer): ParseResult | null {
    const str = buffer.toString();
    const lines = str.split('\r\n');

    // Not even one full line yet.
    if (lines.length < 2) return null;

    const arrayLine = lines[0];
    if (!arrayLine.startsWith('*')) {
        throw new Error('Expected array type for command');
    }

    const numElements = parseInt(arrayLine.slice(1), 10);
    const elements: string[] = [];

    let lineIndex = 1;
    for (let i = 0; i < numElements; i++) {
        const lengthLine = lines[lineIndex];

        // Not enough lines buffered yet for this element — wait for more data.
        if (lengthLine === undefined || lines[lineIndex + 1] === undefined) {
            return null;
        }

        if (!lengthLine.startsWith('$')) {
            throw new Error('Expected bulk string type');
        }

        const value = lines[lineIndex + 1];
        elements.push(value);
        lineIndex += 2;
    }

    // Reconstruct how many bytes were actually consumed by re-joining
    // the consumed lines with their \r\n terminators.
    const consumedLines = lines.slice(0, lineIndex);
    const consumed = consumedLines.join('\r\n').length + 2; // +2 for the final \r\n

    return { command: elements, consumed };
}