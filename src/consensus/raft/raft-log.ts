import type { RaftLogEntry } from "../../network/protocol.js";

/**
 * In-memory Raft log. Entries are block proposals.
 * Each committed entry becomes a finalized block.
 */
export class RaftLog {
  private entries: RaftLogEntry[] = [];

  /** Append an entry to the log. */
  append(entry: RaftLogEntry): void {
    this.entries.push(entry);
  }

  /** Get entry at a specific index (1-based). */
  getEntry(index: number): RaftLogEntry | undefined {
    return this.entries.find((e) => e.index === index);
  }

  /** Get the last log index. */
  getLastIndex(): number {
    return this.entries.length > 0 ? this.entries[this.entries.length - 1]!.index : 0;
  }

  /** Get the last log term. */
  getLastTerm(): number {
    return this.entries.length > 0 ? this.entries[this.entries.length - 1]!.term : 0;
  }

  /** Get entries from startIndex (inclusive). */
  getEntriesFrom(startIndex: number): RaftLogEntry[] {
    return this.entries.filter((e) => e.index >= startIndex);
  }

  /** Get the term at a given index. Returns 0 if index not found. */
  getTermAt(index: number): number {
    if (index === 0) return 0;
    const entry = this.entries.find((e) => e.index === index);
    return entry?.term ?? 0;
  }

  /** Truncate log from index (inclusive) onwards. Used when log conflicts detected. */
  truncateFrom(index: number): void {
    this.entries = this.entries.filter((e) => e.index < index);
  }

  /** Get number of entries. */
  length(): number {
    return this.entries.length;
  }
}
