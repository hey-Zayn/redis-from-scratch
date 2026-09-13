import net from 'net';
import { parseRESP } from './resp/parser';
import { errorReply } from './resp/serializer';
import { dispatchCommand } from './commands';
import { keyspace } from './store/keyspace';

const PORT = 6380;

const server = net.createServer((socket) => {
    console.log('Client connected');

    let buffer = Buffer.alloc(0);

    socket.on('data', (data) => {
        console.log('Raw bytes received:', data);

        // Accumulate incoming bytes — a command may arrive split across
        // multiple 'data' events, or multiple commands may arrive bundled together.
        buffer = Buffer.concat([buffer, data]);

        // Try to extract and process as many complete commands as are
        // currently available in the buffer.
        while (true) {
            let command: string[];
            let consumed: number;

            try {
                const result = parseRESP(buffer);
                if (result === null) {
                    // Not enough data yet for a full command — wait for more.
                    break;
                }
                command = result.command;
                consumed = result.consumed;
            } catch (e) {
                console.error('Parse error:', e);
                socket.write(errorReply('Protocol error'));
                buffer = Buffer.alloc(0); // discard corrupted buffer
                break;
            }

            // Remove the bytes we just consumed, leaving any remaining
            // buffered data (e.g. the start of the next command) in place.
            buffer = buffer.subarray(consumed);

            const reply = dispatchCommand(command);
            if (socket.writable) {
                socket.write(reply);
            }
        }
    });

    socket.on('end', () => console.log('Client disconnected'));
    socket.on('error', (err: NodeJS.ErrnoException) => {
        if (err.code === 'ECONNRESET' || err.code === 'EPIPE') {
            // Client closed connection abruptly (e.g. redis-cli exited immediately)
            console.log('Client connection reset');
            return;
        }
        console.error('Socket error:', err);
    });
});

// Active expiry: sweep for expired keys once every 100ms, at the server
// level — NOT inside the per-connection callback above. This runs exactly
// once for the whole server's lifetime, regardless of how many clients connect.
setInterval(() => keyspace.sweepExpired(), 100);

server.listen(PORT, () => console.log(`Listening on port ${PORT}`));