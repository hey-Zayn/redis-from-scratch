import net from 'net';
import { performance } from 'perf_hooks';
import { serializeCommandToRESP } from './store/persistence';

interface BenchmarkConfig {
    host: string;
    port: number;
    requests: number;
    concurrency: number;
}

interface BenchmarkResult {
    name: string;
    opsPerSec: number;
    avgLatencyMs: number;
    minMs: number;
    p50Ms: number;
    p95Ms: number;
    p99Ms: number;
    maxMs: number;
    totalTimeSec: number;
}

function parseArgs(): BenchmarkConfig {
    const args = process.argv.slice(2);
    let host = '127.0.0.1';
    let port = 6380;
    let requests = 5000;
    let concurrency = 20;

    for (let i = 0; i < args.length; i++) {
        if (args[i] === '-h' || args[i] === '--host') host = args[++i] || '127.0.0.1';
        else if (args[i] === '-p' || args[i] === '--port') port = Number(args[++i]);
        else if (args[i] === '-n' || args[i] === '--requests') requests = Number(args[++i]);
        else if (args[i] === '-c' || args[i] === '--concurrency') concurrency = Number(args[++i]);
    }

    return { host, port, requests, concurrency };
}

/**
 * Returns number of bytes consumed by 1 complete RESP response, or null if incomplete.
 */
function parseResponseBytes(buffer: Buffer, offset: number = 0): number | null {
    if (offset >= buffer.length) return null;
    const type = buffer[offset];
    const crlf = buffer.indexOf('\r\n', offset);
    if (crlf === -1) return null;

    // Simple strings (+), Errors (-), Integers (:)
    if (type === 43 || type === 45 || type === 58) {
        return crlf + 2 - offset;
    }

    // Bulk strings ($)
    if (type === 36) {
        const lenStr = buffer.subarray(offset + 1, crlf).toString('ascii');
        const len = parseInt(lenStr, 10);
        if (len === -1) {
            return crlf + 2 - offset;
        }
        const dataEnd = crlf + 2 + len + 2;
        if (buffer.length < dataEnd) return null;
        return dataEnd - offset;
    }

    // Arrays (*)
    if (type === 42) {
        const countStr = buffer.subarray(offset + 1, crlf).toString('ascii');
        const count = parseInt(countStr, 10);
        if (count === -1) {
            return crlf + 2 - offset;
        }
        let cur = crlf + 2;
        for (let i = 0; i < count; i++) {
            const consumed = parseResponseBytes(buffer, cur);
            if (consumed === null) return null;
            cur += consumed;
        }
        return cur - offset;
    }

    // Default fallback
    return crlf + 2 - offset;
}

class ClientWorker {
    private socket: net.Socket;
    private buffer: Buffer = Buffer.alloc(0);
    private pendingCallbacks: Array<() => void> = [];

    constructor(private host: string, private port: number) {
        this.socket = new net.Socket();
        this.socket.setNoDelay(true);
    }

    public async connect(): Promise<void> {
        return new Promise((resolve, reject) => {
            this.socket.connect(this.port, this.host, () => {
                resolve();
            });
            this.socket.on('error', reject);

            this.socket.on('data', (chunk: Buffer) => {
                this.buffer = Buffer.concat([this.buffer, chunk]);
                while (this.buffer.length > 0) {
                    const consumed = parseResponseBytes(this.buffer, 0);
                    if (consumed === null) break;
                    this.buffer = this.buffer.subarray(consumed);
                    const cb = this.pendingCallbacks.shift();
                    if (cb) cb();
                }
            });
        });
    }

    public send(command: string[]): Promise<void> {
        return new Promise((resolve) => {
            this.pendingCallbacks.push(resolve);
            const payload = serializeCommandToRESP(command);
            this.socket.write(payload);
        });
    }

    public close(): void {
        this.socket.destroy();
    }
}

