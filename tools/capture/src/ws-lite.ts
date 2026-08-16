/**
 * Minimal WebSocket surface for capture (same shape as protocol's ws.ts).
 * Kept local so capture stays zero-dependency; protocol's WsDownlink is the
 * runtime consumer, capture only listens.
 */

export interface WsLike {
  onopen: (() => void) | null;
  onmessage: ((ev: { data: unknown }) => void) | null;
  onerror: (() => void) | null;
  onclose: (() => void) | null;
  readyState: number;
  close(): void;
}

export type WsCtor = new (url: string) => WsLike;
