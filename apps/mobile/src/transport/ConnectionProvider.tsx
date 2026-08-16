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
import type { PendingRequest, SessionSummary, TranscriptMessage } from "../data/SessionStore";
import type { NotificationEvent } from "../notify/classifier";

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
  const pipelineRef = useRef<ConnectionPipeline | null>(null);
  const [state, setState] = useState<ConnectionState>("offline");
  const [describe, setDescribe] = useState<unknown>(null);
  const [version, setVersion] = useState(0);
  const [notifications, setNotifications] = useState<NotificationEvent[]>([]);

  useEffect(() => {
    return () => {
      pipelineRef.current?.stop();
      pipelineRef.current = null;
    };
  }, []);

  const connect = useCallback(async (host: string, port: number) => {
    pipelineRef.current?.stop();
    setNotifications([]);

    const pipeline = createConnectionPipeline({
      endpoint: { host, port },
      transport: new LanTransport({
        onDescribe: (d) => setDescribe(d),
      }),
      onStateChange: (s) => setState(s),
      onError: (err) => {
        console.warn("[conn]", err);
      },
      onNotification: (n) => setNotifications((prev) => [...prev.slice(-49), n]),
    });
    pipeline.store.subscribe(() => setVersion((v) => v + 1));
    pipelineRef.current = pipeline;
    pipeline.start();
  }, []);

  const disconnect = useCallback(() => {
    pipelineRef.current?.stop();
    pipelineRef.current = null;
    setState("offline");
  }, []);

  const sendMessage = useCallback(async (sessionId: string, text: string) => {
    const c = pipelineRef.current?.loop.connection;
    if (!c) return;
    await c.unary("session.prompt", { sessionId, prompt: text });
  }, []);

  const respond = useCallback(async (rpcId: string, result: unknown) => {
    const c = pipelineRef.current?.loop.connection;
    if (!c) return;
    await c.respond(rpcId, result);
    pipelineRef.current?.store.resolvePending(rpcId);
  }, []);

  const transcript = useCallback((sessionId: string) => {
    return pipelineRef.current?.store.getTranscript(sessionId) ?? [];
  }, []);

  const value = useMemo<ConnectionApi>(
    () => ({
      state,
      describe,
      sessions: pipelineRef.current?.store.getSessions() ?? [],
      pending: pipelineRef.current?.store.getPendingRequests() ?? [],
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