async function runBenchmark(
    name: string,
    config: BenchmarkConfig,
    commandGenerator: (index: number) => string[]
): Promise<BenchmarkResult> {
    const clients: ClientWorker[] = [];
    for (let i = 0; i < config.concurrency; i++) {
        const client = new ClientWorker(config.host, config.port);
        await client.connect();
        clients.push(client);
    }

    const latencies: number[] = [];
    let completed = 0;
    const startTime = performance.now();

    const opsPerClient = Math.floor(config.requests / config.concurrency);
    const workers = clients.map((client, workerIdx) => {
        return (async () => {
            for (let j = 0; j < opsPerClient; j++) {
                const reqIdx = workerIdx * opsPerClient + j;
                const cmd = commandGenerator(reqIdx);
                const reqStart = performance.now();
                await client.send(cmd);
                const reqEnd = performance.now();
                latencies.push(reqEnd - reqStart);
                completed++;
            }
        })();
    });

    await Promise.all(workers);
    const totalTimeSec = (performance.now() - startTime) / 1000;

    for (const client of clients) {
        client.close();
    }

    latencies.sort((a, b) => a - b);
    const total = latencies.length;
    const avgLatencyMs = latencies.reduce((sum, val) => sum + val, 0) / total;
    const minMs = latencies[0] || 0;
    const maxMs = latencies[total - 1] || 0;
    const p50Ms = latencies[Math.floor(total * 0.5)] || 0;
    const p95Ms = latencies[Math.floor(total * 0.95)] || 0;
    const p99Ms = latencies[Math.floor(total * 0.99)] || 0;
    const opsPerSec = Math.round(completed / totalTimeSec);

    return {
        name,
        opsPerSec,
        avgLatencyMs,
        minMs,
        p50Ms,
        p95Ms,
        p99Ms,
        maxMs,
        totalTimeSec,
    };
}

async function main() {
    const config = parseArgs();

    console.log(`\n=============================================================`);
    console.log(`  redis-from-scratch Benchmark Suite`);
    console.log(`  Target: ${config.host}:${config.port}`);
    console.log(`  Requests: ${config.requests} per command | Concurrency: ${config.concurrency} clients`);
    console.log(`=============================================================\n`);

    // Verify server is reachable
    const probe = new net.Socket();
    try {
        await new Promise<void>((resolve, reject) => {
            probe.connect(config.port, config.host, () => {
                probe.destroy();
                resolve();
            });
            probe.on('error', (err) => reject(err));
        });
    } catch {
        console.error(`[Error] Unable to connect to server at ${config.host}:${config.port}.`);
        console.error(`Please ensure the server is running ('pnpm run dev' or 'pnpm start').\n`);
        process.exit(1);
    }

    const suites = [
        {
            name: 'PING',
            gen: () => ['PING'],
        },
        {
            name: 'SET',
            gen: (i: number) => ['SET', `bench:key:${i % 1000}`, `val_${i}`],
        },
        {
            name: 'GET',
            gen: (i: number) => ['GET', `bench:key:${i % 1000}`],
        },
        {
            name: 'LPUSH',
            gen: (i: number) => ['LPUSH', `bench:list:${i % 50}`, `item_${i}`],
        },
        {
            name: 'LPOP',
            gen: (i: number) => ['LPOP', `bench:list:${i % 50}`],
        },
    ];

    const results: BenchmarkResult[] = [];

    for (const suite of suites) {
        process.stdout.write(`Benchmarking ${suite.name}... `);
        const res = await runBenchmark(suite.name, config, suite.gen);
        results.push(res);
        console.log(`Done (${res.opsPerSec.toLocaleString()} ops/sec)`);
    }

    console.log(`\nResults Summary:`);
    console.log(`-----------------------------------------------------------------------------------------`);
    console.log(
        `| Command | Ops / sec   | Avg (ms) | Min (ms) | p50 (ms) | p95 (ms) | p99 (ms) | Max (ms) |`
    );
    console.log(`|---------|-------------|----------|----------|----------|----------|----------|----------|`);
    for (const r of results) {
        const cmd = r.name.padEnd(7);
        const ops = `${r.opsPerSec.toLocaleString()} req/s`.padEnd(11);
        const avg = r.avgLatencyMs.toFixed(2).padEnd(8);
        const min = r.minMs.toFixed(2).padEnd(8);
        const p50 = r.p50Ms.toFixed(2).padEnd(8);
        const p95 = r.p95Ms.toFixed(2).padEnd(8);
        const p99 = r.p99Ms.toFixed(2).padEnd(8);
        const max = r.maxMs.toFixed(2).padEnd(8);
        console.log(`| ${cmd} | ${ops} | ${avg} | ${min} | ${p50} | ${p95} | ${p99} | ${max} |`);
    }
    console.log(`-----------------------------------------------------------------------------------------\n`);
}

main().catch((err) => {
    console.error('Benchmark failed:', err);
    process.exit(1);
});
