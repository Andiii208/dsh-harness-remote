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
import { LanTransport, type ConnectionState } from "@dsh-remote/protocol";
import {
  createConnectionPipeline,
  type ConnectionPipeline,
} from "./pipeline";
import { notificationService } from "../notify/expoAdapter";
import { hostStore } from "../discovery/hostStoreAdapter";
import { autoReconnectStore } from "../discovery/autoReconnectStoreAdapter";
import { tokenStore } from "../data/secureStoreAdapter";
import { KeepaliveScheduler } from "../notify/keepalive";
import { backgroundTaskApi, KEEPALIVE_TASK } from "../notify/keepaliveAdapter";
import { GoalsClient, type GoalsApi } from "../data/goals";
import type { PendingRequest, SessionSummary, TranscriptMessage } from "../data/SessionStore";
import type { NotificationEvent } from "../notify/classifier";

export interface ConnectionApi {
  state: ConnectionState;
  describe: unknown;
  /** 最近一次连接的端点（自动重连/设置页用）。 */
  lastEndpoint: { host: string; port: number } | null;
  sessions: SessionSummary[];
  pending: PendingRequest[];
  notifications: NotificationEvent[];
  transcript(sessionId: string): TranscriptMessage[];
  /** 当前流式消息（未 complete 前；聊天页渲染闪烁光标）。 */
  liveMessage(sessionId: string): TranscriptMessage | undefined;
  goals: GoalsClient;
  /** 乐观更新 goal 状态（暂停/恢复后立即反映）。 */
  setGoalStatus(sessionId: string, status: string): void;
  connect(host: string, port: number, token?: string): Promise<void>;
  disconnect(): void;
  sendMessage(sessionId: string, text: string): Promise<void>;
  respond(rpcId: string, result: unknown): Promise<void>;
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

  const setStateBoth = useCallback((s: ConnectionState) => {
    stateRef.current = s;
    setState(s);
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
    pipelineRef.current?.stop();
    setNotifications([]);
    lastEndpointRef.current = { host, port };
    void hostStore.add(host, port, undefined, token);
    void autoReconnectStore.setEnabled(true); // 手动连接即恢复自动重连

    const pipeline = createConnectionPipeline({
      endpoint: { host, port },
      auth: token ? { token } : {},
      transport: new LanTransport({
        onDescribe: (d) => {
          setDescribe(d);
          const name = d && typeof d === "object" ? (d as { name?: string }).name : undefined;
          if (name) void hostStore.add(host, port, name, token);
        },
      }),
      onStateChange: (s) => setStateBoth(s),
      onError: (err) => {
        console.warn("[conn]", err);
      },
      onNotification: (n) => {
        setNotifications((prev) => [...prev.slice(-49), n]);
        void notificationService.present(n); // M1：分类器事件 → 本地通知
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

  const disconnect = useCallback(() => {
    pipelineRef.current?.stop();
    pipelineRef.current?.store.clear();
    pipelineRef.current = null;
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
    await c.respond(rpcId, result);
    pipelineRef.current?.store.resolvePending(rpcId);
    // 消除对应的系统通知（M1-T4：响应后清理）
    void notificationService.dismissByRoute(`approval/${rpcId}`);
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
      setGoalStatus,
      connect,
      disconnect,
      sendMessage,
      respond,
    }),
    [state, describe, version, notifications, goals, setGoalStatus, connect, disconnect, sendMessage, respond, transcript, liveMessage],
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
