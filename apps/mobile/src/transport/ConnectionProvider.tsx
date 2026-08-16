/**
 * ConnectionProvider — 装配 LanTransport + ConnectionLoop + SessionStore +
 * NotificationClassifier，向 UI 暴露连接状态、会话数据与操作。
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
  ConnectionLoop,
  LanTransport,
  type ConnectionState,
} from "@dsh-remote/protocol";
import {
  SessionStore,
  type PendingRequest,
  type SessionSummary,
  type TranscriptMessage,
} from "../data/SessionStore";
import { NotificationClassifier, type NotificationEvent } from "../notify/classifier";

export interface ConnectionApi {
  state: ConnectionState;
  describe: unknown;
  sessions: SessionSummary[];
  pending: PendingRequest[];
  notifications: NotificationEvent[];
  transcript(sessionId: string): TranscriptMessage[];
  connect(host: string, port: number): Promise<void>;
  disconnect(): void;
  sendMessage(sessionId: string, text: string): Promise<void>;
  respond(rpcId: string, result: unknown): Promise<void>;
}

const ConnectionContext = createContext<ConnectionApi | null>(null);

export function ConnectionProvider({ children }: { children: ReactNode }) {
  const storeRef = useRef<SessionStore | null>(null);
  const classifierRef = useRef<NotificationClassifier | null>(null);
  const loopRef = useRef<ConnectionLoop | null>(null);
  const [state, setState] = useState<ConnectionState>("offline");
  const [describe, setDescribe] = useState<unknown>(null);
  const [version, setVersion] = useState(0);
  const [notifications, setNotifications] = useState<NotificationEvent[]>([]);

  useEffect(() => {
    const store = new SessionStore();
    const classifier = new NotificationClassifier();
    store.subscribe(() => setVersion((v) => v + 1));
    storeRef.current = store;
    classifierRef.current = classifier;
    return () => {
      loopRef.current?.stop();
      storeRef.current = null;
    };
  }, []);

  const connect = useCallback(async (host: string, port: number) => {
    const store = storeRef.current;
    if (!store) return;
    loopRef.current?.stop();
    store.clear();
    setNotifications([]);

    const loop = new ConnectionLoop({
      endpoint: { host, port },
      transport: new LanTransport({
        onDescribe: (d) => setDescribe(d),
      }),
      onStateChange: (s) => setState(s),
      onError: (err) => {
        console.warn("[conn]", err);
      },
      onResync: () => {
        // 重连成功后：清空镜像等待注册表/投影帧重放（宽容：无帧则空列表）
      },
    });
    loopRef.current = loop;

    const pump = async () => {
      for await (const frame of loop.events) {
        store.applyFrame(frame);
        const ev = classifierRef.current?.classify(frame);
        if (ev) setNotifications((n) => [...n.slice(-49), ev]);
      }
    };
    void pump();
    loop.start();
  }, []);

  const disconnect = useCallback(() => {
    loopRef.current?.stop();
    storeRef.current?.clear();
    setState("offline");
  }, []);

  const sendMessage = useCallback(async (sessionId: string, text: string) => {
    const c = loopRef.current?.connection;
    if (!c) return;
    await c.unary("session.prompt", { sessionId, prompt: text });
  }, []);

  const respond = useCallback(async (rpcId: string, result: unknown) => {
    const c = loopRef.current?.connection;
    if (!c) return;
    await c.respond(rpcId, result);
    storeRef.current?.resolvePending(rpcId);
  }, []);

  const transcript = useCallback((sessionId: string) => {
    return storeRef.current?.getTranscript(sessionId) ?? [];
  }, []);

  const value = useMemo<ConnectionApi>(
    () => ({
      state,
      describe,
      sessions: storeRef.current?.getSessions() ?? [],
      pending: storeRef.current?.getPendingRequests() ?? [],
      notifications,
      transcript,
      connect,
      disconnect,
      sendMessage,
      respond,
    }),
    [state, describe, version, notifications, connect, disconnect, sendMessage, respond, transcript],
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
