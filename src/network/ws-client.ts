import WebSocket from "ws";
import type pino from "pino";
import { deserializeMessage } from "./protocol.js";
import { Peer } from "./peer.js";
import type { MessageRouter } from "./router.js";

export interface WsClientOptions {
  log: pino.Logger;
  router: MessageRouter;
  onPeerConnected: (peer: Peer) => void;
  onPeerDisconnected: (peer: Peer) => void;
  reconnectIntervalMs?: number;
  maxReconnectMs?: number;
}

/**
 * WebSocket client that connects to a remote peer with auto-reconnect.
 */
export class WsClient {
  private opts: WsClientOptions;
  private peers = new Map<string, { peer: Peer; reconnectTimer: ReturnType<typeof setTimeout> | null; attempt: number }>();
  private stopped = false;

  constructor(opts: WsClientOptions) {
    this.opts = opts;
  }

  /** Connect to a peer address. Returns immediately; connection is async. */
  connect(address: string): void {
    if (this.peers.has(address)) return; // Already connecting/connected

    this.peers.set(address, { peer: null as unknown as Peer, reconnectTimer: null, attempt: 0 });
    this.doConnect(address);
  }

  disconnect(address: string): void {
    const entry = this.peers.get(address);
    if (!entry) return;
    if (entry.reconnectTimer) clearTimeout(entry.reconnectTimer);
    entry.peer?.close();
    this.peers.delete(address);
  }

  stop(): void {
    this.stopped = true;
    for (const [, entry] of this.peers) {
      if (entry.reconnectTimer) clearTimeout(entry.reconnectTimer);
      entry.peer?.close();
    }
    this.peers.clear();
  }

  private doConnect(address: string): void {
    if (this.stopped) return;
    const entry = this.peers.get(address);
    if (!entry) return;

    const ws = new WebSocket(address);
    const tempId = `outbound-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    const peer = new Peer(ws, {
      nodeId: tempId,
      address,
      isInbound: false,
    });
    entry.peer = peer;

    ws.on("open", () => {
      peer.status = "connected";
      entry.attempt = 0;
      this.opts.onPeerConnected(peer);
    });

    ws.on("message", async (data: Buffer) => {
      try {
        const msg = deserializeMessage(data.toString());
        peer.updateSeen();
        await this.opts.router.dispatch(msg, peer);
      } catch (err) {
        this.opts.log.warn({ err, peer: peer.nodeId }, "Failed to handle message from peer");
      }
    });

    ws.on("close", () => {
      peer.status = "disconnected";
      this.opts.onPeerDisconnected(peer);
      this.scheduleReconnect(address);
    });

    ws.on("error", (err) => {
      this.opts.log.debug({ err: err.message, address }, "Peer connection error");
      // 'close' event will fire after this, triggering reconnect
    });
  }

  private scheduleReconnect(address: string): void {
    if (this.stopped) return;
    const entry = this.peers.get(address);
    if (!entry) return;

    entry.attempt++;
    const baseMs = this.opts.reconnectIntervalMs ?? 1000;
    const maxMs = this.opts.maxReconnectMs ?? 30000;
    const delay = Math.min(baseMs * Math.pow(1.5, entry.attempt - 1), maxMs);
    const jitter = delay * 0.2 * Math.random();

    this.opts.log.debug({ address, delay: Math.round(delay + jitter) }, "Scheduling reconnect");

    entry.reconnectTimer = setTimeout(() => {
      entry.reconnectTimer = null;
      this.doConnect(address);
    }, delay + jitter);
  }
}
