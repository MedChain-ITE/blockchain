import type WebSocket from "ws";
import type { HexString } from "../types.js";
import {
  type MessageEnvelope,
  serializeMessage,
} from "./protocol.js";

export interface PeerState {
  nodeId: string;
  publicKey: HexString;
  orgId: string;
  address: string;
  chainHeight: number;
  status: "connecting" | "connected" | "disconnected";
  lastSeen: number;
  isInbound: boolean;
}

export class Peer {
  readonly nodeId: string;
  publicKey: HexString;
  orgId: string;
  address: string;
  chainHeight: number;
  status: "connecting" | "connected" | "disconnected";
  lastSeen: number;
  isInbound: boolean;

  private ws: WebSocket;

  constructor(ws: WebSocket, info: Partial<PeerState> & { nodeId: string; isInbound: boolean }) {
    this.ws = ws;
    this.nodeId = info.nodeId;
    this.publicKey = info.publicKey ?? "";
    this.orgId = info.orgId ?? "";
    this.address = info.address ?? "";
    this.chainHeight = info.chainHeight ?? 0;
    this.status = "connecting";
    this.lastSeen = Date.now();
    this.isInbound = info.isInbound;
  }

  send(msg: MessageEnvelope): void {
    if (this.ws.readyState === this.ws.OPEN) {
      this.ws.send(serializeMessage(msg));
    }
  }

  close(): void {
    this.status = "disconnected";
    if (this.ws.readyState === this.ws.OPEN || this.ws.readyState === this.ws.CONNECTING) {
      this.ws.close();
    }
  }

  getSocket(): WebSocket {
    return this.ws;
  }

  updateSeen(): void {
    this.lastSeen = Date.now();
  }

  toInfo(): PeerState {
    return {
      nodeId: this.nodeId,
      publicKey: this.publicKey,
      orgId: this.orgId,
      address: this.address,
      chainHeight: this.chainHeight,
      status: this.status,
      lastSeen: this.lastSeen,
      isInbound: this.isInbound,
    };
  }
}
