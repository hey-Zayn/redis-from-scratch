import { ClientContext } from './types';
import { errorReply, integer, pubsubEvent } from '../resp/serializer';
import { pubsubManager } from '../pubsub';

export function subscribeCommand(args: string[], context?: ClientContext): string {
    if (args.length < 1) {
        return errorReply("wrong number of arguments for 'subscribe' command");
    }
    if (!context) {
        return errorReply('SUBSCRIBE requires an active client connection');
    }

    let reply = '';
    for (const channel of args) {
        const count = pubsubManager.subscribe(context, channel);
        reply += pubsubEvent('subscribe', channel, count);
    }
    return reply;
}

export function unsubscribeCommand(args: string[], context?: ClientContext): string {
    if (!context) {
        return errorReply('UNSUBSCRIBE requires an active client connection');
    }

    let reply = '';
    if (args.length === 0) {
        const events = pubsubManager.unsubscribe(context);
        for (const ev of events) {
            reply += pubsubEvent('unsubscribe', ev.channel, ev.remaining);
        }
    } else {
        for (const channel of args) {
            const events = pubsubManager.unsubscribe(context, channel);
            for (const ev of events) {
                reply += pubsubEvent('unsubscribe', ev.channel, ev.remaining);
            }
        }
    }
    return reply;
}

export function publishCommand(args: string[]): string {
    if (args.length !== 2) {
        return errorReply("wrong number of arguments for 'publish' command");
    }
    const [channel, message] = args;
    const receivers = pubsubManager.publish(channel, message);
    return integer(receivers);
}
