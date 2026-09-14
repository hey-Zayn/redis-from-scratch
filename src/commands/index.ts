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
    pexpireatCommand,
    saveCommand,
    bgsaveCommand,
    bgrewriteaofCommand,
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
import { aofManager } from '../store/persistence';

const registry: Record<string, CommandHandler> = {
    // System / Strings / Persistence
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
    PEXPIREAT: pexpireatCommand,
    SAVE: saveCommand,
    BGSAVE: bgsaveCommand,
    BGREWRITEAOF: bgrewriteaofCommand,

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
        const reply = handler(args);
        if (!reply.startsWith('-ERR') && !reply.startsWith('-WRONGTYPE')) {
            aofManager.appendCommand(command);
        }
        return reply;
    } catch (e) {
        if (e instanceof WrongTypeError) {
            return wrongTypeReply();
        }
        console.error('Command handling error:', e);
        return errorReply('internal error');
    }
}
