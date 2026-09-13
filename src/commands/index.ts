import { CommandHandler } from './types';
import {
    pingCommand,
    echoCommand,
    setCommand,
    getCommand,
    delCommand,
    existsCommand,
    expireCommand,
    ttlCommand,
    persistCommand,
    typeCommand,
} from './strings';
import {
    lpushCommand,
    rpushCommand,
    lpopCommand,
    rpopCommand,
    lrangeCommand,
} from './lists';
import {
    hsetCommand,
    hgetCommand,
    hgetallCommand,
    hdelCommand,
    hexistsCommand,
} from './hashes';
import {
    saddCommand,
    smembersCommand,
    sismemberCommand,
    sremCommand,
    scardCommand,
} from './sets';
import { errorReply, wrongTypeReply } from '../resp/serializer';
import { WrongTypeError } from '../store/keyspace';

const registry: Record<string, CommandHandler> = {
    // System / Strings
    PING: pingCommand,
    ECHO: echoCommand,
    SET: setCommand,
    GET: getCommand,
    DEL: delCommand,
    EXISTS: existsCommand,
    EXPIRE: expireCommand,
    TTL: ttlCommand,
    PERSIST: persistCommand,
    TYPE: typeCommand,

    // Lists
    LPUSH: lpushCommand,
    RPUSH: rpushCommand,
    LPOP: lpopCommand,
    RPOP: rpopCommand,
    LRANGE: lrangeCommand,

    // Hashes
    HSET: hsetCommand,
    HGET: hgetCommand,
    HGETALL: hgetallCommand,
    HDEL: hdelCommand,
    HEXISTS: hexistsCommand,

    // Sets
    SADD: saddCommand,
    SMEMBERS: smembersCommand,
    SISMEMBER: sismemberCommand,
    SREM: sremCommand,
    SCARD: scardCommand,
};

export function dispatchCommand(command: string[]): string {
    const cmd = command[0]?.toUpperCase();
    if (!cmd) {
        return errorReply('empty command');
    }

    const handler = registry[cmd];
    if (!handler) {
        return errorReply(`unknown command '${cmd}'`);
    }

    try {
        const args = command.slice(1);
        return handler(args);
    } catch (e) {
        if (e instanceof WrongTypeError) {
            return wrongTypeReply();
        }
        console.error('Command handling error:', e);
        return errorReply('internal error');
    }
}
