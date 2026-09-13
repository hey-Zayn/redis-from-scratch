import { CommandHandler } from './types';
import { keyspace } from '../store/keyspace';
import { errorReply, integer, array } from '../resp/serializer';

export const saddCommand: CommandHandler = (args) => {
    const [key, ...members] = args;
    if (!key || members.length === 0) {
        return errorReply("wrong number of arguments for 'sadd' command");
    }
    const added = keyspace.sadd(key, ...members);
    return integer(added);
};

export const smembersCommand: CommandHandler = (args) => {
    const [key] = args;
    if (!key) {
        return errorReply("wrong number of arguments for 'smembers' command");
    }
    const members = keyspace.smembers(key);
    return array(members);
};

export const sismemberCommand: CommandHandler = (args) => {
    const [key, member] = args;
    if (!key || !member) {
        return errorReply("wrong number of arguments for 'sismember' command");
    }
    return integer(keyspace.sismember(key, member));
};

export const sremCommand: CommandHandler = (args) => {
    const [key, ...members] = args;
    if (!key || members.length === 0) {
        return errorReply("wrong number of arguments for 'srem' command");
    }
    const removed = keyspace.srem(key, ...members);
    return integer(removed);
};

export const scardCommand: CommandHandler = (args) => {
    const [key] = args;
    if (!key) {
        return errorReply("wrong number of arguments for 'scard' command");
    }
    return integer(keyspace.scard(key));
};
