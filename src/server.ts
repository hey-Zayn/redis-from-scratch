import net from 'net';
import fs from 'fs';
import { parseRESP } from './resp/parser';
import { errorReply } from './resp/serializer';
import { dispatchCommand } from './commands';
import { ClientContext } from './commands/types';
import { pubsubManager } from './pubsub';
import { keyspace } from './store/keyspace';
import { aofManager } from './store/persistence';

const PORT = 6380;
let nextClientId = 1;

const server = net.createServer((socket) => {
    const client: ClientContext = {
        id: nextClientId++,
        socket,
        subscriptions: new Set(),
        inMulti: false,
        multiQueue: [],
    };
    console.log(`Client ${client.id} connected`);

    let buffer = Buffer.alloc(0);

    socket.on('data', (data: Buffer) => {
        if (process.env.DEBUG) {
            console.log('Raw bytes received:', data);
        }

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

            const reply = dispatchCommand(command, client);
            if (socket.writable) {
                socket.write(reply);
            }

            if (command[0]?.toUpperCase() === 'QUIT') {
                socket.end();
                break;
            }
        }
    });

    const cleanup = () => {
        pubsubManager.removeClient(client);
    };

    socket.on('close', cleanup);
    socket.on('end', () => {
        cleanup();
        console.log(`Client ${client.id} disconnected`);
    });
    socket.on('error', (err: NodeJS.ErrnoException) => {
        cleanup();
        if (err.code === 'ECONNRESET' || err.code === 'EPIPE') {
            // Client closed connection abruptly (e.g. redis-cli exited immediately)
            console.log(`Client ${client.id} connection reset`);
            return;
        }
        console.error(`Socket error on client ${client.id}:`, err);
    });
});

// Active expiry: sweep for expired keys once every 100ms, at the server
// level — NOT inside the per-connection callback above. This runs exactly
// once for the whole server's lifetime, regardless of how many clients connect.
setInterval(() => keyspace.sweepExpired(), 100);

// Restore state on server startup: prefer AOF (has every write); fall back to snapshot if no AOF exists.
try {
    if (fs.existsSync(aofManager.filePath)) {
        const replayed = aofManager.replay(dispatchCommand);
        if (replayed > 0) {
            console.log(`[AOF] Successfully replayed ${replayed} command(s). Keyspace restored.`);
        }
    } else {
        const loaded = aofManager.loadSnapshot();
        if (loaded > 0) {
            console.log(`[RDB] Restored ${loaded} key(s) from snapshot.`);
        }
    }
} catch (err) {
    console.error('[Persistence] Error during startup restore:', err);
}

server.listen(PORT, () => console.log(`Listening on port ${PORT}`));

process.on('SIGINT', () => {
    console.log('\nShutting down server...');
    server.close(() => {
        console.log('Server shut down cleanly.');
        process.exit(0);
    });
});