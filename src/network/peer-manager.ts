import type pino from "pino";
import { EventEmitter } from "node:events";
import { Peer, type PeerState } from "./peer.js";
import { WsServer } from "./ws-server.js";
import { WsClient } from "./ws-client.js";
import { MessageRouter } from "./router.js";
import {
  type MessageEnvelope,
  MessageType,
  createMessage,
  type HandshakePayload,
  type HandshakeAckPayload,
  type PingPayload,
  type PongPayload,
  type PeerListPayload,
} from "./protocol.js";
import type { HexString } from "../types.js";

export interface PeerManagerOptions {
  nodeId: string;
  publicKey: HexString;
  orgId: string;
  p2pPort: number;
  listenAddress: string;
  log: pino.Logger;
  getChainHeight: () => number;
}

// Events: peer:connected, peer:disconnected, peer:handshake, message:<MessageType>
export class PeerManager extends EventEmitter {
  readonly router: MessageRouter;
  private server: WsServer;
  private client: WsClient;
  private peers = new Map<string, Peer>(); // nodeId -> Peer
  private opts: PeerManagerOptions;
  private healthTimer: ReturnType<typeof setInterval> | null = null;

  constructor(opts: PeerManagerOptions) {
    super();
    this.opts = opts;
    this.router = new MessageRouter();

    // Wire up built-in message handlers
    this.router.on(MessageType.Handshake, this.handleHandshake.bind(this));
    this.router.on(MessageType.HandshakeAck, this.handleHandshakeAck.bind(this));
    this.router.on(MessageType.Ping, this.handlePing.bind(this));
    this.router.on(MessageType.Pong, this.handlePong.bind(this));
    this.router.on(MessageType.PeerList, this.handlePeerList.bind(this));

    // Create server and client
    this.server = new WsServer({
      port: opts.p2pPort,
      host: opts.listenAddress,
      log: opts.log,
      router: this.router,
      onPeerConnected: (peer) => this.onRawPeerConnected(peer),
      onPeerDisconnected: (peer) => this.onRawPeerDisconnected(peer),
    });

    this.client = new WsClient({
      log: opts.log,
      router: this.router,
      onPeerConnected: (peer) => {
        this.onRawPeerConnected(peer);
        // Outbound connections send handshake first
        this.sendHandshake(peer);
      },
      onPeerDisconnected: (peer) => this.onRawPeerDisconnected(peer),
    });
  }

  async start(): Promise<void> {
    await this.server.start();

    // Periodic health check / ping
    this.healthTimer = setInterval(() => {
      this.pingAll();
    }, 5000);
  }

  stop(): void {
    if (this.healthTimer) {
      clearInterval(this.healthTimer);
      this.healthTimer = null;
    }
    this.client.stop();
    this.server.stop();
    for (const peer of this.peers.values()) {
      peer.close();
    }
    this.peers.clear();
  }

  /** Connect to a peer by address (ws://host:port). */
  connectTo(address: string): void {
    this.client.connect(address);
  }

  /** Broadcast a message to all connected peers. */
  broadcast(msg: MessageEnvelope): void {
    for (const peer of this.peers.values()) {
      if (peer.status === "connected") {
        peer.send(msg);
      }
    }
  }

  /** Send a message to a specific peer by nodeId. */
  sendTo(nodeId: string, msg: MessageEnvelope): void {
    const peer = this.peers.get(nodeId);
    if (peer && peer.status === "connected") {
      peer.send(msg);
    }
  }

  /** Send to leader or a specific peer. */
  sendToPeer(peer: Peer, msg: MessageEnvelope): void {
    peer.send(msg);
  }

  getPeer(nodeId: string): Peer | undefined {
    return this.peers.get(nodeId);
  }

  getConnectedPeers(): Peer[] {
    return Array.from(this.peers.values()).filter((p) => p.status === "connected");
  }

  getPeerStates(): PeerState[] {
    return Array.from(this.peers.values()).map((p) => p.toInfo());
  }

  getPeerCount(): number {
    return this.getConnectedPeers().length;
  }

  /** Get all known node IDs (for Raft voter list). */
  getKnownNodeIds(): string[] {
    return Array.from(this.peers.values())
      .filter((p) => p.status === "connected")
      .map((p) => p.nodeId);
  }

  // ── Internal handlers ──────────────────────────────────────────

  private onRawPeerConnected(peer: Peer): void {
    this.opts.log.debug({ peerId: peer.nodeId, address: peer.address }, "Raw peer connected");
  }

  private onRawPeerDisconnected(peer: Peer): void {
    const knownPeer = this.peers.get(peer.nodeId);
    if (knownPeer) {
      this.peers.delete(peer.nodeId);
      this.opts.log.info({ peerId: peer.nodeId }, "Peer disconnected");
      this.emit("peer:disconnected", peer.nodeId);
    }
  }

