/**
 * WsDownlink — dual downlink streams (/api/events.mux + /api/events.host)
 * merged into one AsyncIterable<Frame>. Invariant #3: client NEVER sends;
 * no send path is exposed. Reconnect is owned by ConnectionLoop, not here.
 */

import { decodeFrame, type DownlinkFrame } from "./codec.js";

/** Minimal WebSocket surface (global WebSocket in Node ≥22 / browsers / RN). */
export interface WsLike {
  onopen: (() => void) | null;
  onmessage: ((ev: { data: unknown }) => void) | null;
  onerror: (() => void) | null;
  onclose: (() => void) | null;
  readyState: number;
  close(): void;
}

export type WsCtor = new (url: string) => WsLike;


function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

/**
 * Real DSH wraps every downlink frame in a `server-request` envelope whose
 * `payload` slot is the actual frame. Legacy mock-harness fixtures send the
 * frame directly. Unwrap the real shape without breaking the legacy one.
 */
function unwrapServerRequest(data: unknown): unknown {
  if (isRecord(data) && data.type === "server-request" && isRecord(data.payload)) {
    const frame = data.payload;
    // Real DSH routes approval/question responses by the server-request rpcId;
    // the inner frame does not carry it, so attach the envelope id when absent.
    if (typeof data.rpcId === "string" && typeof frame.rpcId !== "string") {
      return { ...frame, rpcId: data.rpcId };
    }
    return frame;
  }
  return data;
}

export class WsDownlink {
  readonly events: AsyncIterable<DownlinkFrame>;
  /** Resolves when both streams are open; rejects if either closes pre-open. */
  readonly ready: Promise<void>;

  private readonly sockets: WsLike[] = [];
  private readonly queue = new FrameQueue();
  private intentionallyClosed = false;
  private resolveReady!: () => void;
  private rejectReady!: (err: Error) => void;

  constructor(muxUrl: string, hostUrl: string, wsImpl?: WsCtor) {
    this.ready = new Promise<void>((resolve, reject) => {
      this.resolveReady = resolve;
      this.rejectReady = reject;
    });
    this.events = this.queue;

    const ctor = wsImpl ?? (globalThis as { WebSocket?: WsCtor }).WebSocket;
    if (!ctor) throw new Error("WsDownlink: no WebSocket implementation available");

    let remaining = 2;
    const onOpen = () => {
      remaining -= 1;
      if (remaining === 0) this.resolveReady();
    };
    const onClosedEarly = () => {
      // Intentional close() must not surface as a handshake failure.
      if (this.intentionallyClosed) return;
      if (remaining > 0) this.rejectReady(new Error("ws closed before both streams opened"));
    };

    this.openStream(muxUrl, ctor, onOpen, onClosedEarly);
    this.openStream(hostUrl, ctor, onOpen, onClosedEarly);
  }

  private openStream(
    url: string,
    ctor: WsCtor,
    onOpen: () => void,
    onClosedEarly: () => void,
  ): void {
    const ws = new ctor(url);
    ws.onmessage = (ev) => {
      const data = ev.data;
      if (typeof data === "string") {
        this.queue.push(decodeFrame(unwrapServerRequest(parseJson(data))));
      } else if (typeof Blob !== "undefined" && data instanceof Blob) {
        void data.text().then((t) => this.queue.push(decodeFrame(unwrapServerRequest(parseJson(t)))));
      } else {
        this.queue.push(decodeFrame(unwrapServerRequest(data)));
      }
    };
    ws.onopen = onOpen;
    ws.onclose = () => {
      onClosedEarly();
      this.queue.end();
    };
    ws.onerror = () => {
      /* surfaced via onclose / stream end */
    };
    this.sockets.push(ws);
  }

  close(): void {
    this.intentionallyClosed = true;
    for (const s of this.sockets) s.close();
  }
}

/** Parse a JSON string; on failure return the raw string (lenient). */
function parseJson(s: string): unknown {
  try {
    return JSON.parse(s);
  } catch {
    return s;
  }
}

/** Async queue fed by ws onmessage; consumed via async iteration. */
export class FrameQueue implements AsyncIterable<DownlinkFrame> {
  private items: DownlinkFrame[] = [];
  private waiters: Array<(v: IteratorResult<DownlinkFrame>) => void> = [];
  private ended = false;

  push(f: DownlinkFrame): void {
    const w = this.waiters.shift();
    if (w) {
      w({ value: f, done: false });
    } else {
      this.items.push(f);
    }
  }

  end(): void {
    this.ended = true;
    for (const w of this.waiters.splice(0)) {
      w({ value: undefined, done: true });
    }
  }

  [Symbol.asyncIterator](): AsyncIterator<DownlinkFrame> {
    return {
      next: (): Promise<IteratorResult<DownlinkFrame>> => {
        const item = this.items.shift();
        if (item !== undefined) return Promise.resolve({ value: item, done: false });
        if (this.ended) return Promise.resolve({ value: undefined, done: true });
        return new Promise((resolve) => this.waiters.push(resolve));
      },
    };
  }
}
