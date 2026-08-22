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
  readHostSettings,
  readPluginList,
  type ConnectionState,
  type HostSettings,
  type PluginListResult,
} from "@dsh-remote/protocol";
import {
  createConnectionPipeline,
  type ConnectionPipeline,
} from "./pipeline";
import { isRelayUrl, toRelayWsUrl } from "./relayMode";
import { classifyConnectionError, type ConnectionErrorInfo } from "./connectionErrors";
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
import { parseSkillList, type SkillEntry } from "../data/skillList";
import { toImageMediaType, type ImageMediaType } from "../data/imageMessage";
import type { JobInfo, PendingRequest, QueueItem, SessionSummary, TranscriptMessage } from "../data/SessionStore";
import type { TranscriptStep } from "../data/transcriptSteps";
import type { NotificationEvent } from "../notify/classifier";
import { relayDeviceStore } from "../relay/relayDeviceStoreAdapter";

export interface ConnectionApi {
  state: ConnectionState;
  describe: unknown;
  /** 最近一次连接的端点（自动重连/设置页用）。 */
  lastEndpoint: { host: string; port: number } | null;
  /** 连接失败分类信息（give-up 后供 UI 展示；连接中为 null）。 */
  lastError: ConnectionErrorInfo | null;
  /** 是否已放弃重试（停在离线态，等待用户手动重试）。 */
  givenUp: boolean;
  /** 放弃后手动重试（用最近一次连接参数重新开始）。 */
  retry(): void;
  /** 停止当前连接/重试（放弃重试，停在离线态）。 */
  stopRetrying(): void;
  sessions: SessionSummary[];
  pending: PendingRequest[];
  notifications: NotificationEvent[];
  /** 本地通知开关（持久化；关闭时不弹系统通知，列表仍保留）。 */
  notificationsEnabled: boolean;
  setNotificationsEnabled(enabled: boolean): void;
  transcript(sessionId: string): TranscriptMessage[];
  /** 当前流式消息（未 complete 前；聊天页渲染闪烁光标）。 */
  liveMessage(sessionId: string): TranscriptMessage | undefined;
  /** 轨迹步骤（tool/call、tool/result、turn/*、step/end 折叠）。 */
  steps(sessionId: string): TranscriptStep[];
  goals: GoalsClient;
  /** 乐观更新 goal 状态（暂停/恢复后立即反映）。 */
  setGoalStatus(sessionId: string, status: string): void;
  /** 下拉刷新：重新拉取 session.list 并全量替换会话列表。 */
  refreshSessions(): Promise<void>;
  /** 新建会话（session.create）；返回新会话 id，失败返回 null。 */
  createSession(): Promise<string | null>;
  connect(host: string, port: number, token?: string, pairCode?: string): Promise<void>;
  /** Relay 配对成功后对方的 consoleId（仅 relay 模式在线配对时非空）。 */
  relayPeerId: string | null;
  disconnect(): void;
  sendMessage(sessionId: string, text: string, promptMode?: "queue" | "steer"): Promise<void>;
  /** 发送图片消息（session.prompt image block，mode:"queue"）。 */
  sendImageMessage(sessionId: string, image: { mediaType: ImageMediaType; data: string; name?: string }): Promise<void>;
  /** 读取图片附件 base64（session.attachment）；失败返回 null。 */
  attachment(sessionId: string, attachmentId: string): Promise<{ mediaType: string; data: string } | null>;
  respond(rpcId: string, result: unknown): Promise<void>;
  /** 请求宿主中断流式（session.interrupt）；失败抛错，由 UI 回退本地暂停。 */
  interruptStream(sessionId: string): Promise<void>;
  /** R2：读取宿主插件能力清单；读不到/离线返回 null（UI 自动隐藏）。 */
  pluginList(): Promise<PluginListResult | null>;
  /** R2：执行宿主插件命令；读不到/离线返回 null。 */
  pluginExec(commandId: string, args?: Record<string, unknown>): Promise<{ ok: boolean; result?: unknown; error?: { code: string; message: string } } | null>;
  /** R3：读取宿主设置；宿主不支持/离线返回 null（UI 自动隐藏）。 */
  hostSettingsGet(): Promise<HostSettings | null>;
  /** R3：写回宿主设置；宿主不支持返回 false。 */
  hostSettingsSet(patch: { model?: string; thinking?: string }): Promise<boolean>;
  /** 加载会话历史转录（session.history）；支持 beforeSeq 分页。成功返回 true，失败返回 false。 */
  loadHistory(sessionId: string, maxMessages?: number, beforeSeq?: number): Promise<boolean>;
  /** 读取会话可用模型列表与当前模型。 */
  sessionModels(sessionId: string): Promise<{ current: { provider: string; model: string; reasoningEffort?: string }; groups: Array<{ id: string; name: string; models: Array<{ id: string; name: string; reasoning?: { efforts?: Array<{ id: string; name: string }>; defaultEffort?: string } }> }> } | null>;
  /** 选择会话模型。 */
  selectModel(sessionId: string, provider: string, model: string, reasoningEffort?: string): Promise<boolean>;
  /** 执行宿主命令（如 /permission workspace-write）。 */
  executeCommand(sessionId: string, line: string): Promise<{ ok: boolean; result?: { kind: string; text?: string } } | null>;
  /** 当前会话的排队消息（session/queue 帧）。 */
  queueItems(sessionId: string): QueueItem[];
  /** 当前会话的后台任务（session/jobs 帧）。 */
  jobs(sessionId: string): JobInfo[];
  /** 更新排队消息：edit/remove/steer（session.updateQueue）。 */
  updateQueue(sessionId: string, itemId: string, action: { kind: "edit"; content: Array<{ type: "text"; text: string }> } | { kind: "remove" } | { kind: "steer" }): Promise<boolean>;
  /** 重命名会话（session.rename）。 */
  renameSession(sessionId: string, title: string): Promise<boolean>;
  /** 派生会话（session.fork）。 */
  forkSession(sessionId: string, atSeq?: number): Promise<string | null>;
  /** 工作区列表（workspace.list）。 */
  workspaceList(): Promise<{ items: Array<{ workspaceId: string; path: string; title: string; sessionIds: string[] }>; archivedSessionIds: string[] } | null>;
  /** 归档会话（workspace.archiveSession）。 */
  archiveSession(sessionId: string): Promise<boolean>;
  /** 原生会话搜索（session.search）。 */
  searchSessions(query: string): Promise<Array<{ sessionId: string; snippet: string }> | null>;
  /** 原生 settings.describe：读取设置命名空间。 */
  settingsDescribe(): Promise<{ writable: boolean; hasDocument: boolean; namespaces: Array<{ ns: string; value: unknown; revision: number; applies: string }> } | null>;
  /** 原生 settings.mutate：按路径修改设置。 */
  settingsMutate(ns: string, ops: Array<{ op: "set"; path: string[]; value: unknown } | { op: "unset"; path: string[] }>, expectedRevision?: number): Promise<boolean>;
  /** 原生 agentPreset.list。 */
  agentPresetList(): Promise<Array<{ id: string; name: string; isDefault: boolean; trust: string; broken?: string }> | null>;
  /** 原生 agentPreset.select：为指定会话切换预设。 */
  agentPresetSelect(sessionId: string, agentPreset: string): Promise<boolean>;
  /** 读取当前会话可 @ 的技能清单（skill.list）；宿主不支持/离线返回 null。 */
  skillList(sessionId: string): Promise<SkillEntry[] | null>;
}