  private sendHandshake(peer: Peer): void {
    const payload: HandshakePayload = {
      nodeId: this.opts.nodeId,
      publicKey: this.opts.publicKey,
      orgId: this.opts.orgId,
      chainHeight: this.opts.getChainHeight(),
      listenPort: this.opts.p2pPort,
    };
    peer.send(createMessage(MessageType.Handshake, this.opts.nodeId, payload));
  }

  private handleHandshake(msg: MessageEnvelope, peer: Peer): void {
    const payload = msg.payload as HandshakePayload;

    // Reject self-connections
    if (payload.nodeId === this.opts.nodeId) {
      peer.close();
      return;
    }

    // Reject duplicate connections
    if (this.peers.has(payload.nodeId)) {
      peer.close();
      return;
    }

    // Update peer info from handshake
    peer.publicKey = payload.publicKey;
    peer.orgId = payload.orgId;
    peer.chainHeight = payload.chainHeight;

    // Build the peer's listen address from handshake info
    if (payload.listenPort) {
      const host = payload.listenAddress || peer.address.replace(/^ws:\/\//, "").split(":")[0] || "127.0.0.1";
      peer.address = `ws://${host}:${payload.listenPort}`;
    }

    // Replace temp nodeId with real one
    const realNodeId = payload.nodeId;
    (peer as any).nodeId = realNodeId;

    // Register peer
    peer.status = "connected";
    this.peers.set(realNodeId, peer);

    // Send ack
    const ack: HandshakeAckPayload = {
      nodeId: this.opts.nodeId,
      publicKey: this.opts.publicKey,
      orgId: this.opts.orgId,
      chainHeight: this.opts.getChainHeight(),
      accepted: true,
    };
    peer.send(createMessage(MessageType.HandshakeAck, this.opts.nodeId, ack));

    this.opts.log.info({ peerId: realNodeId, orgId: payload.orgId, height: payload.chainHeight }, "Peer handshake complete (inbound)");
    this.emit("peer:connected", realNodeId, peer);

    // Share peer list
    this.sharePeerList(peer);
  }

  private handleHandshakeAck(msg: MessageEnvelope, peer: Peer): void {
    const payload = msg.payload as HandshakeAckPayload;

    if (!payload.accepted) {
      this.opts.log.warn({ reason: payload.reason }, "Handshake rejected");
      peer.close();
      return;
    }

    // Update peer info
    peer.publicKey = payload.publicKey;
    peer.orgId = payload.orgId;
    peer.chainHeight = payload.chainHeight;

    const realNodeId = payload.nodeId;
    (peer as any).nodeId = realNodeId;

    peer.status = "connected";
    this.peers.set(realNodeId, peer);

    this.opts.log.info({ peerId: realNodeId, orgId: payload.orgId, height: payload.chainHeight }, "Peer handshake complete (outbound)");
    this.emit("peer:connected", realNodeId, peer);
  }

  private handlePing(msg: MessageEnvelope, peer: Peer): void {
    const payload = msg.payload as PingPayload;
    peer.chainHeight = payload.chainHeight;
    peer.send(createMessage(MessageType.Pong, this.opts.nodeId, {
      chainHeight: this.opts.getChainHeight(),
    } as PongPayload));
  }

  private handlePong(msg: MessageEnvelope, peer: Peer): void {
    const payload = msg.payload as PongPayload;
    peer.chainHeight = payload.chainHeight;
  }

  private handlePeerList(msg: MessageEnvelope, _peer: Peer): void {
    const payload = msg.payload as PeerListPayload;
    for (const p of payload.peers) {
      // Don't connect to ourselves or already-known peers
      if (p.nodeId === this.opts.nodeId) continue;
      if (this.peers.has(p.nodeId)) continue;
      if (p.address) {
        this.opts.log.debug({ address: p.address, nodeId: p.nodeId }, "Discovered peer from peer list");
        this.connectTo(p.address);
      }
    }
  }

  private sharePeerList(peer: Peer): void {
    const peerList: PeerListPayload = {
      peers: Array.from(this.peers.values())
        .filter((p) => p.nodeId !== peer.nodeId && p.status === "connected")
        .map((p) => ({
          nodeId: p.nodeId,
          publicKey: p.publicKey,
          address: p.address,
          orgId: p.orgId,
        })),
    };
    peer.send(createMessage(MessageType.PeerList, this.opts.nodeId, peerList));
  }

  private pingAll(): void {
    const payload: PingPayload = { chainHeight: this.opts.getChainHeight() };
    const msg = createMessage(MessageType.Ping, this.opts.nodeId, payload);
    this.broadcast(msg);
  }
}
