/**
 * ConnectionLoop — lifecycle & resilience for a Transport connection.
 * Handshake = dual streams open + host.describe success (design §1.3).
 * Disconnect → exponential backoff 500ms×2ⁿ capped at 10s with jitter,
 * then resync (re-run host.describe). State machine exposed for UI.
 */

import type { DownlinkFrame } from "./codec.js";
import { FrameQueue } from "./ws.js";
import type {
  Auth,
  Connection,
  ConnectionState,
  Endpoint,
  Transport,
  TransportEvents,
} from "./transport.js";

export interface ConnectionLoopOptions extends TransportEvents {
  endpoint: Endpoint;
  auth?: Auth;
  transport: Transport;
  /** Base backoff delay in ms. */
  baseBackoffMs?: number;
  /** Backoff cap in ms. */
  maxBackoffMs?: number;
  /** Jitter ratio applied to each delay (0..1). */
  jitter?: number;
  /** Injectable sleep (fake timers in tests). */
  sleep?: (ms: number) => Promise<void>;
  /** Injectable delay source for jitter. */
  random?: () => number;
  onStateChange?: (state: ConnectionState) => void;
  /** Called after a successful reconnect (resync point). */
  onResync?: () => void;
  /** 连续连接失败达到该次数后放弃（不再退避重试）。缺省为无限重试。 */
  maxAttempts?: number;
  /** 达到 maxAttempts 放弃时回调（携带最后一次错误）。 */
  onGiveUp?: (lastError: unknown) => void;
}

const DEFAULT_BASE = 500;
const DEFAULT_MAX = 10_000;
const DEFAULT_JITTER = 0.25;

export class ConnectionLoop {
  private state: ConnectionState = "offline";
  private stopped = false;
  private running = false;
  private attempt = 0;
  private conn: Connection | null = null;
  private stopPromise: Promise<void> | null = null;
  private resolveStop: (() => void) | null = null;
  /** run() 已退出且 stop 已结算（后续 stop() 直接返回已 resolve 的 Promise）。 */
  private stoppedSettled = false;
  private readonly opts: Required<Pick<ConnectionLoopOptions, "baseBackoffMs" | "maxBackoffMs" | "jitter">> &
    ConnectionLoopOptions;

  /**
   * Stable downlink frame stream: stays open across reconnects (frames from
   * every connection are forwarded). Ends on stop().
   */
  events: AsyncIterable<DownlinkFrame>;

  private readonly out = new FrameQueue();
  private lastDescribe: unknown = null;
  private lastError: unknown = null;
  private failures = 0;

  constructor(opts: ConnectionLoopOptions) {
    this.opts = {
      baseBackoffMs: DEFAULT_BASE,
      maxBackoffMs: DEFAULT_MAX,
      jitter: DEFAULT_JITTER,
      ...opts,
    };
    this.events = this.out;
  }

  get connectionState(): ConnectionState {
    return this.state;
  }

  /** Live connection while online (null otherwise). */
  get connection(): Connection | null {
    return this.conn;
  }

  lastDescribeResult(): unknown {
    return this.lastDescribe;
  }

  /** 最近一次连接失败的错误（成功后清空；give-up 后保留供 UI 展示）。 */
  lastErrorResult(): unknown {
    return this.lastError;
  }

  /** Kick off the connection loop in the background. Idempotent: a second
   *  start() while the loop is running is a no-op. */
  start(): void {
    if (this.running) return;
    this.running = true;
    this.stopped = false;
    this.stoppedSettled = false; // 允许 stop() 再次等待新一轮 run 退出
    this.attempt = 0;
    this.failures = 0;
    void this.run();
  }

  /** 停止并等待 run() 真正退出（幂等；已结算后再调直接 resolve，杜绝二次调用死锁）。 */
  stop(): Promise<void> {
    if (this.stoppedSettled) return Promise.resolve();
    const wasRunning = this.running;
    this.stopped = true;
    this.running = false;
    this.conn?.close();
    this.conn = null;
    this.out.end();
    this.setState("offline");
    if (!this.stopPromise) {
      this.stopPromise = new Promise<void>((resolve) => {
        this.resolveStop = resolve;
      });
    }
    const promise = this.stopPromise;
    // run() 已退出（give-up / 从未启动）时，无需等待，直接结算。
    if (!wasRunning) this.settleStop();
    return promise;
  }

  private settleStop(): void {
    this.stoppedSettled = true;
    const resolve = this.resolveStop;
    this.resolveStop = null;
    this.stopPromise = null;
    resolve?.();
  }

  private setState(s: ConnectionState): void {
    if (this.state !== s) {
      this.state = s;
      this.opts.onStateChange?.(s);
    }
  }

  private async run(): Promise<void> {
    while (!this.stopped) {
      this.setState("connecting");
      try {
        const conn = await this.opts.transport.connect(this.opts.endpoint, this.opts.auth ?? {});
        if (this.stopped) {
          conn.close();
          this.settleStop();
          return;
        }
        this.conn = conn;
        this.attempt = 0;
        this.failures = 0;
        this.lastError = null;
        this.setState("online");
        // Sync point after every successful (re)connect: re-run host.describe
        // and let the caller re-pull session state.
        this.opts.onResync?.();

        // Forward frames into the stable out stream; ends when the socket
        // stream ends (disconnect).
        for await (const f of conn.events) {
          this.out.push(f);
        }
        conn.close(); // release resources
        this.setState("offline");
        this.conn = null;
      } catch (err) {
        this.lastError = err;
        this.failures += 1;
        this.opts.onError?.(err);
        this.setState("offline");
      }

      if (this.stopped) {
        this.running = false;
        this.settleStop();
        return;
      }

      // 达到放弃阈值：停在 offline，不再退避重试（UI 可调用 start() 重新开始）。
      if (this.opts.maxAttempts !== undefined && this.failures >= this.opts.maxAttempts) {
        this.setState("offline");
        this.opts.onGiveUp?.(this.lastError);
        this.running = false;
        return;
      }

      const delay = this.backoffDelay();
      this.setState("backoff");
      const sleep = this.opts.sleep ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)));
      await sleep(delay);
    }
    this.running = false;
    this.settleStop();
  }

  /** 500ms × 2ⁿ, capped at maxBackoffMs, with jitter. */
  private backoffDelay(): number {
    const base = this.opts.baseBackoffMs;
    const cap = this.opts.maxBackoffMs;
    const raw = Math.min(base * 2 ** this.attempt, cap);
    this.attempt += 1;
    const jitter = (this.opts.random ?? Math.random)();
    return Math.round(raw * (1 + this.opts.jitter * (jitter - 0.5)));
  }
}
