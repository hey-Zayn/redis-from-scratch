# [redis-from-scratch](https://github.com/hey-Zayn/redis-from-scratch)

[![TypeScript](https://img.shields.io/badge/TypeScript-5.x-blue.svg)](https://www.typescriptlang.org/)
[![Node.js](https://img.shields.io/badge/Node.js-22.x-green.svg)](https://nodejs.org/)
[![Protocol](https://img.shields.io/badge/Protocol-RESP_v2-red.svg)](https://redis.io/docs/reference/protocol-spec/)
[![Tests](https://img.shields.io/badge/Tests-34%20Passing-brightgreen.svg)](https://vitest.dev/)
[![License](https://img.shields.io/badge/License-ISC-lightgrey.svg)](LICENSE)

A high-performance, specification-compliant **Redis clone built from scratch** using **Node.js** and **TypeScript**. 

It implements the official **REdis Serialization Protocol (RESP)** directly on top of raw TCP streams, featuring an in-memory multi-type keyspace (**Strings**, **Lists**, **Hashes**, **Sets**), hybrid **active/lazy TTL eviction**, strict `WRONGTYPE` error handling, and 100% wire compatibility with official tooling like `redis-cli`.

---

## What, Why, and How

### What It Does
`redis-from-scratch` is an independent, protocol-compliant Redis server implementation. It accepts TCP socket connections from standard Redis clients (like `redis-cli`, `ioredis`, or `redis-py`), parses incoming RESP byte streams, executes commands against an in-memory storage engine, and returns serialized RESP replies. It supports:
- **Strings & System**: `PING`, `ECHO`, `SET`, `GET`, `DEL`, `EXISTS`, `TYPE`
- **Key Expiry & TTL**: `EXPIRE`, `TTL`, `PERSIST` (with lazy + active sweep eviction)
- **Lists**: `LPUSH`, `RPUSH`, `LPOP`, `RPOP`, `LRANGE`
- **Hashes**: `HSET`, `HGET`, `HGETALL`, `HDEL`, `HEXISTS`
- **Sets**: `SADD`, `SMEMBERS`, `SISMEMBER`, `SREM`, `SCARD`

### Why It Exists
Most developers use Redis as a black box without understanding the distributed systems and low-level networking primitives that make it so fast and reliable. This project was built to demystify:
1. **Low-Level TCP Streaming**: How a real server handles TCP chunking, split packets, pipelined requests, and abrupt client disconnects without message boundary assumptions.
2. **Wire Protocol Engineering**: Why Redis uses RESP instead of JSON or HTTP, and how binary-safe serialization functions at the byte level.
3. **Memory Management & Expiry**: How a key-value store implements dual active/lazy eviction using absolute epoch timestamps to prevent both latency spikes and memory leaks.
4. **Data Structure Specialization**: How Redis enforces strict type boundaries (`-WRONGTYPE`) and handles edge cases like negative-offset slicing and automatic empty collection pruning.

### Who It Is For
- **Systems & Backend Engineers**: Looking for a clean, fully typed reference implementation of an event-driven in-memory database.
- **Learners & Interview Candidates**: Wanting to understand the internal mechanics of Redis, TCP sockets, and RESP protocol parsing.
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
- [Supported Command Matrix](#supported-command-matrix)
- [Running Tests](#running-tests)
- [Contributing & Code of Conduct](#contributing--code-of-conduct)
- [License](#license)

---

## Architecture & Request Lifecycle

The server is structured in three strictly decoupled layers: **Network & Protocol Layer &rarr; Dispatch Registry &rarr; In-Memory Storage Engine**.

```
  ┌────────────────────────────────────────────────────────┐
  │                 Client (redis-cli / SDK)               │
  └───────────────────────────┬────────────────────────────┘
                              │ Raw TCP Stream (Port 6380)
                              ▼
  ┌────────────────────────────────────────────────────────┐
  │                   Network Layer (net)                  │
  │  - Accumulates incoming byte chunks per connection     │
  │  - Handles abrupt client resets (ECONNRESET / EPIPE)   │
  └───────────────────────────┬────────────────────────────┘
                              │ Buffer Chunks
                              ▼
  ┌────────────────────────────────────────────────────────┐
  │                   RESP Parser & Buffer                 │
  │  - Decodes Arrays, Bulk Strings, Integers, Tokens      │
  │  - Buffers incomplete packets & supports pipelining    │
  │  - Enforces strict \r\n (CRLF) framing boundaries      │
  └───────────────────────────┬────────────────────────────┘
                              │ Parsed Command: string[]
                              ▼
  ┌────────────────────────────────────────────────────────┐
  │               Modular Command Dispatcher               │
  │  - Registry lookup table (Record<string, Handler>)     │
  │  - Arity checking and error catching                   │
  └───────────────────────────┬────────────────────────────┘
                              │ Read / Mutate
                              ▼
  ┌────────────────────────────────────────────────────────┐
  │              Multi-Type Keyspace Engine                │
  │  - Discriminated union: string | list | hash | set     │
  │  - Strict WRONGTYPE validation                         │
  │  - Inline Lazy Expiry on read access                   │
  │  - Server-level Active Expiry Sweep (100ms interval)   │
  │  - Auto-deletion of empty collections                  │
  └───────────────────────────┬────────────────────────────┘
                              │ Result
                              ▼
  ┌────────────────────────────────────────────────────────┐
  │                   RESP Serializer                      │
  │  - Simple String (+), Bulk ($), Integer (:), Err (-)   │
  │  - RESP Array (*) for LRANGE, HGETALL, SMEMBERS        │
  └───────────────────────────┬────────────────────────────┘
                              │ Serialized Wire Bytes
                              ▼
  ┌────────────────────────────────────────────────────────┐
  │               socket.write() & Flush                   │
  └────────────────────────────────────────────────────────┘
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
Keys store absolute epoch expiration timestamps (`Date.now() + ttlMs`). Expired keys are removed lazily on access or proactively swept every 100ms:
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

---

## Supported Command Matrix

| Category | Command | Syntax | Description |
| :--- | :--- | :--- | :--- |
| **System** | `PING` | `PING [message]` | Connection liveness check; returns `PONG` or message |
| | `ECHO` | `ECHO <message>` | Returns message as a bulk string |
| | `TYPE` | `TYPE <key>` | Returns key data type (`string`, `list`, `hash`, `set`, `none`) |
| **Strings** | `SET` | `SET <key> <value>` | Stores string value under key |
| | `GET` | `GET <key>` | Retrieves string value or `(nil)` |
| | `DEL` | `DEL <key> [key2...]` | Deletes key(s); returns count deleted |
| | `EXISTS` | `EXISTS <key> [key2...]`| Checks key existence; returns count existing |
| **Expiry / TTL** | `EXPIRE` | `EXPIRE <key> <sec>` | Sets key TTL in seconds |
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

---

## Running Tests

The test suite runs with Vitest:

```bash
pnpm test
```

All 34 automated unit and integration tests validate RESP serialization, command routing, multi-type collections, and TTL eviction logic.

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
