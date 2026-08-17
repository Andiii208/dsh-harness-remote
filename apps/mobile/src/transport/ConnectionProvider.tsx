/**
 * ConnectionProvider — 装配 LanTransport + ConnectionPipeline，向 UI 暴露
 * 连接状态、会话数据与操作。装配逻辑在 pipeline.ts（可单测）。
 */

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import {
  LanTransport,
  RelayTransport,
  type ConnectionState,
} from "@dsh-remote/protocol";
import {
  createConnectionPipeline,
  type ConnectionPipeline,
} from "./pipeline";
import { isRelayUrl, toRelayWsUrl } from "./relayMode";
import { requestInterrupt } from "./interrupt";
import { getExpoPushToken } from "../notify/pushToken";
import { notificationService } from "../notify/expoAdapter";
import { notificationPrefsStore } from "../notify/notificationPrefsStoreAdapter";
import { hostStore } from "../discovery/hostStoreAdapter";
import { autoReconnectStore } from "../discovery/autoReconnectStoreAdapter";
import { tokenStore } from "../data/secureStoreAdapter";
import { approvalHistoryStore } from "../data/approvalHistoryStoreAdapter";
import { KeepaliveScheduler } from "../notify/keepalive";
import { backgroundTaskApi, KEEPALIVE_TASK } from "../notify/keepaliveAdapter";
import { GoalsClient, type GoalsApi } from "../data/goals";
import type { PendingRequest, SessionSummary, TranscriptMessage } from "../data/SessionStore";
import type { NotificationEvent } from "../notify/classifier";

// M3.1 relay deviceId：Web 端落在 localStorage，原生端暂为模块变量；
// M3.4 前迁移到 SecureStore/Keychain。
let relayDeviceId = "";

function getRelayDeviceId(): string {
  const storage = (globalThis as { localStorage?: { getItem(k: string): string | null; setItem(k: string, v: string): void } }).localStorage;
  if (!relayDeviceId) {
    try {
      relayDeviceId = storage?.getItem("relayDeviceId") ?? "";
    } catch {
      relayDeviceId = "";
    }
  }
  if (!relayDeviceId) {
    relayDeviceId = `relay-device-${Math.random().toString(36).slice(2, 10).padEnd(8, "0")}`;
    try {
      storage?.setItem("relayDeviceId", relayDeviceId);
    } catch {
      /* 非浏览器环境无 localStorage，忽略 */
    }
  }
  return relayDeviceId;
}

export interface ConnectionApi {
  state: ConnectionState;
  describe: unknown;
  /** 最近一次连接的端点（自动重连/设置页用）。 */
  lastEndpoint: { host: string; port: number } | null;
  sessions: SessionSummary[];
  pending: PendingRequest[];
  notifications: NotificationEvent[];
  /** 本地通知开关（持久化；关闭时不弹系统通知，列表仍保留）。 */
  notificationsEnabled: boolean;
  setNotificationsEnabled(enabled: boolean): void;
  transcript(sessionId: string): TranscriptMessage[];
  /** 当前流式消息（未 complete 前；聊天页渲染闪烁光标）。 */
  liveMessage(sessionId: string): TranscriptMessage | undefined;
  goals: GoalsClient;
  /** 乐观更新 goal 状态（暂停/恢复后立即反映）。 */
  setGoalStatus(sessionId: string, status: string): void;
  /** 下拉刷新：重新拉取 session.list 并全量替换会话列表。 */
  refreshSessions(): Promise<void>;
  connect(host: string, port: number, token?: string): Promise<void>;
  disconnect(): void;
  sendMessage(sessionId: string, text: string): Promise<void>;
  respond(rpcId: string, result: unknown): Promise<void>;
  /** 请求宿主中断流式（session.interrupt）；失败抛错，由 UI 回退本地暂停。 */
  interruptStream(sessionId: string): Promise<void>;
}

const ConnectionContext = createContext<ConnectionApi | null>(null);

