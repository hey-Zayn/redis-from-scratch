# How to Use redis-from-scratch

A step-by-step guide for a new user going from an empty terminal to running real commands against this server.

---

## Step 1: Get the code

```bash
git clone https://github.com/hey-Zayn/redis-from-scratch.git
cd redis-from-scratch
```

## Step 2: Install dependencies

The project uses `pnpm`, but `npm` or `yarn` work too.

```bash
pnpm install
```

Everything installed is a dev dependency (`typescript`, `tsx`, `nodemon`, `vitest`, `@types/node`). There's no `.env` file, no external database — the "database" is in-memory inside the Node process.

## Step 3: Start the server

```bash
pnpm dev
```

This runs `nodemon --watch src --ext ts --exec tsx src/server.ts` — it watches `src/` and auto-restarts on save.

Expected output:

```
Listening on port 6380
```

If the server previously wrote a `data/appendonly.aof` file, you'll also see:

```
[AOF] Successfully replayed N command(s). Keyspace restored.
```

This means your data from before the restart was automatically recovered. Leave this terminal running.

## Step 4: Connect with `redis-cli`

Open a **second terminal**. You need the real Redis CLI installed separately — it isn't bundled with this project.

```bash
# macOS
brew install redis

# Ubuntu/Debian
sudo apt install redis-tools

# Windows — easiest via WSL, or a Windows Redis build
```

