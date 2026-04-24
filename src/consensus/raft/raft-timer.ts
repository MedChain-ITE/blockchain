/**
 * Raft timer with randomized election timeout and heartbeat.
 */
export class RaftTimer {
  private electionTimer: ReturnType<typeof setTimeout> | null = null;
  private heartbeatTimer: ReturnType<typeof setInterval> | null = null;

  private electionTimeoutMinMs: number;
  private electionTimeoutMaxMs: number;
  private heartbeatIntervalMs: number;

  private onElectionTimeout: () => void;
  private onHeartbeat: () => void;

  constructor(opts: {
    electionTimeoutMinMs?: number;
    electionTimeoutMaxMs?: number;
    heartbeatIntervalMs?: number;
    onElectionTimeout: () => void;
    onHeartbeat: () => void;
  }) {
    this.electionTimeoutMinMs = opts.electionTimeoutMinMs ?? 1500;
    this.electionTimeoutMaxMs = opts.electionTimeoutMaxMs ?? 3000;
    this.heartbeatIntervalMs = opts.heartbeatIntervalMs ?? 500;
    this.onElectionTimeout = opts.onElectionTimeout;
    this.onHeartbeat = opts.onHeartbeat;
  }

  /** Reset the election timeout (called on heartbeat received or vote granted). */
  resetElectionTimer(): void {
    this.stopElectionTimer();
    const timeout = this.randomElectionTimeout();
    this.electionTimer = setTimeout(() => {
      this.onElectionTimeout();
    }, timeout);
  }

  stopElectionTimer(): void {
    if (this.electionTimer) {
      clearTimeout(this.electionTimer);
      this.electionTimer = null;
    }
  }

  /** Start the heartbeat timer (called when becoming leader). */
  startHeartbeatTimer(): void {
    this.stopHeartbeatTimer();
    this.heartbeatTimer = setInterval(() => {
      this.onHeartbeat();
    }, this.heartbeatIntervalMs);
  }

  stopHeartbeatTimer(): void {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
  }

  stopAll(): void {
    this.stopElectionTimer();
    this.stopHeartbeatTimer();
  }

  private randomElectionTimeout(): number {
    return (
      this.electionTimeoutMinMs +
      Math.random() * (this.electionTimeoutMaxMs - this.electionTimeoutMinMs)
    );
  }
}
