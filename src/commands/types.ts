import net from 'net';

export interface ClientContext {
    id: number;
    socket?: net.Socket;
    subscriptions: Set<string>;
    inMulti: boolean;
    multiQueue: string[][];
}

export type CommandHandler = (args: string[], context?: ClientContext) => string;
