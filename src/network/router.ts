import { type MessageEnvelope, MessageType } from "./protocol.js";
import type { Peer } from "./peer.js";

export type MessageHandler = (msg: MessageEnvelope, peer: Peer) => void | Promise<void>;

/**
 * Routes incoming messages to registered handlers by message type.
 */
export class MessageRouter {
  private handlers = new Map<MessageType, MessageHandler[]>();

  on(type: MessageType, handler: MessageHandler): void {
    const list = this.handlers.get(type) ?? [];
    list.push(handler);
    this.handlers.set(type, list);
  }

  off(type: MessageType, handler: MessageHandler): void {
    const list = this.handlers.get(type);
    if (!list) return;
    const idx = list.indexOf(handler);
    if (idx >= 0) list.splice(idx, 1);
  }

  async dispatch(msg: MessageEnvelope, peer: Peer): Promise<void> {
    const handlers = this.handlers.get(msg.type);
    if (!handlers || handlers.length === 0) return;
    for (const handler of handlers) {
      await handler(msg, peer);
    }
  }
}
