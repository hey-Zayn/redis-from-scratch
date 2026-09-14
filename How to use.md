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

Leave this terminal running.

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

SET greeting "Hello World"
→ OK

GET greeting
→ "Hello World"

EXISTS greeting
→ (integer) 1

DEL greeting
→ (integer) 1

GET greeting
→ (nil)
```

## Step 6: Try TTL / expiry

```
SET session_token "xyz987"
→ OK

EXPIRE session_token 10
→ (integer) 1

TTL session_token
→ (integer) 8

PERSIST session_token
→ (integer) 1

TTL session_token
→ (integer) -1
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
```

**Hashes:**

```
HSET user:100 username "zayn" role "admin"
→ (integer) 2

HGETALL user:100
→ 1) "username"  2) "zayn"  3) "role"  4) "admin"
```

**Sets:**

```
SADD tags "database" "cache" "database"
→ (integer) 2

SMEMBERS tags
→ 1) "database"  2) "cache"
```

## Step 8: See type-safety in action

```
SET mystring "simple"
→ OK

LPUSH mystring "item"
→ (error) WRONGTYPE Operation against a key holding the wrong kind of value
```

## Step 9: Run the test suite (optional)

In a separate terminal — the server keeps running independently:

```bash
pnpm test
```

Runs all `vitest` tests directly against the store and parser logic; no live server or `redis-cli` needed for this.

## Step 10: Explore or extend it

- **Add a new command** — write a handler function in the matching `src/commands/*.ts` file, then register it in `src/commands/index.ts`.
- **Change the port** — edit the `PORT` constant at the top of `src/server.ts`.
- **Inspect state** — there's no `KEYS *` command yet, so the only way to see what's stored is through commands you already know the key names for (`GET`, `HGETALL`, etc.).

---

## Quick reference: supported commands

| Category | Commands                                         |
| -------- | ------------------------------------------------ |
| System   | `PING`, `ECHO`, `TYPE`                           |
| Strings  | `SET`, `GET`, `DEL`, `EXISTS`                    |
| Expiry   | `EXPIRE`, `TTL`, `PERSIST`                       |
| Lists    | `LPUSH`, `RPUSH`, `LPOP`, `RPOP`, `LRANGE`       |
| Hashes   | `HSET`, `HGET`, `HGETALL`, `HDEL`, `HEXISTS`     |
| Sets     | `SADD`, `SMEMBERS`, `SISMEMBER`, `SREM`, `SCARD` |

---

## One important thing to know

Restarting the server (Ctrl+C, then `pnpm dev` again) wipes everything — there's no persistence yet. Anything you `SET`, `RPUSH`, `HSET`, or `SADD` disappears on restart. Persistence (AOF + RDB-style snapshotting) is the planned next phase.
