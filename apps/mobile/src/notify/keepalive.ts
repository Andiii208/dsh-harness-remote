/**
 * 后台保活（M1-T2）— 决策逻辑（纯函数）+ expo-background-task 薄封装。
 * 边界：OS 可能挂起 App；后台任务仅「定期唤醒检查连接状态，离线超阈值则
 * 触发一次重连」。厂商省电策略会限制频率——尽力而为，文档注明。
 */

import type { ConnectionState } from "@dsh-remote/protocol";

export const DEFAULT_OFFLINE_THRESHOLD_MS = 5 * 60_000;

/**
 * 是否需要触发重连：处于 offline/backoff 且超过阈值。
 * 纯函数，便于单测。
 */
export function shouldReconnect(
  state: ConnectionState,
  lastPingAt: number,
  now: number,
  thresholdMs: number = DEFAULT_OFFLINE_THRESHOLD_MS,
): boolean {
  if (state !== "offline" && state !== "backoff") return false;
  return now - lastPingAt >= thresholdMs;
}

/** expo-background-task + expo-task-manager 最小表面（注入用）。 */
export interface BackgroundTaskApi {
  defineTask(taskName: string, task: () => Promise<unknown> | unknown): void;
  registerTaskAsync(taskName: string, options: unknown): Promise<void>;
  unregisterTaskAsync(taskName: string): Promise<void>;
}

export const KEEPALIVE_TASK = "dsh-keepalive";

export class KeepaliveScheduler {
  private registered = false;

  constructor(
    private readonly api: BackgroundTaskApi,
    private readonly getState: () => ConnectionState,
    private readonly onReconnect: () => Promise<void> | void,
    private readonly now: () => number = Date.now,
    private readonly thresholdMs: number = DEFAULT_OFFLINE_THRESHOLD_MS,
  ) {}

  private lastPingAt = -1;

  /** 注册后台任务（幂等）。OS 在注册后自行调度执行。 */
  async register(minIntervalMs: number): Promise<void> {
    if (this.registered) return;
    this.registered = true;
    try {
      this.api.defineTask(KEEPALIVE_TASK, () => this.tick());
      await this.api.registerTaskAsync(KEEPALIVE_TASK, { minimumInterval: minIntervalMs });
    } catch (err) {
      console.warn("[keepalive] register failed", err);
      this.registered = false;
    }
  }

  /** 手动触发一次检查（测试/前台恢复时也可用）。 */
  async tick(): Promise<void> {
    const now = this.now();
    const ping = this.lastPingAt < 0 ? now : this.lastPingAt;
    if (shouldReconnect(this.getState(), ping, now, this.thresholdMs)) {
      this.lastPingAt = now;
      try {
        await this.onReconnect();
      } catch (err) {
        console.warn("[keepalive] reconnect failed", err);
      }
    }
  }

  /** 记录一次成功 ping（连接建立时调用，避免刚连上就被判定离线）。 */
  markPing(): void {
    this.lastPingAt = this.now();
  }

  async unregister(): Promise<void> {
    if (!this.registered) return;
    this.registered = false;
    try {
      await this.api.unregisterTaskAsync(KEEPALIVE_TASK);
    } catch (err) {
      console.warn("[keepalive] unregister failed", err);
    }
  }
}
