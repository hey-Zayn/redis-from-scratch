import { CommandHandler } from './types';
import { keyspace } from '../store/keyspace';
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
