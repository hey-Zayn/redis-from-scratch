import net from 'net';
import { parseRESP } from './resp/parser';
import { simpleString, bulkString, errorReply, integer } from './resp/serializer';
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

            try {
                const cmd = command[0]?.toUpperCase();

                if (cmd === 'PING') {
                    socket.write(simpleString('PONG'));

                } else if (cmd === 'ECHO') {
                    socket.write(bulkString(command[1] ?? ''));

                } else if (cmd === 'SET') {
                    const key = command[1];
                    const value = command[2];
                    if (key === undefined || value === undefined) {
                        socket.write(errorReply("wrong number of arguments for 'set' command"));
                    } else {
                        keyspace.set(key, value);
                        socket.write(simpleString('OK'));
                    }

                } else if (cmd === 'GET') {
                    const key = command[1];
                    if (key === undefined) {
                        socket.write(errorReply("wrong number of arguments for 'get' command"));
                    } else {
                        socket.write(bulkString(keyspace.get(key)));
                    }

                } else if (cmd === 'DEL') {
                    const key = command[1];
                    if (key === undefined) {
                        socket.write(errorReply("wrong number of arguments for 'del' command"));
                    } else {
                        socket.write(integer(keyspace.del(key)));
                    }

                } else if (cmd === 'EXISTS') {
                    const key = command[1];
                    if (key === undefined) {
                        socket.write(errorReply("wrong number of arguments for 'exists' command"));
                    } else {
                        socket.write(integer(keyspace.exists(key)));
                    }

                } else if (cmd === 'EXPIRE') {
                    const key = command[1];
                    const seconds = Number(command[2]);
                    if (key === undefined || command[2] === undefined || isNaN(seconds)) {
                        socket.write(errorReply("wrong number of arguments for 'expire' command"));
                    } else {
                        socket.write(integer(keyspace.expire(key, seconds)));
                    }

                } else if (cmd === 'TTL') {
                    const key = command[1];
                    if (key === undefined) {
                        socket.write(errorReply("wrong number of arguments for 'ttl' command"));
                    } else {
                        socket.write(integer(keyspace.ttl(key)));
                    }

                } else if (cmd === 'PERSIST') {
                    const key = command[1];
                    if (key === undefined) {
                        socket.write(errorReply("wrong number of arguments for 'persist' command"));
                    } else {
                        socket.write(integer(keyspace.persist(key)));
                    }

                } else {
                    socket.write(errorReply(`unknown command '${cmd}'`));
                }
            } catch (e) {
                console.error('Command handling error:', e);
                socket.write(errorReply('internal error'));
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