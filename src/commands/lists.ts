import { CommandHandler } from './types';
import { keyspace } from '../store/keyspace';
import { bulkString, errorReply, integer, array } from '../resp/serializer';

export const lpushCommand: CommandHandler = (args) => {
    const [key, ...values] = args;
    if (!key || values.length === 0) {
        return errorReply("wrong number of arguments for 'lpush' command");
    }
    const len = keyspace.lpush(key, ...values);
    return integer(len);
};

export const rpushCommand: CommandHandler = (args) => {
    const [key, ...values] = args;
    if (!key || values.length === 0) {
        return errorReply("wrong number of arguments for 'rpush' command");
    }
    const len = keyspace.rpush(key, ...values);
    return integer(len);
};

export const lpopCommand: CommandHandler = (args) => {
    const [key] = args;
    if (!key) {
        return errorReply("wrong number of arguments for 'lpop' command");
    }
    const val = keyspace.lpop(key);
    return bulkString(val);
};

export const rpopCommand: CommandHandler = (args) => {
    const [key] = args;
    if (!key) {
        return errorReply("wrong number of arguments for 'rpop' command");
    }
    const val = keyspace.rpop(key);
    return bulkString(val);
};

export const lrangeCommand: CommandHandler = (args) => {
    const [key, startStr, stopStr] = args;
    const start = Number(startStr);
    const stop = Number(stopStr);

    if (!key || startStr === undefined || stopStr === undefined || isNaN(start) || isNaN(stop)) {
        return errorReply("wrong number of arguments for 'lrange' command");
    }

    const items = keyspace.lrange(key, start, stop);
    return array(items);
};
