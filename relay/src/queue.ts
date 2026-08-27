/**
 * Offline queue for undelivered relay.route envelopes (M3.3).
 *
 * Pure TS. Envelopes are queued per target peer and delivered in FIFO order
 * the next time that peer authenticates. TTL is based on the envelope `ts`.
 */

import type { RelayEnvelope } from "@dsh-remote/protocol";

export interface OfflineQueueOptions {
  /** Envelope TTL in ms. Defaults to 24 hours (audit A11: was 2 minutes —
   *  a phone offline for one coffee break permanently lost approvals). */
  ttlMs?: number;
  /** Max queued envelopes per peer. Defaults to 500; when full the oldest envelope is dropped. */
  maxPerPeer?: number;
  now?: () => number;
}

export interface OfflineQueue {
  enqueue(to: string, env: RelayEnvelope): { queued: boolean; dropped: boolean };
  /** Remove and return all live envelopes queued for `to` (oldest first). */
  drain(to: string): RelayEnvelope[];
  /** Delete every expired envelope across all peers; returns the deleted count. */
  expire(): number;
}

export function createOfflineQueue(opts: OfflineQueueOptions = {}): OfflineQueue {
  const ttlMs = opts.ttlMs ?? 24 * 60 * 60 * 1000;
  const maxPerPeer = opts.maxPerPeer ?? 500;
  const now = opts.now ?? Date.now;
  const queues = new Map<string, RelayEnvelope[]>();

  function isLive(env: RelayEnvelope): boolean {
    return env.ts + ttlMs > now();
  }

  return {
    enqueue(to, env) {
      if (!isLive(env)) return { queued: false, dropped: true };

      let q = queues.get(to);
      if (!q) {
        q = [];
        queues.set(to, q);
      }
      if (q.length >= maxPerPeer) {
        // Full: drop the oldest envelope (head) to make room for the newest.
        q.shift();
      }
      q.push(env);
      return { queued: true, dropped: false };
    },

    drain(to) {
      const q = queues.get(to);
      if (!q) return [];
      queues.delete(to);
      return q.filter(isLive);
    },

    expire() {
      let removed = 0;
      for (const [to, q] of queues) {
        const live = q.filter(isLive);
        const dropped = q.length - live.length;
        if (dropped > 0) {
          removed += dropped;
          if (live.length === 0) {
            queues.delete(to);
          } else {
            queues.set(to, live);
          }
        }
      }
      return removed;
    },
  };
}
