import { CommandHandler } from './types';
import { keyspace } from '../store/keyspace';
import { aofManager } from '../store/persistence';
import { simpleString, bulkString, errorReply, integer } from '../resp/serializer';

export const pingCommand: CommandHandler = (args) => {
    if (args.length > 0) {
        return bulkString(args[0]);
    }
    return simpleString('PONG');
};

export const echoCommand: CommandHandler = (args) => {
    if (args.length === 0) {
        return errorReply("wrong number of arguments for 'echo' command");
    }
    return bulkString(args[0] ?? '');
};

export const setCommand: CommandHandler = (args) => {
    const [key, value] = args;
    if (key === undefined || value === undefined) {
        return errorReply("wrong number of arguments for 'set' command");
    }
    keyspace.set(key, value);
    return simpleString('OK');
};

export const getCommand: CommandHandler = (args) => {
    const [key] = args;
    if (key === undefined) {
        return errorReply("wrong number of arguments for 'get' command");
    }
    return bulkString(keyspace.get(key));
};

export const delCommand: CommandHandler = (args) => {
    if (args.length === 0) {
        return errorReply("wrong number of arguments for 'del' command");
    }
    return integer(keyspace.del(...args));
};

export const existsCommand: CommandHandler = (args) => {
    if (args.length === 0) {
        return errorReply("wrong number of arguments for 'exists' command");
    }
    return integer(keyspace.exists(...args));
};

export const expireCommand: CommandHandler = (args) => {
    const [key, secondsStr] = args;
    const seconds = Number(secondsStr);
    if (key === undefined || secondsStr === undefined || isNaN(seconds)) {
        return errorReply("wrong number of arguments for 'expire' command");
    }
    return integer(keyspace.expire(key, seconds));
};

export const ttlCommand: CommandHandler = (args) => {
    const [key] = args;
    if (key === undefined) {
        return errorReply("wrong number of arguments for 'ttl' command");
    }
    return integer(keyspace.ttl(key));
};

export const persistCommand: CommandHandler = (args) => {
    const [key] = args;
    if (key === undefined) {
        return errorReply("wrong number of arguments for 'persist' command");
    }
    return integer(keyspace.persist(key));
};

export const typeCommand: CommandHandler = (args) => {
    const [key] = args;
    if (key === undefined) {
        return errorReply("wrong number of arguments for 'type' command");
    }
    return simpleString(keyspace.type(key));
};

export const pexpireatCommand: CommandHandler = (args) => {
    const [key, timestampMsStr] = args;
    const timestampMs = Number(timestampMsStr);
    if (key === undefined || timestampMsStr === undefined || isNaN(timestampMs)) {
        return errorReply("wrong number of arguments for 'pexpireat' command");
    }
    return integer(keyspace.pexpireat(key, timestampMs));
};

export const saveCommand: CommandHandler = () => {
    try {
        aofManager.saveSnapshot();
        return simpleString('OK');
    } catch {
        return errorReply('failed to save snapshot');
    }
};

export const bgsaveCommand: CommandHandler = () => {
    try {
        aofManager.saveSnapshot();
        // NOTE: this is currently synchronous, identical to SAVE.
        // True non-blocking snapshotting would require a worker_thread.
        return simpleString('Background saving started');
    } catch {
        return errorReply('failed to start background save');
    }
};

export const bgrewriteaofCommand: CommandHandler = () => {
    try {
        aofManager.rewrite(keyspace);
        return simpleString('Background append only file rewriting started');
    } catch {
        return errorReply('failed to rewrite AOF');
    }
};