const ConnectionContext = createContext<ConnectionApi | null>(null);

export function ConnectionProvider({ children }: { children: ReactNode }) {
  const pipelineRef = useRef<ConnectionPipeline | null>(null);
  const keepaliveRef = useRef<KeepaliveScheduler | null>(null);
  const stateRef = useRef<ConnectionState>("offline");
  const lastEndpointRef = useRef<{ host: string; port: number } | null>(null);
  const [state, setState] = useState<ConnectionState>("offline");
  const [describe, setDescribe] = useState<unknown>(null);
  const [relayPeerId, setRelayPeerId] = useState<string | null>(null);
  const [lastError, setLastError] = useState<ConnectionErrorInfo | null>(null);
  const [givenUp, setGivenUp] = useState(false);
  const [version, setVersion] = useState(0);
  const lastConnectParamsRef = useRef<{ host: string; port: number; token?: string; pairCode?: string } | null>(null);
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

  const connectRef = useRef<(host: string, port: number, token?: string, pairCode?: string) => Promise<void>>(async () => {});

  const connect = useCallback(async (host: string, port: number, token?: string, pairCode?: string) => {
    // 先等旧 pipeline 完全退出再建新连接，避免 WS/定时器重叠（评审 #14）。
    await pipelineRef.current?.stop();
    pipelineRef.current = null;
    setNotifications([]);
    setRelayPeerId(null);
    setLastError(null);
    setGivenUp(false);
    lastConnectParamsRef.current = { host, port, token, pairCode };

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

    const relayDevice = relayMode ? await relayDeviceStore.getOrCreate() : null;
    const transport = relayMode
      ? new RelayTransport({
          deviceId: relayDevice!.deviceId,
          privateKeyJwk: relayDevice!.privateKeyJwk ?? undefined,
          pairCode: pairCode?.trim() || undefined,
          onPairAck: (ack) => setRelayPeerId(ack.consoleId),
          pushToken,
        })
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
      maxAttempts: 8,
      onStateChange: (s) => setStateBoth(s),
      onError: (err) => {
        console.warn("[conn]", err);
      },
      onGiveUp: (err) => {
        setLastError(classifyConnectionError(err));
        setGivenUp(true);
      },
      onNotification: (n) => {
        setNotifications((prev) => [...prev.slice(-49), { ...n, receivedAt: Date.now() }]);
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
  }, [setStateBoth, setRelayPeerId]);

  connectRef.current = connect;

  const disconnect = useCallback(async () => {
    const prev = pipelineRef.current;
    if (prev) {
      await prev.stop(); // 等待真正退出，避免窗口期访问正在关闭的 pipeline
      prev.store.clear();
      if (pipelineRef.current === prev) pipelineRef.current = null;
    }
    lastEndpointRef.current = null;
    lastConnectParamsRef.current = null;
    setRelayPeerId(null);
    setLastError(null);
    setGivenUp(false);
    setStateBoth("offline");
    void autoReconnectStore.setEnabled(false); // 用户主动断开：关掉自动重连
  }, [setStateBoth, setRelayPeerId]);

  const stopRetrying = useCallback(async () => {
    const prev = pipelineRef.current;
    if (prev) {
      await prev.stop();
      if (pipelineRef.current === prev) pipelineRef.current = null;
    }
    setStateBoth("offline");
  }, [setStateBoth]);

  const retry = useCallback(() => {
    const p = lastConnectParamsRef.current;
    if (p) void connect(p.host, p.port, p.token, p.pairCode);
  }, [connect]);

  const sendMessage = useCallback(async (sessionId: string, text: string, promptMode: "queue" | "steer" = "queue") => {
    const c = pipelineRef.current?.loop.connection;
    if (!c) throw new Error("OFFLINE: not connected"); // 离线反馈（评审 #15）
    // 真实 DSH rc.7 的 session.prompt 契约：mode + content 数组（text part）。
    // H4：普通消息默认 queue（进入排队/工具循环），composer 可切 steer。
    await c.unary("session.prompt", {
      sessionId,
      mode: promptMode,
      content: [{ type: "text", text }],
    });
  }, []);

  const sendImageMessage = useCallback(async (
    sessionId: string,
    image: { mediaType: ImageMediaType; data: string; name?: string },
  ) => {
    const c = pipelineRef.current?.loop.connection;
    if (!c) throw new Error("OFFLINE: not connected");
    // 真实 DSH session.prompt 图片契约：mode:"queue" + content image block（base64 data）。
    await c.unary("session.prompt", {
      sessionId,
      mode: "queue",
      content: [{
        type: "image",
        mediaType: image.mediaType,
        data: image.data,
        ...(image.name !== undefined ? { name: image.name } : {}),
      }],
    });
  }, []);

  /** session.attachment：读取图片附件 base64。 */
  const attachment = useCallback(async (sessionId: string, attachmentId: string) => {
    const c = pipelineRef.current?.loop.connection;
    if (!c) return null;
    try {
      const r = await c.unary("session.attachment", { sessionId, attachmentId });
      if (!r.ok) return null;
      const value = r.result as { attachment?: { mediaType?: unknown }; data?: unknown } | undefined;
      if (!value || typeof value.data !== "string") return null;
      const mediaType = toImageMediaType(value.attachment?.mediaType);
      if (!mediaType) return null;
      return { mediaType, data: value.data };
    } catch {
      return null;
    }
  }, []);

  const respond = useCallback(async (rpcId: string, result: unknown) => {
    const c = pipelineRef.current?.loop.connection;
    if (!c) return;
    const req = pipelineRef.current?.store.getPendingRequest(rpcId);
    const payload = (req?.payload ?? {}) as Record<string, unknown>;
    // 真实 DSH rc.7 的 client-response 要求 result 槽为 {ok, value}，且
    // approval/question 的 value 是结构化 payload；旧 mock 直接透传原结果。
    let wireResult: unknown = result;
    const hasRealApproval = typeof payload.approvalId === "string" && typeof payload.sessionId === "string";
    const hasRealQuestion = req?.kind === "question" && Array.isArray(payload.questions);
    if (hasRealApproval) {
      const approved = (result as { approved?: boolean })?.approved === true;
      wireResult = {
        ok: true,
        value: {
          sessionId: String(payload.sessionId),
          approvalId: String(payload.approvalId),
          outcome: approved ? "allowed-once" : "rejected",
        },
      };
    } else if (hasRealQuestion) {
      if ((result as { skipped?: boolean })?.skipped === true) {
        wireResult = { ok: false, error: { code: "cancelled" } };
      } else {
        const answer = String((result as { answer?: unknown })?.answer ?? "");
        wireResult = {
          ok: true,
          value: {
            sessionId: String(payload.sessionId),
            answer: {
              answers: (payload.questions as Array<Record<string, unknown>>).map((q) => ({
                id: String(q.id ?? ""),
                selected: [answer],
              })),
            },
          },
        };
      }
    }
    await c.respond(rpcId, wireResult);
    pipelineRef.current?.store.resolvePending(rpcId);
    if (req) {
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

  // R2：插件能力面。所有读取失败/离线都返回 null，UI 自动隐藏，不报错。
  const pluginList = useCallback(async (): Promise<PluginListResult | null> => {
    const c = pipelineRef.current?.loop.connection;
    if (!c) return null;
    try {
      const r = await c.unary("plugin.list", {});
      if (!r.ok) return null;
      return readPluginList(r.result);
    } catch {
      return null;
    }
  }, []);

  const pluginExec = useCallback(
    async (commandId: string, args?: Record<string, unknown>) => {
      const c = pipelineRef.current?.loop.connection;
      if (!c) return null;
      try {
        const r = await c.unary("plugin.exec", { commandId, args });
        if (!r.ok) {
          const err = r.error;
          return {
            ok: false,
            error: {
              code: err?.code ?? "UnknownError",
              message: err?.message ?? "plugin.exec failed",
            },
          };
        }
        const result = (r.result ?? {}) as Record<string, unknown>;
        return {
          ok: typeof result.ok === "boolean" ? result.ok : true,
          result: result.result,
          ...(result.error && typeof result.error === "object"
            ? {
                error: {
                  code: String((result.error as { code?: unknown }).code ?? "UnknownError"),
                  message: String((result.error as { message?: unknown }).message ?? "plugin.exec failed"),
                },
              }
            : {}),
        };
      } catch {
        return null;
      }
    },
    [],
  );

  // R3：宿主设置读取/写回。读不到返回 null（UI 隐藏），写失败返回 false。
  const hostSettingsGet = useCallback(async (): Promise<HostSettings | null> => {
    const c = pipelineRef.current?.loop.connection;
    if (!c) return null;
    try {
      const r = await c.unary("host.settings.get", {});
      if (!r.ok) return null;
      return readHostSettings(r.result);
    } catch {
      return null;
    }
  }, []);

  const hostSettingsSet = useCallback(async (patch: { model?: string; thinking?: string }): Promise<boolean> => {
    const c = pipelineRef.current?.loop.connection;
    if (!c) return false;
    try {
      const r = await c.unary("host.settings.set", patch);
      return r.ok;
    } catch {
      return false;
    }
  }, []);

  const transcript = useCallback((sessionId: string) => {
    return pipelineRef.current?.store.getTranscript(sessionId) ?? [];
  }, []);

  const liveMessage = useCallback((sessionId: string) => {
    return pipelineRef.current?.store.getLiveMessage(sessionId);
  }, []);

  const steps = useCallback((sessionId: string) => {
    return pipelineRef.current?.store.getSteps(sessionId) ?? [];
  }, []);

  // 原生 DSH goal.* 调用（经活动连接的 unary，路径即 /api/goal.<method>）
  const goalsApi: GoalsApi = {
    unary: async (method, payload) => {
      const c = pipelineRef.current?.loop.connection;
      if (!c) return { ok: false, error: { code: "OFFLINE", message: "not connected" } };
      return c.unary(method, payload);
    },
  };
  const goals = useMemo(() => new GoalsClient(goalsApi), []);

  const refreshSessions = useCallback(async () => {
    const c = pipelineRef.current?.loop.connection;
    const store = pipelineRef.current?.store;
    if (!c || !store) return;
    try {
      const r = await c.unary("session.list", {});
      if (!r.ok) throw new Error("session.list failed");
      const result = (r.result ?? {}) as Record<string, unknown>;
      // 兼容真实 DSH rc.7（value.items）与旧 mock（sessions）两种形状。
      const items = Array.isArray(result.items)
        ? (result.items as Array<Record<string, unknown>>)
        : Array.isArray(result.sessions)
          ? (result.sessions as Array<Record<string, unknown>>)
          : null;
      if (items) {
        store.applySessionList(items);
        return;
      }
      throw new Error("session.list failed");
    } catch (err) {
      console.warn("[sessions] refresh failed", err);
      throw err; // 让 UI 层给出刷新失败提示
    }
  }, []);
  const createSession = useCallback(async (): Promise<string | null> => {
    const c = pipelineRef.current?.loop.connection;
    if (!c) return null;
    try {
      const r = await c.unary("session.create", {});
      if (!r.ok) return null;
      const value = (r.result ?? {}) as { sessionId?: unknown; id?: unknown };
      const id = typeof value.sessionId === "string" ? value.sessionId : typeof value.id === "string" ? value.id : null;
      return id;
    } catch (err) {
      console.warn("[sessions] create failed", err);
      return null;
    }
  }, []);

  const setGoalStatus = useCallback((sessionId: string, status: string) => {
    pipelineRef.current?.store.setGoalStatus(sessionId, status);
  }, []);

  /** 加载会话历史转录（session.history）；支持 beforeSeq 分页向前翻页。 */
  const loadHistory = useCallback(async (sessionId: string, maxMessages?: number, beforeSeq?: number): Promise<boolean> => {
    const c = pipelineRef.current?.loop.connection;
    const store = pipelineRef.current?.store;
    if (!c || !store) return false;
    try {
      const r = await c.unary("session.history", {
        sessionId,
        ...(maxMessages !== undefined ? { maxMessages } : {}),
        ...(beforeSeq !== undefined ? { beforeSeq } : {}),
      });
      if (!r.ok) return false;
      const result = r.result as Record<string, unknown> | undefined;
      const events = Array.isArray((result as Record<string, unknown> | undefined)?.events)
        ? ((result as Record<string, unknown>).events as Array<Record<string, unknown>>)
        : [];
      store.applyHistory(events, sessionId);
      return true;
    } catch (err) {
      console.warn("[history] load failed", err);
      return false;
    }
  }, []);

  /** 读取会话可用模型列表与当前模型。 */
  const sessionModels = useCallback(async (sessionId: string) => {
    const c = pipelineRef.current?.loop.connection;
    if (!c) return null;
    try {
      const r = await c.unary("session.models", { sessionId });
      if (!r.ok) return null;
      const result = r.result as Record<string, unknown> | undefined;
      if (!result) return null;
      const current = result.current as { provider?: string; model?: string; reasoningEffort?: string } | undefined;
      const groups = Array.isArray(result.groups) ? result.groups as Array<Record<string, unknown>> : [];
      return {
        current: {
          provider: current?.provider ?? "",
          model: current?.model ?? "",
          reasoningEffort: current?.reasoningEffort,
        },
        groups: groups.map((g) => ({
          id: String(g.id ?? ""),
          name: String(g.name ?? ""),
          models: Array.isArray(g.models) ? g.models.map((m: Record<string, unknown>) => ({
            id: String(m.id ?? ""),
            name: String(m.name ?? ""),
            reasoning: m.reasoning
              ? (() => {
                  const r = m.reasoning as { efforts?: unknown; defaultEffort?: unknown };
                  return {
                    efforts: Array.isArray(r.efforts)
                      ? (r.efforts as Array<{ id?: unknown; name?: unknown }>).map((e) => ({
                          id: String(e.id ?? ""),
                          name: String(e.name ?? ""),
                        }))
                      : undefined,
                    defaultEffort: String(r.defaultEffort ?? ""),
                  };
                })()
              : undefined,
          })) : [],
        })),
      };
    } catch {
      return null;
    }
  }, []);

  /** 选择会话模型。 */
  const selectModel = useCallback(async (sessionId: string, provider: string, model: string, reasoningEffort?: string) => {
    const c = pipelineRef.current?.loop.connection;
    if (!c) return false;
    try {
      const r = await c.unary("session.selectModel", {
        sessionId,
        provider,
        model,
        ...(reasoningEffort !== undefined ? { reasoningEffort } : {}),
      });
      return r.ok;
    } catch {
      return false;
    }
  }, []);

  /** 执行宿主命令（如 /permission workspace-write）。 */
  const executeCommand = useCallback(async (sessionId: string, line: string) => {
    const c = pipelineRef.current?.loop.connection;
    if (!c) return null;
    try {
      const r = await c.unary("commands/execute", {
        args: { agentId: sessionId, line },
      });
      if (!r.ok) return { ok: false, result: undefined };
      // 真实 DSH commands/execute 返回 { commandId, result: { kind, text } }
      const value = r.result as { commandId?: unknown; result?: { kind?: unknown; text?: unknown } } | undefined;
      const inner = value?.result;
      return {
        ok: true,
        result: inner ? { kind: String(inner.kind ?? "success"), text: typeof inner.text === "string" ? inner.text : undefined } : undefined,
      };
    } catch {
      return null;
    }
  }, []);

  const queueItems = useCallback((sessionId: string) => {
    return pipelineRef.current?.store.getQueueItems(sessionId) ?? [];
  }, []);

  const jobs = useCallback((sessionId: string) => {
    return pipelineRef.current?.store.getJobs(sessionId) ?? [];
  }, []);

  /** session.updateQueue：编辑 / 移除 / 立即执行排队消息。 */
  const updateQueue = useCallback(async (
    sessionId: string,
    itemId: string,
    action: { kind: "edit"; content: Array<{ type: "text"; text: string }> } | { kind: "remove" } | { kind: "steer" },
  ) => {
    const c = pipelineRef.current?.loop.connection;
    if (!c) return false;
    try {
      const r = await c.unary("session.updateQueue", { sessionId, itemId, action });
      return r.ok;
    } catch {
      return false;
    }
  }, []);

  /** session.rename。 */
  const renameSession = useCallback(async (sessionId: string, title: string) => {
    const c = pipelineRef.current?.loop.connection;
    if (!c) return false;
    try {
      const r = await c.unary("session.rename", { sessionId, title });
      return r.ok;
    } catch {
      return false;
    }
  }, []);

  /** session.fork；返回新会话 id。 */
  const forkSession = useCallback(async (sessionId: string, atSeq?: number) => {
    const c = pipelineRef.current?.loop.connection;
    if (!c) return null;
    try {
      const r = await c.unary("session.fork", {
        sessionId,
        ...(atSeq !== undefined ? { atSeq } : {}),
      });
      if (!r.ok) return null;
      const value = r.result as { sessionId?: unknown } | undefined;
      return typeof value?.sessionId === "string" ? value.sessionId : null;
    } catch {
      return null;
    }
  }, []);

  /** workspace.list。 */
  const workspaceList = useCallback(async () => {
    const c = pipelineRef.current?.loop.connection;
    if (!c) return null;
    try {
      const r = await c.unary("workspace.list", {});
      if (!r.ok) return null;
      const value = r.result as { items?: Array<{ workspaceId?: unknown; path?: unknown; title?: unknown; sessionIds?: unknown }>; archivedSessionIds?: unknown } | undefined;
      const items = Array.isArray(value?.items) ? value.items : [];
      return {
        items: items.map((w) => ({
          workspaceId: String(w.workspaceId ?? ""),
          path: String(w.path ?? ""),
          title: String(w.title ?? ""),
          sessionIds: Array.isArray(w.sessionIds) ? w.sessionIds.map((s) => String(s)) : [],
        })),
        archivedSessionIds: Array.isArray(value?.archivedSessionIds) ? value.archivedSessionIds.map((s) => String(s)) : [],
      };
    } catch {
      return null;
    }
  }, []);

  /** workspace.archiveSession。 */
  const archiveSession = useCallback(async (sessionId: string) => {
    const c = pipelineRef.current?.loop.connection;
    if (!c) return false;
    try {
      const r = await c.unary("workspace.archiveSession", { sessionId });
      return r.ok;
    } catch {
      return false;
    }
  }, []);

  /** session.search。 */
  const searchSessions = useCallback(async (query: string) => {
    const c = pipelineRef.current?.loop.connection;
    if (!c) return null;
    try {
      const r = await c.unary("session.search", { query });
      if (!r.ok) return null;
      const value = r.result as { items?: Array<{ sessionId?: unknown; snippet?: unknown }> } | undefined;
      return Array.isArray(value?.items) ? value.items.map((s) => ({ sessionId: String(s.sessionId ?? ""), snippet: String(s.snippet ?? "") })) : [];
    } catch {
      return null;
    }
  }, []);

  /** 原生 settings.describe。 */
  const settingsDescribe = useCallback(async () => {
    const c = pipelineRef.current?.loop.connection;
    if (!c) return null;
    try {
      const r = await c.unary("settings.describe", {});
      if (!r.ok) return null;
      const value = r.result as { writable?: unknown; hasDocument?: unknown; namespaces?: unknown } | undefined;
      const namespaces = Array.isArray(value?.namespaces) ? value.namespaces as Array<Record<string, unknown>> : [];
      return {
        writable: value?.writable === true,
        hasDocument: value?.hasDocument === true,
        namespaces: namespaces.map((ns) => ({
          ns: String(ns.ns ?? ""),
          value: ns.value,
          revision: typeof ns.revision === "number" ? ns.revision : 0,
          applies: String(ns.applies ?? "live"),
        })),
      };
    } catch {
      return null;
    }
  }, []);

  /** 原生 settings.mutate。 */
  const settingsMutate = useCallback(async (ns: string, ops: Array<{ op: "set"; path: string[]; value: unknown } | { op: "unset"; path: string[] }>, expectedRevision?: number) => {
    const c = pipelineRef.current?.loop.connection;
    if (!c) return false;
    try {
      const r = await c.unary("settings.mutate", {
        ns,
        ops,
        ...(expectedRevision !== undefined ? { expectedRevision } : {}),
      });
      return r.ok;
    } catch {
      return false;
    }
  }, []);

  /** 原生 agentPreset.list。 */
  const agentPresetList = useCallback(async () => {
    const c = pipelineRef.current?.loop.connection;
    if (!c) return null;
    try {
      const r = await c.unary("agentPreset.list", {});
      if (!r.ok) return null;
      const value = r.result as { presets?: unknown } | undefined;
      if (!Array.isArray(value?.presets)) return [];
      return (value.presets as Array<Record<string, unknown>>).map((p) => ({
        id: String(p.id ?? ""),
        name: String(p.name ?? p.id ?? ""),
        isDefault: p.isDefault === true,
        trust: String(p.trust ?? "user"),
        broken: typeof p.broken === "string" ? p.broken : undefined,
      }));
    } catch {
      return null;
    }
  }, []);

  /** 原生 agentPreset.select。 */
  const agentPresetSelect = useCallback(async (sessionId: string, agentPreset: string) => {
    const c = pipelineRef.current?.loop.connection;
    if (!c) return false;
    try {
      const r = await c.unary("agentPreset.select", { sessionId, agentPreset });
      return r.ok;
    } catch {
      return false;
    }
  }, []);

  /** 读取当前会话可 @ 的技能清单（skill.list）。 */
  const skillList = useCallback(async (sessionId: string): Promise<SkillEntry[] | null> => {
    const c = pipelineRef.current?.loop.connection;
    if (!c) return null;
    try {
      const r = await c.unary("skill.list", { sessionId });
      if (!r.ok) return null;
      return parseSkillList(r.result);
    } catch {
      return null;
    }
  }, []);

  const value = useMemo<ConnectionApi>(
    () => ({
      state,
      describe,
      relayPeerId,
      lastEndpoint: lastEndpointRef.current,
      lastError,
      givenUp,
      retry,
      stopRetrying,
      sessions: pipelineRef.current?.store.getSessions() ?? [],
      pending: pipelineRef.current?.store.getPendingRequests() ?? [],
      notifications,
      transcript,
      liveMessage,
      steps,
      goals,
      notificationsEnabled,
      setNotificationsEnabled,
      setGoalStatus,
      refreshSessions,
      createSession,
      connect,
      disconnect,
      sendMessage,
      sendImageMessage,
      attachment,
      respond,
      interruptStream,
      pluginList,
      pluginExec,
      hostSettingsGet,
      hostSettingsSet,
      loadHistory,
      sessionModels,
      selectModel,
      executeCommand,
      queueItems,
      jobs,
      updateQueue,
      renameSession,
      forkSession,
      workspaceList,
      archiveSession,
      searchSessions,
      settingsDescribe,
      settingsMutate,
      agentPresetList,
      agentPresetSelect,
      skillList,
    }),
    [state, describe, relayPeerId, lastError, givenUp, retry, stopRetrying, version, notifications, notificationsEnabled, goals, setGoalStatus, refreshSessions, createSession, connect, disconnect, sendMessage, sendImageMessage, attachment, respond, interruptStream, transcript, liveMessage, steps, setNotificationsEnabled, pluginList, pluginExec, hostSettingsGet, hostSettingsSet, loadHistory, sessionModels, selectModel, executeCommand, queueItems, jobs, updateQueue, renameSession, forkSession, workspaceList, archiveSession, searchSessions, settingsDescribe, settingsMutate, agentPresetList, agentPresetSelect, skillList],
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
  offline: "未连接",
  backoff: "重连中",
};
