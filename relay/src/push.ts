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

export interface ExpoPushProviderOptions {
  /** Expo Push API endpoint (defaults to https://exp.host/--/api/v2/push/send). */
  endpoint?: string;
  /** Optional Expo access token (sent as Authorization: Bearer). */
  accessToken?: string;
  /** Injectable fetch for tests; defaults to global fetch. */
  fetchImpl?: typeof fetch;
  /** Timeout for the HTTP call (ms). Default 5000. */
  timeoutMs?: number;
}

/**
 * Real push provider for the Expo push token the mobile app registers
 * (expo-notifications). Replaces Noop/Mock in production when configured via
 * `relay --push expo` (or `createRelayServer({ push: createExpoPushProvider() })`).
 *
 * The wake notification is intentionally minimal: it only tells the phone to
 * reconnect; no DSH content is ever sent to the push service.
 */
export class ExpoPushProvider implements PushProvider {
  private readonly endpoint: string;
  private readonly accessToken?: string;
  private readonly fetchImpl: typeof fetch;
  private readonly timeoutMs: number;

  constructor(opts: ExpoPushProviderOptions = {}) {
    this.endpoint = opts.endpoint ?? "https://exp.host/--/api/v2/push/send";
    this.accessToken = opts.accessToken;
    this.timeoutMs = opts.timeoutMs ?? 5000;
    const impl = opts.fetchImpl ?? fetch;
    this.fetchImpl = impl.bind(globalThis) as typeof fetch;
  }

  async wake(clientId: string, pushToken?: string): Promise<PushResult> {
    if (!pushToken) return "skipped";
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), this.timeoutMs);
    try {
      const res = await this.fetchImpl(this.endpoint, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          ...(this.accessToken ? { authorization: `Bearer ${this.accessToken}` } : {}),
        },
        body: JSON.stringify({
          to: pushToken,
          title: "harness remote",
          body: "电脑端正在唤醒连接…",
          data: { kind: "relay-wake", clientId },
          sound: "default",
        }),
        signal: ctrl.signal,
      });
      if (!res.ok) return "failed";
      const body: unknown = await res.json().catch(() => null);
      const data = (typeof body === "object" && body !== null ? body : {}) as Record<string, unknown>;
      if (Array.isArray(data.data)) {
        const ticket = data.data[0] as Record<string, unknown> | undefined;
        const details = ticket && typeof ticket.details === "object" && ticket.details !== null
          ? (ticket.details as Record<string, unknown>)
          : undefined;
        if (ticket && (ticket.status === "error" || details?.error)) return "failed";
      }
      return "sent";
    } catch {
      return "failed";
    } finally {
      clearTimeout(timer);
    }
  }
}

/** Create an ExpoPushProvider from environment variables (EXPO_ACCESS_TOKEN optional). */
export function createExpoPushProviderFromEnv(
  opts: Omit<ExpoPushProviderOptions, "accessToken"> = {},
): ExpoPushProvider {
  const accessToken = process.env.EXPO_ACCESS_TOKEN || undefined;
  return new ExpoPushProvider({ ...opts, accessToken });
}
