import type pino from "pino";
import type { Block } from "../types.js";
import type { PeerManager } from "./peer-manager.js";
import type { Peer } from "./peer.js";
import {
  MessageType,
  createMessage,
  type SyncRequestPayload,
  type SyncResponsePayload,
  type MessageEnvelope,
} from "./protocol.js";

const SYNC_BATCH_SIZE = 50;

export interface SyncOptions {
  nodeId: string;
  log: pino.Logger;
  peerManager: PeerManager;
  getChainHeight: () => number;
  getBlocks: (from: number, to: number) => Block[];
  applyBlock: (block: Block) => void;
}

/**
 * Block sync protocol. Fetches missing blocks from peers to catch up.
 */
export class BlockSync {
  private opts: SyncOptions;
  private syncing = false;
  private pendingResolve: ((blocks: Block[]) => void) | null = null;

  constructor(opts: SyncOptions) {
    this.opts = opts;

    // Register handlers on the peer manager's router
    opts.peerManager.router.on(MessageType.SyncRequest, this.handleSyncRequest.bind(this));
    opts.peerManager.router.on(MessageType.SyncResponse, this.handleSyncResponse.bind(this));
  }

  /** Sync from peers if they have a higher chain. */
  async syncFromPeers(): Promise<void> {
    if (this.syncing) return;

    const peers = this.opts.peerManager.getConnectedPeers();
    if (peers.length === 0) return;

    // Find the peer with highest chain
    let bestPeer: Peer | null = null;
    let bestHeight = this.opts.getChainHeight();

    for (const peer of peers) {
      if (peer.chainHeight > bestHeight) {
        bestHeight = peer.chainHeight;
        bestPeer = peer;
      }
    }

    if (!bestPeer) return; // We're already at the highest

    this.syncing = true;
    this.opts.log.info(
      { peerId: bestPeer.nodeId, peerHeight: bestHeight, localHeight: this.opts.getChainHeight() },
      "Starting sync",
    );

    try {
      let currentHeight = this.opts.getChainHeight();

      while (currentHeight < bestHeight) {
        const from = currentHeight + 1;
        const to = Math.min(from + SYNC_BATCH_SIZE - 1, bestHeight);

        const blocks = await this.requestBlocks(bestPeer, from, to);
        if (blocks.length === 0) break;

        for (const block of blocks) {
          this.opts.applyBlock(block);
        }

        currentHeight = this.opts.getChainHeight();
        this.opts.log.debug({ height: currentHeight, target: bestHeight }, "Sync progress");
      }

      this.opts.log.info({ height: this.opts.getChainHeight() }, "Sync complete");
    } catch (err) {
      this.opts.log.error({ err }, "Sync failed");
    } finally {
      this.syncing = false;
    }
  }

  isSyncing(): boolean {
    return this.syncing;
  }

  /** Request blocks from a specific peer. Returns a promise that resolves when response arrives. */
  private requestBlocks(peer: Peer, fromHeight: number, toHeight: number): Promise<Block[]> {
    return new Promise((resolve) => {
      // Set up one-shot response handler
      this.pendingResolve = resolve;

      const payload: SyncRequestPayload = { fromHeight, toHeight };
      peer.send(createMessage(MessageType.SyncRequest, this.opts.nodeId, payload));

      // Timeout after 10 seconds
      setTimeout(() => {
        if (this.pendingResolve === resolve) {
          this.pendingResolve = null;
          resolve([]);
        }
      }, 10000);
    });
  }

  /** Handle incoming sync request: send requested blocks. */
  private handleSyncRequest(msg: MessageEnvelope, peer: Peer): void {
    const payload = msg.payload as SyncRequestPayload;
    const blocks = this.opts.getBlocks(payload.fromHeight, payload.toHeight);

    const response: SyncResponsePayload = {
      blocks,
      hasMore: payload.toHeight < this.opts.getChainHeight(),
    };

    peer.send(createMessage(MessageType.SyncResponse, this.opts.nodeId, response));
  }

  /** Handle incoming sync response: resolve pending request. */
  private handleSyncResponse(msg: MessageEnvelope, _peer: Peer): void {
    const payload = msg.payload as SyncResponsePayload;
    if (this.pendingResolve) {
      const resolve = this.pendingResolve;
      this.pendingResolve = null;
      resolve(payload.blocks);
    }
  }
}
