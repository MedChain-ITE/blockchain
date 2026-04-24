import { WebSocketServer, type WebSocket as WS } from "ws";
import type pino from "pino";
import { deserializeMessage } from "./protocol.js";
import { Peer } from "./peer.js";
import type { MessageRouter } from "./router.js";

export interface WsServerOptions {
  port: number;
  host: string;
  log: pino.Logger;
  router: MessageRouter;
  onPeerConnected: (peer: Peer) => void;
  onPeerDisconnected: (peer: Peer) => void;
}

/**
 * WebSocket server that accepts incoming peer connections.
 */
export class WsServer {
  private wss: WebSocketServer | null = null;
  private opts: WsServerOptions;

  constructor(opts: WsServerOptions) {
    this.opts = opts;
  }

  start(): Promise<void> {
    return new Promise((resolve, reject) => {
      this.wss = new WebSocketServer({
        port: this.opts.port,
        host: this.opts.host,
      });

      this.wss.on("listening", () => {
        this.opts.log.info({ port: this.opts.port }, "P2P server listening");
        resolve();
      });

      this.wss.on("error", (err) => {
        this.opts.log.error({ err }, "P2P server error");
        reject(err);
      });

      this.wss.on("connection", (ws: WS, req) => {
        const remoteAddr = req.socket.remoteAddress ?? "unknown";
        const tempId = `inbound-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;

        const peer = new Peer(ws, {
          nodeId: tempId,
          address: remoteAddr,
          isInbound: true,
        });

        this.setupPeerHandlers(peer);
        this.opts.onPeerConnected(peer);
      });
    });
  }

  stop(): void {
    if (this.wss) {
      this.wss.close();
      this.wss = null;
    }
  }

  private setupPeerHandlers(peer: Peer): void {
    const ws = peer.getSocket();

    ws.on("message", async (data: Buffer) => {
      try {
        const msg = deserializeMessage(data.toString());
        peer.updateSeen();
        await this.opts.router.dispatch(msg, peer);
      } catch (err) {
        this.opts.log.warn({ err, peer: peer.nodeId }, "Failed to handle message");
      }
    });

    ws.on("close", () => {
      peer.status = "disconnected";
      this.opts.onPeerDisconnected(peer);
    });

    ws.on("error", (err) => {
      this.opts.log.warn({ err, peer: peer.nodeId }, "Peer connection error");
      peer.status = "disconnected";
    });
  }
}
