/**
 * Push-provider injection point (M3.3).
 *
 * The relay itself never talks to APNs/FCM; it only calls a `PushProvider`
 * so the host can inject a real pusher in production and a mock in tests.
 */

export type PushResult = "sent" | "failed" | "skipped";

export interface PushProvider {
  wake(clientId: string, pushToken?: string): Promise<PushResult>;
}

export interface MockPushProviderOptions {
  /** When true, the next wake() returns "failed" exactly once. */
  failNext?: boolean;
  /** Consumed in order; falls back to "sent" once exhausted. */
  results?: PushResult[];
}

export class MockPushProvider implements PushProvider {
  readonly calls: Array<{ clientId: string; pushToken?: string }> = [];
  private failNext: boolean;
  private results: PushResult[];

  constructor(opts: MockPushProviderOptions = {}) {
    this.failNext = opts.failNext ?? false;
    this.results = [...(opts.results ?? [])];
  }

  async wake(clientId: string, pushToken?: string): Promise<PushResult> {
    this.calls.push({ clientId, ...(pushToken !== undefined ? { pushToken } : {}) });
    if (this.failNext) {
      this.failNext = false;
      return "failed";
    }
    return this.results.shift() ?? "sent";
  }
}

export class NoopPushProvider implements PushProvider {
  async wake(_clientId: string, _pushToken?: string): Promise<PushResult> {
    return "skipped";
  }
}