export function ConnectionProvider({ children }: { children: ReactNode }) {
  const pipelineRef = useRef<ConnectionPipeline | null>(null);
  const keepaliveRef = useRef<KeepaliveScheduler | null>(null);
  const stateRef = useRef<ConnectionState>("offline");
  const lastEndpointRef = useRef<{ host: string; port: number } | null>(null);
  const [state, setState] = useState<ConnectionState>("offline");
  const [describe, setDescribe] = useState<unknown>(null);
  const [version, setVersion] = useState(0);
  const [notifications, setNotifications] = useState<NotificationEvent[]>([]);
  const [notificationsEnabled, setNotificationsEnabledState] = useState(true);
  const notificationsEnabledRef = useRef(true);

  const setStateBoth = useCallback((s: ConnectionState) => {
    stateRef.current = s;
    setState(s);
  }, []);

  // 通知开关：挂载时读持久化偏好。
  useEffect(() => {
    void notificationPrefsStore.enabled().then((v) => {
      notificationsEnabledRef.current = v;
      setNotificationsEnabledState(v);
    });
  }, []);

  const setNotificationsEnabled = useCallback((enabled: boolean) => {
    notificationsEnabledRef.current = enabled;
    setNotificationsEnabledState(enabled);
    void notificationPrefsStore.setEnabled(enabled);
  }, []);

  // P2：冷启动自动重连最近主机（离线且从未主动连接时）。
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const [recent, token, autoReconnect] = await Promise.all([hostStore.latest(), tokenStore.get(), autoReconnectStore.enabled()]);
      if (cancelled || !recent || !autoReconnect || stateRef.current !== "offline") return;
      // 优先使用该主机自己的配对 token，回退全局 token（评审 #10）。
      await connectRef.current(recent.host, recent.port, recent.token ?? token ?? undefined);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // 后台保活：注册一次；tick 时若离线超阈值则重连最近端点
  useEffect(() => {
    const keepalive = new KeepaliveScheduler(
      backgroundTaskApi,
      () => stateRef.current,
      () => {
        const ep = lastEndpointRef.current;
        if (ep) return connectRef.current(ep.host, ep.port);
      },
    );
    keepaliveRef.current = keepalive;
    void keepalive.register(15 * 60_000);
    return () => {
      void keepalive.unregister();
      // 卸载时停止活动连接（loop/WS/退避定时器），避免悬挂重连
      pipelineRef.current?.stop();
      pipelineRef.current = null;
    };
  }, []);

  const connectRef = useRef<(host: string, port: number, token?: string) => Promise<void>>(async () => {});

  const connect = useCallback(async (host: string, port: number, token?: string) => {
    // 先等旧 pipeline 完全退出再建新连接，避免 WS/定时器重叠（评审 #14）。
    await pipelineRef.current?.stop();
    pipelineRef.current = null;
    setNotifications([]);

    // M3.1 连接模式选择：relay:// / ws:// / wss:// → RelayTransport；
    // 其余 host 走既有 LAN 路径（行为不变）。
    const relayMode = isRelayUrl(host);
    const endpoint = relayMode
      ? { host: toRelayWsUrl(host), port: 0 }
      : { host, port };
    lastEndpointRef.current = relayMode ? { host, port: 0 } : { host, port };
    void hostStore.add(host, relayMode ? 0 : port, undefined, token);
    void autoReconnectStore.setEnabled(true); // 手动连接即恢复自动重连

    // M3.3：relay 模式上报 Expo push token（LAN 模式不调用）。
    // 获取失败/超时降级为 undefined，不阻塞连接。
    const pushToken = relayMode ? ((await getExpoPushToken()) ?? undefined) : undefined;

    const transport = relayMode
      ? new RelayTransport({ deviceId: getRelayDeviceId(), pushToken })
      : new LanTransport({
          onDescribe: (d) => {
            setDescribe(d);
            const name = d && typeof d === "object" ? (d as { name?: string }).name : undefined;
            if (name) void hostStore.add(host, port, name, token);
          },
        });

    const pipeline = createConnectionPipeline({
      endpoint,
      auth: token ? { token } : {},
      transport,
      onStateChange: (s) => setStateBoth(s),
      onError: (err) => {
        console.warn("[conn]", err);
      },
      onNotification: (n) => {
        setNotifications((prev) => [...prev.slice(-49), n]);
        if (notificationsEnabledRef.current) void notificationService.present(n); // 开关门控
      },
    });
    pipeline.store.subscribe(() => setVersion((v) => v + 1));
    pipelineRef.current = pipeline;
    keepaliveRef.current?.markPing();
    // 调试钩子（仅开发构建暴露 store，便于浏览器控制台排查）
    if (process.env.NODE_ENV !== "production") {
      (globalThis as Record<string, unknown>).__dshDebug = pipeline.store;
    }
    pipeline.start();
  }, [setStateBoth]);

  connectRef.current = connect;

  const disconnect = useCallback(async () => {
    const prev = pipelineRef.current;
    if (prev) {
      await prev.stop(); // 等待真正退出，避免窗口期访问正在关闭的 pipeline
      prev.store.clear();
      if (pipelineRef.current === prev) pipelineRef.current = null;
    }
    lastEndpointRef.current = null;
    setStateBoth("offline");
    void autoReconnectStore.setEnabled(false); // 用户主动断开：关掉自动重连
  }, [setStateBoth]);

  const sendMessage = useCallback(async (sessionId: string, text: string) => {
    const c = pipelineRef.current?.loop.connection;
    if (!c) throw new Error("OFFLINE: not connected"); // 离线反馈（评审 #15）
    await c.unary("session.prompt", { sessionId, prompt: text });
  }, []);

  const respond = useCallback(async (rpcId: string, result: unknown) => {
    const c = pipelineRef.current?.loop.connection;
    if (!c) return;
    const req = pipelineRef.current?.store.getPendingRequest(rpcId);
    await c.respond(rpcId, result);
    pipelineRef.current?.store.resolvePending(rpcId);
    if (req) {
      const payload = (req.payload ?? {}) as Record<string, unknown>;
      const prompt = String(payload.prompt ?? payload.question ?? payload.command ?? "");
      void approvalHistoryStore.record({
        rpcId,
        kind: req.kind,
        prompt,
        result,
        respondedAt: Date.now(),
      });
    }
    // 消除对应的系统通知（M1-T4：响应后清理）
    void notificationService.dismissByRoute(`approval/${rpcId}`);
  }, []);

  const interruptStream = useCallback(async (sessionId: string) => {
    await requestInterrupt(pipelineRef.current?.loop.connection, sessionId);
  }, []);

  const transcript = useCallback((sessionId: string) => {
    return pipelineRef.current?.store.getTranscript(sessionId) ?? [];
  }, []);

  const liveMessage = useCallback((sessionId: string) => {
    return pipelineRef.current?.store.getLiveMessage(sessionId);
  }, []);

  // goals/* typert 调用（经活动连接的 unary，路径即 /api/goals/<method>）
  const goalsApi: GoalsApi = {
    call: async (ns, method, payload) => {
      const c = pipelineRef.current?.loop.connection;
      if (!c) return { ok: false, error: { code: "OFFLINE", message: "not connected" } };
      return c.unary(`${ns}/${method}`, payload);
    },
  };
  const goals = useMemo(() => new GoalsClient(goalsApi), []);

  const refreshSessions = useCallback(async () => {
    const c = pipelineRef.current?.loop.connection;
    const store = pipelineRef.current?.store;
    if (!c || !store) return;
    try {
      const r = await c.unary("session.list", {});
      if (r.ok && r.result && Array.isArray((r.result as { sessions?: unknown }).sessions)) {
        store.applySessionList((r.result as { sessions: Array<{ id?: unknown; title?: unknown; workspace?: unknown }> }).sessions);
        return;
      }
      throw new Error("session.list failed");
    } catch (err) {
      console.warn("[sessions] refresh failed", err);
      throw err; // 让 UI 层给出刷新失败提示
    }
  }, []);
  const setGoalStatus = useCallback((sessionId: string, status: string) => {
    pipelineRef.current?.store.setGoalStatus(sessionId, status);
  }, []);

  const value = useMemo<ConnectionApi>(
    () => ({
      state,
      describe,
      lastEndpoint: lastEndpointRef.current,
      sessions: pipelineRef.current?.store.getSessions() ?? [],
      pending: pipelineRef.current?.store.getPendingRequests() ?? [],
      notifications,
      transcript,
      liveMessage,
      goals,
      notificationsEnabled,
      setNotificationsEnabled,
      setGoalStatus,
      refreshSessions,
      connect,
      disconnect,
      sendMessage,
      respond,
      interruptStream,
    }),
    [state, describe, version, notifications, notificationsEnabled, goals, setGoalStatus, refreshSessions, connect, disconnect, sendMessage, respond, interruptStream, transcript, liveMessage, setNotificationsEnabled],
  );

  return <ConnectionContext.Provider value={value}>{children}</ConnectionContext.Provider>;
}

export function useConnection(): ConnectionApi {
  const ctx = useContext(ConnectionContext);
  if (!ctx) throw new Error("useConnection must be used within ConnectionProvider");
  return ctx;
}

export const STATE_LABEL: Record<ConnectionState, string> = {
  connecting: "连接中",
  online: "在线",
  offline: "离线",
  backoff: "退避重试",
};