Connect on port **6380** (not the Redis default 6379, since that's what this server uses):

```bash
redis-cli -p 6380
```

You'll land in an interactive prompt:

```
127.0.0.1:6380>
```

## Step 5: Try the basics

```
PING
→ PONG

PING "hello"
→ "hello"

ECHO "testing 1 2 3"
→ "testing 1 2 3"

SET greeting "Hello World"
→ OK

GET greeting
→ "Hello World"

EXISTS greeting
→ (integer) 1

EXISTS greeting nonexistent_key
→ (integer) 1

TYPE greeting
→ string

DEL greeting
→ (integer) 1

GET greeting
→ (nil)

EXISTS greeting
→ (integer) 0
```

## Step 6: Try TTL / expiry

```
SET session_token "xyz987"
→ OK

EXPIRE session_token 10
→ (integer) 1

TTL session_token
→ (integer) 8

# Wait a few seconds, TTL counts down...
TTL session_token
→ (integer) 4

# Remove the expiry — key becomes permanent again
PERSIST session_token
→ (integer) 1

TTL session_token
→ (integer) -1

# Set an expiry using an absolute millisecond timestamp
# (useful for replaying logs without TTL drift)
PEXPIREAT session_token 9999999999999
→ (integer) 1

TTL session_token
→ (integer) 274877898

# A key that has fully expired returns -2
SET temp "gone"
EXPIRE temp 1
# (wait 2 seconds)
TTL temp
→ (integer) -2

GET temp
→ (nil)
```

## Step 7: Try the richer data types

**Lists:**

```
RPUSH tasks "code" "test" "deploy"
→ (integer) 3

LPUSH tasks "build"
→ (integer) 4

LRANGE tasks 0 -1
→ 1) "build"  2) "code"  3) "test"  4) "deploy"

# Slice with positive and negative indices
LRANGE tasks 1 2
→ 1) "code"  2) "test"

LRANGE tasks -2 -1
→ 1) "test"  2) "deploy"

# Pop from both ends
LPOP tasks
→ "build"

RPOP tasks
→ "deploy"

LRANGE tasks 0 -1
→ 1) "code"  2) "test"

TYPE tasks
→ list
```

**Hashes:**

```
HSET user:100 username "zayn" role "admin" age "25"
→ (integer) 3

HGET user:100 username
→ "zayn"

HGET user:100 missing_field
→ (nil)

HGETALL user:100
→ 1) "username"  2) "zayn"  3) "role"  4) "admin"  5) "age"  6) "25"

HEXISTS user:100 role
→ (integer) 1

HEXISTS user:100 email
→ (integer) 0

# Update an existing field — returns 0 (no new fields added)
HSET user:100 age "26"
→ (integer) 0

# Add a new field — returns 1
HSET user:100 email "zayn@example.com"
→ (integer) 1

HDEL user:100 email
→ (integer) 1

TYPE user:100
→ hash
```

**Sets:**

```
SADD tags "database" "cache" "database"
→ (integer) 2

SMEMBERS tags
→ 1) "database"  2) "cache"

SISMEMBER tags "database"
→ (integer) 1

SISMEMBER tags "queue"
→ (integer) 0

SCARD tags
→ (integer) 2

# Add more members
SADD tags "queue" "pubsub"
→ (integer) 2

SCARD tags
→ (integer) 4

SREM tags "pubsub"
→ (integer) 1

SMEMBERS tags
→ 1) "database"  2) "cache"  3) "queue"

TYPE tags
→ set
```

## Step 8: See type-safety in action

Trying to use a command from the wrong data type gives a clear error — not a crash or corrupt data:

```
SET mystring "simple"
→ OK

LPUSH mystring "item"
→ (error) WRONGTYPE Operation against a key holding the wrong kind of value

SADD mystring "member"
→ (error) WRONGTYPE Operation against a key holding the wrong kind of value

HSET mystring field value
→ (error) WRONGTYPE Operation against a key holding the wrong kind of value

# TYPE always works regardless of the underlying data type
TYPE mystring
→ string

# DEL works across all types
RPUSH mylist "a" "b"
DEL mystring mylist
→ (integer) 2
```

## Step 9: Try persistence (Phase 4)

Data now **survives server restarts**. The server uses an Append-Only File (AOF) at `data/appendonly.aof` and can also create point-in-time snapshots at `data/dump.json`.

**Verify it yourself:**

```bash
# Terminal 1 — connect and write some data
redis-cli -p 6380

SET account "premium_user"
RPUSH cart "item1" "item2" "item3"
HSET profile name "Zayn" plan "pro"
SADD permissions "read" "write" "admin"
EXPIRE account 3600

# Check the AOF file was written
# (in a separate shell, outside redis-cli)
cat data/appendonly.aof
```

Now stop and restart the server:

```bash
# Stop: Ctrl+C in the server terminal
# Start again:
pnpm dev
```

You'll see on boot:

```
[AOF] Successfully replayed 5 command(s). Keyspace restored.
Listening on port 6380
```

Reconnect and verify everything survived:

```bash
redis-cli -p 6380

GET account
→ "premium_user"

LRANGE cart 0 -1
→ 1) "item1"  2) "item2"  3) "item3"

HGETALL profile
→ 1) "name"  2) "Zayn"  3) "plan"  4) "pro"

SMEMBERS permissions
→ 1) "read"  2) "write"  3) "admin"

TTL account
→ (integer) 3587    ← TTL preserved! Not reset to 3600.
```

**Snapshot commands:**

```
# Save a point-in-time JSON snapshot to data/dump.json
SAVE
→ OK

# Same as SAVE (non-blocking in future versions)
BGSAVE
→ Background saving started

# Compact the AOF log to minimal canonical commands
# (removes redundant history, reclaims disk space)
BGREWRITEAOF
→ Background append only file rewriting started
```

**How the fallback works:**
- If `data/appendonly.aof` exists → server replays it on startup.
- If no AOF exists but `data/dump.json` exists → server loads the snapshot instead.
- If neither exists → server starts with an empty keyspace (fresh start).

## Step 10: Run the test suite

In a separate terminal — the server keeps running independently:

```bash
pnpm test
```

Runs all `vitest` tests directly against the store and parser logic; no live server or `redis-cli` needed for this.

To run a specific test file:

```bash
# Only persistence tests
pnpm exec vitest run test/persistence.test.ts

# Only RESP parser/serializer tests
pnpm exec vitest run test/resp.test.ts

# Only list/hash/set tests
pnpm exec vitest run test/lists.test.ts
pnpm exec vitest run test/hashes.test.ts
pnpm exec vitest run test/sets.test.ts

# Only keyspace TTL/expiry tests
pnpm exec vitest run test/keyspace.test.ts
```

Expected output (all tests):

```
✓ test/keyspace.test.ts (5 tests)
✓ test/hashes.test.ts (6 tests)
✓ test/sets.test.ts (7 tests)
✓ test/lists.test.ts (8 tests)
✓ test/resp.test.ts (9 tests)
✓ test/persistence.test.ts (8 tests)

Test Files  6 passed (6)
     Tests  43 passed (43)
```

## Step 11: Explore or extend it

- **Add a new command** — write a handler function in the matching `src/commands/*.ts` file, then register it in `src/commands/index.ts`.
- **Change the port** — edit the `PORT` constant at the top of `src/server.ts`.
- **Inspect state** — there's no `KEYS *` command yet, so the only way to see what's stored is through commands you already know the key names for (`GET`, `HGETALL`, etc.).
- **Disable AOF** — set `aofManager.isEnabled = false` in `src/store/persistence.ts` if you want a pure in-memory mode with no disk writes.

---

## Quick reference: supported commands

| Category        | Commands                                                                 |
| --------------- | ------------------------------------------------------------------------ |
| **System**      | `PING`, `ECHO`, `TYPE`                                                   |
| **Strings**     | `SET`, `GET`, `DEL`, `EXISTS`                                            |
| **Expiry**      | `EXPIRE`, `PEXPIREAT`, `TTL`, `PERSIST`                                  |
| **Lists**       | `LPUSH`, `RPUSH`, `LPOP`, `RPOP`, `LRANGE`                              |
| **Hashes**      | `HSET`, `HGET`, `HGETALL`, `HDEL`, `HEXISTS`                            |
| **Sets**        | `SADD`, `SMEMBERS`, `SISMEMBER`, `SREM`, `SCARD`                        |
| **Persistence** | `SAVE`, `BGSAVE`, `BGREWRITEAOF`                                         |

---

## Command argument cheatsheet

| Command         | Syntax                                      | Example                              |
| --------------- | ------------------------------------------- | ------------------------------------ |
| `PING`          | `PING [message]`                            | `PING hello`                         |
| `ECHO`          | `ECHO <message>`                            | `ECHO "hi"`                          |
| `SET`           | `SET <key> <value>`                         | `SET name "Zayn"`                    |
| `GET`           | `GET <key>`                                 | `GET name`                           |
| `DEL`           | `DEL <key> [key ...]`                       | `DEL k1 k2 k3`                       |
| `EXISTS`        | `EXISTS <key> [key ...]`                    | `EXISTS k1 k2`                       |
| `TYPE`          | `TYPE <key>`                                | `TYPE mylist`                        |
| `EXPIRE`        | `EXPIRE <key> <seconds>`                    | `EXPIRE token 60`                    |
| `PEXPIREAT`     | `PEXPIREAT <key> <timestamp_ms>`            | `PEXPIREAT token 9999999999000`      |
| `TTL`           | `TTL <key>`                                 | `TTL token`                          |
| `PERSIST`       | `PERSIST <key>`                             | `PERSIST token`                      |
| `LPUSH`         | `LPUSH <key> <val> [val ...]`               | `LPUSH tasks "build"`                |
| `RPUSH`         | `RPUSH <key> <val> [val ...]`               | `RPUSH tasks "deploy"`               |
| `LPOP`          | `LPOP <key>`                                | `LPOP tasks`                         |
| `RPOP`          | `RPOP <key>`                                | `RPOP tasks`                         |
| `LRANGE`        | `LRANGE <key> <start> <stop>`               | `LRANGE tasks 0 -1`                  |
| `HSET`          | `HSET <key> <field> <val> [field val ...]`  | `HSET user:1 name "Zayn"`            |
| `HGET`          | `HGET <key> <field>`                        | `HGET user:1 name`                   |
| `HGETALL`       | `HGETALL <key>`                             | `HGETALL user:1`                     |
| `HDEL`          | `HDEL <key> <field> [field ...]`            | `HDEL user:1 email`                  |
| `HEXISTS`       | `HEXISTS <key> <field>`                     | `HEXISTS user:1 name`                |
| `SADD`          | `SADD <key> <member> [member ...]`          | `SADD tags "db" "cache"`             |
| `SMEMBERS`      | `SMEMBERS <key>`                            | `SMEMBERS tags`                      |
| `SISMEMBER`     | `SISMEMBER <key> <member>`                  | `SISMEMBER tags "db"`                |
| `SREM`          | `SREM <key> <member> [member ...]`          | `SREM tags "cache"`                  |
| `SCARD`         | `SCARD <key>`                               | `SCARD tags`                         |
| `SAVE`          | `SAVE`                                      | `SAVE`                               |
| `BGSAVE`        | `BGSAVE`                                    | `BGSAVE`                             |
| `BGREWRITEAOF`  | `BGREWRITEAOF`                              | `BGREWRITEAOF`                       |

---

## One important thing to know

Data **does persist across restarts** — the server writes every mutating command to `data/appendonly.aof` and replays it at startup. However:

- Restarting **and deleting `data/appendonly.aof`** starts fresh.
- There is no `KEYS *` command — you need to know your key names.
- `BGSAVE` is currently synchronous (same as `SAVE`) — true non-blocking snapshotting via worker threads is a future improvement.
