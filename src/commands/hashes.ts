import { CommandHandler } from './types';
import { keyspace } from '../store/keyspace';
import { bulkString, errorReply, integer, array } from '../resp/serializer';

export const hsetCommand: CommandHandler = (args) => {
    const [key, ...fieldValues] = args;
    if (!key || fieldValues.length === 0 || fieldValues.length % 2 !== 0) {
        return errorReply("wrong number of arguments for 'hset' command");
    }

    const pairs: [string, string][] = [];
    for (let i = 0; i < fieldValues.length; i += 2) {
        pairs.push([fieldValues[i], fieldValues[i + 1]]);
    }

    const added = keyspace.hset(key, pairs);
    return integer(added);
};

export const hgetCommand: CommandHandler = (args) => {
    const [key, field] = args;
    if (!key || !field) {
        return errorReply("wrong number of arguments for 'hget' command");
    }
    const val = keyspace.hget(key, field);
    return bulkString(val);
};

export const hgetallCommand: CommandHandler = (args) => {
    const [key] = args;
    if (!key) {
        return errorReply("wrong number of arguments for 'hgetall' command");
    }

    const entries = keyspace.hgetall(key);
    const flat: string[] = [];
    for (const [field, val] of entries) {
        flat.push(field, val);
    }
    return array(flat);
};

export const hdelCommand: CommandHandler = (args) => {
    const [key, ...fields] = args;
    if (!key || fields.length === 0) {
        return errorReply("wrong number of arguments for 'hdel' command");
    }
    const deleted = keyspace.hdel(key, ...fields);
    return integer(deleted);
};

export const hexistsCommand: CommandHandler = (args) => {
    const [key, field] = args;
    if (!key || !field) {
        return errorReply("wrong number of arguments for 'hexists' command");
    }
    return integer(keyspace.hexists(key, field));
};
