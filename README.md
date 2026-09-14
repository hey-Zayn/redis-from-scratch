# [redis-from-scratch](https://github.com/hey-Zayn/redis-from-scratch)

[![TypeScript](https://img.shields.io/badge/TypeScript-7.x-blue.svg)](https://www.typescriptlang.org/)
[![Node.js](https://img.shields.io/badge/Node.js-22.x-green.svg)](https://nodejs.org/)
[![Protocol](https://img.shields.io/badge/Protocol-RESP_v2-red.svg)](https://redis.io/docs/reference/protocol-spec/)
[![Tests](https://img.shields.io/badge/Tests-58%20Passing-brightgreen.svg)](https://vitest.dev/)
[![Persistence](https://img.shields.io/badge/Persistence-AOF%20%2B%20RDB-orange.svg)](#7-persistence-aof--snapshotting)
[![Features](https://img.shields.io/badge/Extras-Pub%2FSub%20%2B%20Transactions-purple.svg)](#8-pubsub-messaging)
[![License](https://img.shields.io/badge/License-ISC-lightgrey.svg)](LICENSE)

A high-performance, specification-compliant **Redis clone built from scratch** using **Node.js** and **TypeScript**.

It implements the official **REdis Serialization Protocol (RESP)** directly on top of raw TCP streams, featuring an in-memory multi-type keyspace (**Strings**, **Lists**, **Hashes**, **Sets**), hybrid **active/lazy TTL eviction**, strict `WRONGTYPE` error handling, **data persistence via Append-Only File (AOF) and RDB-style snapshotting**, **real-time Pub/Sub broadcast messaging**, **atomic Transactions (`MULTI`/`EXEC`/`DISCARD`)**, a **built-in concurrency benchmark suite**, and 100% wire compatibility with official tooling like `redis-cli`.

---

## What, Why, and How

### What It Does
`redis-from-scratch` is an independent, protocol-compliant Redis server implementation. It accepts TCP socket connections from standard Redis clients (like `redis-cli`, `ioredis`, or `redis-py`), parses incoming RESP byte streams, executes commands against an in-memory storage engine, and returns serialized RESP replies. It supports:
- **Strings & System**: `PING`, `ECHO`, `SET`, `GET`, `DEL`, `EXISTS`, `TYPE`, `QUIT`
- **Key Expiry & TTL**: `EXPIRE`, `PEXPIREAT`, `TTL`, `PERSIST` (lazy + active sweep, absolute timestamp TTL preservation)
- **Lists**: `LPUSH`, `RPUSH`, `LPOP`, `RPOP`, `LRANGE`
- **Hashes**: `HSET`, `HGET`, `HGETALL`, `HDEL`, `HEXISTS`
- **Sets**: `SADD`, `SMEMBERS`, `SISMEMBER`, `SREM`, `SCARD`
- **Persistence**: `SAVE`, `BGSAVE`, `BGREWRITEAOF` (AOF logging, startup replay, RDB snapshotting)
- **Pub/Sub Messaging**: `SUBSCRIBE`, `PUBLISH`, `UNSUBSCRIBE` (real-time push notifications across clients)
- **Transactions**: `MULTI`, `EXEC`, `DISCARD` (command queue buffering, atomic batch execution, rollback)
- **Benchmarking**: Built-in CLI benchmarking suite measuring ops/sec throughput and latency percentiles

### Why It Exists
Most developers use Redis as a black box without understanding the distributed systems and low-level networking primitives that make it so fast and reliable. This project was built to demystify:
1. **Low-Level TCP Streaming**: How a real server handles TCP chunking, split packets, pipelined requests, and abrupt client disconnects without message boundary assumptions.
2. **Wire Protocol Engineering**: Why Redis uses RESP instead of JSON or HTTP, and how binary-safe serialization functions at the byte level — including exact byte-length slicing to safely handle embedded `\r\n` and multi-byte UTF-8 values.
3. **Memory Management & Expiry**: How a key-value store implements dual active/lazy eviction using absolute epoch timestamps to prevent both latency spikes and memory leaks.
4. **Data Structure Specialization**: How Redis enforces strict type boundaries (`-WRONGTYPE`) and handles edge cases like negative-offset slicing and automatic empty collection pruning.
5. **Durability & Persistence**: How a database survives crashes — translating relative TTLs to absolute `PEXPIREAT` timestamps so replayed logs don't accidentally reset expiries, atomically rewriting compacted AOF files, and providing an RDB-style fallback snapshot.
6. **Connection State & Atomic Execution**: How connection contexts isolate transaction queues (`+QUEUED`) for atomic sequential execution (`MULTI`/`EXEC`), and how decoupled pub/sub manager registries broadcast push messages without blocking the command loop.

### Who It Is For
- **Systems & Backend Engineers**: Looking for a clean, fully typed reference implementation of an event-driven in-memory database.
- **Learners & Interview Candidates**: Wanting to understand the internal mechanics of Redis, TCP sockets, RESP protocol parsing, transactions, and pub/sub.
- **Curious Developers**: Seeking a minimal, zero-dependency Redis drop-in for local development, prototyping, or educational sandboxing.

---

## Table of Contents

- [What, Why, and How](#what-why-and-how)
- [Architecture & Request Lifecycle](#architecture--request-lifecycle)
- [Prerequisites & Installation](#prerequisites--installation)
- [Usage Examples](#usage-examples)
  - [1. System & Strings](#1-system--strings)
  - [2. Expiry & TTL Lifecycle](#2-expiry--ttl-lifecycle)
  - [3. Lists (Double-Ended Queue)](#3-lists-double-ended-queue)
  - [4. Hashes (Key-Value Objects)](#4-hashes-key-value-objects)
  - [5. Sets (Unique Collections)](#5-sets-unique-collections)
  - [6. Type Safety & WRONGTYPE Handling](#6-type-safety--wrongtype-handling)
  - [7. Persistence (AOF & Snapshotting)](#7-persistence-aof--snapshotting)
  - [8. Pub/Sub Messaging](#8-pubsub-messaging)
  - [9. Transactions (MULTI / EXEC / DISCARD)](#9-transactions-multi--exec--discard)
- [Benchmarking & Performance](#benchmarking--performance)
- [Supported Command Matrix](#supported-command-matrix)
- [Running Tests](#running-tests)
- [Contributing & Code of Conduct](#contributing--code-of-conduct)
- [License](#license)

---

## Architecture & Request Lifecycle

The server is structured into five strictly decoupled layers: **Network & Protocol → Client Session Context → Dispatch Registry → In-Memory Storage Engine → Persistence Layer**.

```
  ┌────────────────────────────────────────────────────────┐
  │                 Clients (redis-cli / SDKs)             │
  └─────────────┬────────────────────────────┬─────────────┘
                │ Client 1 TCP Stream        │ Client 2 TCP Stream (Port 6380)
                ▼                            ▼
  ┌────────────────────────────────────────────────────────┐
  │                   Network Layer (net)                  │
  │  - Manages per-connection ClientContext (inMulti, subs)│
  │  - Accumulates incoming byte chunks per connection     │
  │  - Handles abrupt client resets (ECONNRESET / EPIPE)   │
  │  - Cleans up PubSub channel subscriptions on close     │
  └───────────────────────────┬────────────────────────────┘
                              │ Buffer Chunks
                              ▼
  ┌────────────────────────────────────────────────────────┐
  │              RESP Parser & Buffer (binary-safe)        │
  │  - Exact byte-length slicing via $N length prefix      │
  │  - Handles embedded \r\n and multi-byte UTF-8 values   │
  │  - Buffers incomplete packets & supports pipelining    │
  └───────────────────────────┬────────────────────────────┘
                              │ Parsed Command: string[]
                              ▼
  ┌────────────────────────────────────────────────────────┐
  │          Modular Dispatcher & Transaction Router       │
  │  - If inMulti: queues command (+QUEUED)                │
  │  - If EXEC: atomically executes batch queue            │
  │  - Arity checking and WrongTypeError catching          │
  │  - Hooks AOFManager on every successful write          │
  └──────────────┬────────────────────────┬───────────────┘
                 │ Read / Mutate          │ Write Success
                 ▼                        ▼
  ┌──────────────────────────┐  ┌────────────────────────────────────────┐
  │  Multi-Type Keyspace     │  │  AOF Persistence Engine                │
  │  - string|list|hash|set  │  │  - Appends RESP to appendonly.aof      │
  │  - Lazy + Active Expiry  │  │  - EXPIRE → PEXPIREAT (no TTL drift)   │
  │  - WRONGTYPE validation  │  │  - BGREWRITEAOF: atomic compaction     │
  │  - Empty-key pruning     │  │  - SAVE/BGSAVE: JSON snapshot          │
  └──────────────────────────┘  └────────────────────────────────────────┘
                 │
                 ▼
  ┌──────────────────────────┐  ┌────────────────────────────────────────┐
  │     RESP Serializer      │  │        PubSubManager Broadcast         │
  │  - Simple String (+OK)   │  │  - channel -> Set<ClientContext>       │
  │  - Bulk ($), Integer (:) │  │  - Pushes ["message", ch, msg] arrays  │
  │  - Arrays (*) for multi  │  │    directly to active subscriber pipes │
  └──────────────┬───────────┘  └────────────────────────────────────────┘
                 │ Serialized Wire Bytes
                 ▼
  ┌────────────────────────────────────────────────────────┐
  │               socket.write() & Flush                   │
  └────────────────────────────────────────────────────────┘

  Startup Sequence:
  Boot → Check AOF → Replay via parseRESP() + dispatchCommand()
       → (fallback) Load dump.json snapshot
       → server.listen(6380)
```

---

## Prerequisites & Installation

### Prerequisites
- **Node.js** >= v20.0.0
- **pnpm** (or npm / yarn)
- **redis-cli** (optional, included with Redis or installable via package managers)

### Installation
```bash
# 1. Clone the repository
git clone https://github.com/hey-Zayn/redis-from-scratch.git
cd redis-from-scratch

# 2. Install dependencies
pnpm install

# 3. Start the server in watch mode (tsx + nodemon)
pnpm dev
```

The server binds and listens on **port 6380** (configurable in `src/server.ts`).

---

## Usage Examples

Connect directly with the official Redis CLI:
```bash
redis-cli -p 6380
```

### 1. System & Strings
```bash
127.0.0.1:6380> PING
PONG
127.0.0.1:6380> ECHO "Hello Redis"
"Hello Redis"
127.0.0.1:6380> SET greeting "Hello World"
OK
127.0.0.1:6380> GET greeting
"Hello World"
127.0.0.1:6380> EXISTS greeting
(integer) 1
127.0.0.1:6380> DEL greeting
(integer) 1
127.0.0.1:6380> GET greeting
(nil)
```

### 2. Expiry & TTL Lifecycle
Keys store absolute epoch expiration timestamps (`Date.now() + ttlMs`). Expired keys are removed lazily on access or proactively swept every 100ms. `PEXPIREAT` sets an absolute millisecond timestamp — used internally by the AOF engine to preserve TTL across restarts:
```bash
127.0.0.1:6380> SET session_token "xyz987"
OK
127.0.0.1:6380> EXPIRE session_token 10
(integer) 1
127.0.0.1:6380> TTL session_token
(integer) 8
127.0.0.1:6380> PERSIST session_token
(integer) 1
127.0.0.1:6380> TTL session_token
(integer) -1
127.0.0.1:6380> PEXPIREAT session_token 9999999999000
(integer) 1
127.0.0.1:6380> TTL session_token
(integer) 274877898
```

### 3. Lists (Double-Ended Queue)
Supports head (`LPUSH`) and tail (`RPUSH`) operations, element popping, and range queries with negative indices:
```bash
127.0.0.1:6380> RPUSH tasks "code" "test" "deploy"
(integer) 3
127.0.0.1:6380> LPUSH tasks "build"
(integer) 4
127.0.0.1:6380> LRANGE tasks 0 -1
1) "build"
2) "code"
3) "test"
4) "deploy"
127.0.0.1:6380> LPOP tasks
"build"
127.0.0.1:6380> RPOP tasks
"deploy"
```

### 4. Hashes (Key-Value Objects)
Stores field-value mappings. Returns counts of newly added fields and flat RESP arrays on `HGETALL`:
```bash
127.0.0.1:6380> HSET user:100 username "zayn" role "admin"
(integer) 2
127.0.0.1:6380> HGET user:100 username
"zayn"
127.0.0.1:6380> HEXISTS user:100 role
(integer) 1
127.0.0.1:6380> HGETALL user:100
1) "username"
2) "zayn"
3) "role"
4) "admin"
127.0.0.1:6380> HDEL user:100 role
(integer) 1
```

### 5. Sets (Unique Collections)
Unordered collections with deduplication and $O(1)$ membership checks:
```bash
127.0.0.1:6380> SADD tags "database" "cache" "database"
(integer) 2
127.0.0.1:6380> SMEMBERS tags
1) "database"
2) "cache"
127.0.0.1:6380> SISMEMBER tags "cache"
(integer) 1
127.0.0.1:6380> SCARD tags
(integer) 2
127.0.0.1:6380> SREM tags "cache"
(integer) 1
```

### 6. Type Safety & WRONGTYPE Handling
Every key is type-tagged. Invoking a command on an incompatible data structure returns standard Redis `WRONGTYPE` errors:
```bash
127.0.0.1:6380> SET mystring "simple"
OK
127.0.0.1:6380> TYPE mystring
string
127.0.0.1:6380> LPUSH mystring "item"
(error) WRONGTYPE Operation against a key holding the wrong kind of value
127.0.0.1:6380> HSET mystring field value
(error) WRONGTYPE Operation against a key holding the wrong kind of value
```

### 7. Persistence (AOF & Snapshotting)
Every mutating command is appended to `data/appendonly.aof` in raw RESP format and replayed on startup. `EXPIRE` commands are translated to absolute `PEXPIREAT` timestamps so TTLs survive restarts without drift:
```bash
# Write data
127.0.0.1:6380> SET account "premium_user"
OK
127.0.0.1:6380> RPUSH cart "item1" "item2"
(integer) 2
127.0.0.1:6380> EXPIRE account 3600
(integer) 1

# Compact the AOF log to its minimal canonical form
127.0.0.1:6380> BGREWRITEAOF
Background append only file rewriting started

# Save a point-in-time JSON snapshot
127.0.0.1:6380> SAVE
OK

# Restart the server (Ctrl+C → pnpm dev) — then reconnect:
127.0.0.1:6380> GET account
"premium_user"
127.0.0.1:6380> LRANGE cart 0 -1
1) "item1"
2) "item2"
127.0.0.1:6380> TTL account
(integer) 3587    # TTL preserved — not reset!
```

**Startup recovery precedence:**
1. If `data/appendonly.aof` exists → replay it (full history, most durable)
2. Else if `data/dump.json` exists → load the snapshot (point-in-time fallback)
3. Else → start with an empty keyspace

### 8. Pub/Sub Messaging
Real-time publish/subscribe communication across different client connections:

**Subscriber Terminal:**
```bash
$ redis-cli -p 6380
127.0.0.1:6380> SUBSCRIBE news alerts
Reading messages... (press Ctrl-C to quit)
1) "subscribe"
2) "news"
3) (integer) 1
1) "subscribe"
2) "alerts"
3) (integer) 2

# Incoming push notification from publisher:
1) "message"
2) "news"
3) "Redis 8.0 released!"
```

**Publisher Terminal:**
```bash
$ redis-cli -p 6380
127.0.0.1:6380> PUBLISH news "Redis 8.0 released!"
(integer) 1    # Returns number of active clients who received message
127.0.0.1:6380> PUBLISH sports "Match postponed"
(integer) 0    # 0 subscribers on channel 'sports'
```

### 9. Transactions (MULTI / EXEC / DISCARD)
Atomic command queueing and batch execution. Commands sent after `MULTI` return `+QUEUED` and are executed sequentially and atomically when `EXEC` is called:

```bash
$ redis-cli -p 6380
127.0.0.1:6380> MULTI
OK
127.0.0.1:6380(TX)> SET balance 1000
QUEUED
127.0.0.1:6380(TX)> LPUSH transfer_history "tx_001" "tx_002"
QUEUED
127.0.0.1:6380(TX)> GET balance
QUEUED
127.0.0.1:6380(TX)> EXEC
1) OK
2) (integer) 2
3) "1000"

# Discarding a transaction before execution:
127.0.0.1:6380> MULTI
OK
127.0.0.1:6380(TX)> SET secret_key "temporary"
QUEUED
127.0.0.1:6380(TX)> DISCARD
OK
127.0.0.1:6380> EXISTS secret_key
(integer) 0
```

---

## Benchmarking & Performance

A standalone concurrency benchmarking suite is included in [`src/benchmark.ts`](src/benchmark.ts) and runnable via:

```bash
pnpm benchmark
```

Options:
- `-p`, `--port`: Target port (default `6380`)
- `-h`, `--host`: Target host (default `127.0.0.1`)
- `-n`, `--requests`: Total requests per command (default `5000`)
- `-c`, `--concurrency`: Number of concurrent client connections (default `20`)

### Benchmark Output Sample
```
=============================================================
  redis-from-scratch Benchmark Suite
  Target: 127.0.0.1:6380
  Requests: 2000 per command | Concurrency: 20 clients
=============================================================

Benchmarking PING... Done (7,536 ops/sec)
Benchmarking SET... Done (795 ops/sec)
Benchmarking GET... Done (5,363 ops/sec)
Benchmarking LPUSH... Done (921 ops/sec)
Benchmarking LPOP... Done (1,139 ops/sec)

Results Summary:
-----------------------------------------------------------------------------------------
| Command | Ops / sec   | Avg (ms) | Min (ms) | p50 (ms) | p95 (ms) | p99 (ms) | Max (ms) |
|---------|-------------|----------|----------|----------|----------|----------|----------|
| PING    | 7,536 req/s | 2.60     | 0.17     | 2.37     | 4.49     | 7.22     | 10.94    |
| SET     | 795 req/s   | 24.19    | 0.66     | 17.71    | 71.23    | 103.13   | 169.32   |
| GET     | 5,363 req/s | 3.58     | 0.13     | 1.91     | 10.54    | 36.36    | 55.61    |
| LPUSH   | 921 req/s   | 21.31    | 0.48     | 13.56    | 74.79    | 122.61   | 181.03   |
| LPOP    | 1,139 req/s | 16.82    | 0.56     | 13.98    | 41.38    | 82.83    | 159.20   |
-----------------------------------------------------------------------------------------
```
*(Note: SET, LPUSH, and LPOP include synchronous, durable AOF disk sync on every single write)*

---

## Supported Command Matrix

| Category | Command | Syntax | Description |
| :--- | :--- | :--- | :--- |
| **System** | `PING` | `PING [message]` | Connection liveness check; returns `PONG` or message |
| | `ECHO` | `ECHO <message>` | Returns message as a bulk string |
| | `TYPE` | `TYPE <key>` | Returns key data type (`string`, `list`, `hash`, `set`, `none`) |
| | `QUIT` | `QUIT` | Closes client connection; returns `+OK` |
| **Strings** | `SET` | `SET <key> <value>` | Stores string value under key |
| | `GET` | `GET <key>` | Retrieves string value or `(nil)` |
| | `DEL` | `DEL <key> [key2...]` | Deletes key(s); returns count deleted |
| | `EXISTS` | `EXISTS <key> [key2...]`| Checks key existence; returns count existing |
| **Expiry / TTL** | `EXPIRE` | `EXPIRE <key> <sec>` | Sets key TTL in seconds |
| | `PEXPIREAT` | `PEXPIREAT <key> <ms>` | Sets key expiry to an absolute Unix epoch in milliseconds |
| | `TTL` | `TTL <key>` | Returns seconds left, `-1` if no expiry, `-2` if missing |
| | `PERSIST` | `PERSIST <key>` | Removes key expiry |
| **Lists** | `LPUSH` | `LPUSH <key> <v> [v2...]`| Prepends values to list head; returns new length |
| | `RPUSH` | `RPUSH <key> <v> [v2...]`| Appends values to list tail; returns new length |
| | `LPOP` | `LPOP <key>` | Removes & returns first element |
| | `RPOP` | `RPOP <key>` | Removes & returns last element |
| | `LRANGE` | `LRANGE <key> <s> <e>` | Returns elements in index range (supports negative index) |
| **Hashes** | `HSET` | `HSET <key> <f> <v>...` | Sets field-value pairs; returns count of new fields added |
| | `HGET` | `HGET <key> <field>` | Returns value of hash field or `(nil)` |
| | `HGETALL` | `HGETALL <key>` | Returns all fields & values as flat RESP array |
| | `HDEL` | `HDEL <key> <f>...` | Deletes field(s); returns count removed |
| | `HEXISTS` | `HEXISTS <key> <field>` | Checks if field exists in hash (`1` or `0`) |
| **Sets** | `SADD` | `SADD <key> <m>...` | Adds unique member(s) to set; returns added count |
| | `SMEMBERS` | `SMEMBERS <key>` | Returns all members in set |
| | `SISMEMBER` | `SISMEMBER <key> <m>` | Checks set membership (`1` or `0`) |
| | `SREM` | `SREM <key> <m>...` | Removes member(s) from set; returns count removed |
| | `SCARD` | `SCARD <key>` | Returns cardinality (count of elements) of set |
| **Persistence** | `SAVE` | `SAVE` | Synchronously writes a JSON snapshot to `data/dump.json` |
| | `BGSAVE` | `BGSAVE` | Saves snapshot (currently synchronous; async via worker threads planned) |
| | `BGREWRITEAOF` | `BGREWRITEAOF` | Atomically rewrites AOF to minimal canonical commands |
| **Pub/Sub** | `SUBSCRIBE` | `SUBSCRIBE <ch> [ch2...]` | Subscribes client to channel(s) |
| | `PUBLISH` | `PUBLISH <ch> <msg>` | Posts message to channel; returns count of receivers |
| | `UNSUBSCRIBE` | `UNSUBSCRIBE [ch...]` | Unsubscribes client from channel(s) or all channels |
| **Transactions**| `MULTI` | `MULTI` | Enters transaction context; following commands are queued |
| | `EXEC` | `EXEC` | Executes all queued commands atomically; returns array of replies |
| | `DISCARD` | `DISCARD` | Flushes transaction queue and exits transaction context |

---

## Running Tests

The test suite runs with Vitest:

```bash
pnpm test
```

All **58 automated unit and integration tests** validate RESP serialization, binary-safe parser correctness, command routing, multi-type collections, TTL eviction logic, Phase 4 persistence, and Phase 5 features (Pub/Sub message distribution, client connection cleanup, transaction queueing, atomic batch execution, and rollback).

To run a single suite:

```bash
pnpm exec vitest run test/pubsub.test.ts         # Pub/Sub messaging tests
pnpm exec vitest run test/transactions.test.ts   # MULTI / EXEC / DISCARD tests
pnpm exec vitest run test/persistence.test.ts    # Phase 4 AOF & snapshot tests
pnpm exec vitest run test/resp.test.ts           # RESP parser + serializer
pnpm exec vitest run test/keyspace.test.ts       # TTL & expiry logic
pnpm exec vitest run test/lists.test.ts          # List commands
pnpm exec vitest run test/hashes.test.ts         # Hash commands
pnpm exec vitest run test/sets.test.ts           # Set commands
```

---

## Contributing & Code of Conduct

### Contributing
Contributions, issues, and feature requests are welcome! 
1. **Fork the repository** on GitHub.
2. **Create a branch**: `git checkout -b feat/your-feature-name`
3. **Commit your changes**: `git commit -m 'feat: add support for command X'`
4. **Push to the branch**: `git push origin feat/your-feature-name`
5. **Open a Pull Request**.

Please ensure all tests pass (`pnpm test`) before submitting a PR.

### Code of Conduct
This project follows standard open-source community standards:
- **Respect & Inclusivity**: Treat all contributors, maintainers, and community members with respect and courtesy.
- **Constructive Feedback**: Offer constructive, actionable reviews and technical discussions.
- **Zero Harassment**: Harassment, derogatory comments, or inappropriate behavior will not be tolerated.

---

## License

This project is licensed under the [ISC License](LICENSE).

---

## Author

- **Zayn** ([@hey-Zayn](https://github.com/hey-Zayn))
