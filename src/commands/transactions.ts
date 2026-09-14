import { ClientContext } from './types';
import { errorReply, rawArray, simpleString } from '../resp/serializer';

export function multiCommand(args: string[], context?: ClientContext): string {
    if (args.length !== 0) {
        return errorReply("wrong number of arguments for 'multi' command");
    }
    if (!context) {
        return errorReply('MULTI requires an active client connection');
    }
    if (context.inMulti) {
        return errorReply('MULTI calls can not be nested');
    }

    context.inMulti = true;
    context.multiQueue = [];
    return simpleString('OK');
}

export function discardCommand(args: string[], context?: ClientContext): string {
    if (args.length !== 0) {
        return errorReply("wrong number of arguments for 'discard' command");
    }
    if (!context || !context.inMulti) {
        return errorReply('DISCARD without MULTI');
    }

    context.inMulti = false;
    context.multiQueue = [];
    return simpleString('OK');
}

export function execCommand(
    args: string[],
    context?: ClientContext,
    dispatcher?: (command: string[], ctx?: ClientContext) => string
): string {
    if (args.length !== 0) {
        return errorReply("wrong number of arguments for 'exec' command");
    }
    if (!context || !context.inMulti) {
        return errorReply('EXEC without MULTI');
    }

    const queued = [...context.multiQueue];
    context.inMulti = false;
    context.multiQueue = [];

    if (!dispatcher) {
        return rawArray([]);
    }

    const replies: string[] = [];
    for (const cmd of queued) {
        replies.push(dispatcher(cmd, context));
    }

    return rawArray(replies);
}
