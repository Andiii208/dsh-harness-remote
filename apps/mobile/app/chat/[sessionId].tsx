import { Stack, useLocalSearchParams, useRouter } from "expo-router";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  useWindowDimensions,
  View,
} from "react-native";
import { FlashList, type FlashListRef } from "@shopify/flash-list";
import * as ImagePicker from "expo-image-picker";
import { useConnection } from "../../src/transport/ConnectionProvider";
import { useI18n } from "../../src/i18n";
import type { QueueItem, TranscriptMessage } from "../../src/data/SessionStore";
import type { TranscriptStep } from "../../src/data/transcriptSteps";
import { filterSkills, type SkillEntry } from "../../src/data/skillList";
import { estimateBase64Bytes, resolveImageMediaType } from "../../src/data/imageMessage";
import { shouldStickToBottom } from "../../src/ui/chat/stickyBottom";
import { availableCommands, queueEditPayload } from "../../src/ui/chat/composerCommands";
import { buildTranscriptRows, type TranscriptRow } from "../../src/ui/chat/chatTimeline";
import { font, radius, space } from "../../src/theme";
import { MessageBubble } from "../../src/ui/chat/MessageBubble";
import { TrajectoryView } from "../../src/ui/trajectory/TrajectoryView";
import { SkeletonRow } from "../../src/ui/SkeletonRow";
import { EmptyState } from "../../src/ui/EmptyState";
import { Button } from "../../src/ui/Button";
import { SectionLabel } from "../../src/ui/SectionLabel";
import { useTheme } from "../../src/theme-context";
import { haptic } from "../../src/ui/haptics";

export default function ChatScreen() {
  const { sessionId } = useLocalSearchParams<{ sessionId: string }>();
  const id = Array.isArray(sessionId) ? sessionId[0] : sessionId;
  const { colors } = useTheme();
  const { t } = useI18n();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const { sessions, transcript, liveMessage, steps: stepsFor, sendMessage, sendImageMessage, state, interruptStream, loadHistory, sessionModels, selectModel, executeCommand, queueItems, jobs, updateQueue, goals, setGoalStatus, agentPresetList, agentPresetSelect, skillList } = useConnection();
  const { width: pageWidth } = useWindowDimensions();
  const router = useRouter();
  const [draft, setDraft] = useState("");
  const [sendError, setSendError] = useState("");
  const [failedDraft, setFailedDraft] = useState("");
  const [showJump, setShowJump] = useState(false);
  const [stickyToBottom, setStickyToBottom] = useState(true);
  const [streamPaused, setStreamPaused] = useState(false);
  const [pauseHint, setPauseHint] = useState("");
  const [pausedData, setPausedData] = useState<TranscriptMessage[] | null>(null);
  const [promptMode, setPromptMode] = useState<"queue" | "steer">("queue");
  const [showContextSheet, setShowContextSheet] = useState(false);
  const [showJobsSheet, setShowJobsSheet] = useState(false);
  const [showCommandPanel, setShowCommandPanel] = useState(false);
  const [editQueueItem, setEditQueueItem] = useState<QueueItem | null>(null);
  const [queueEditText, setQueueEditText] = useState("");
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [goalEditVisible, setGoalEditVisible] = useState(false);
  const [goalEditText, setGoalEditText] = useState("");
  const [showModelPicker, setShowModelPicker] = useState(false);
  const [modelsData, setModelsData] = useState<{ current: { provider: string; model: string; reasoningEffort?: string }; groups: Array<{ id: string; name: string; models: Array<{ id: string; name: string; reasoning?: { efforts?: Array<{ id: string; name: string }>; defaultEffort?: string } }> }> } | null>(null);
  const [showPermissionPicker, setShowPermissionPicker] = useState(false);
  const [showPresetPicker, setShowPresetPicker] = useState(false);
  const [presets, setPresets] = useState<Array<{ id: string; name: string; isDefault: boolean; trust: string; broken?: string }>>([]);
  const [presetLoading, setPresetLoading] = useState(false);
  const [skills, setSkills] = useState<SkillEntry[] | null>(null);
  const [showSkillPicker, setShowSkillPicker] = useState(false);
  const [showHeaderMenu, setShowHeaderMenu] = useState(false);
  const [skillQuery, setSkillQuery] = useState("");
  const [sendingImage, setSendingImage] = useState(false);
  const showJumpRef = useRef(false);
  const listRef = useRef<FlashListRef<TranscriptRow> | null>(null);
  const trajectoryRef = useRef<FlashListRef<TranscriptStep> | null>(null);
  const swipeRef = useRef<ScrollView | null>(null);
  const historyLoadedFor = useRef<string | null>(null);
  const [viewMode, setViewMode] = useState<"chat" | "trajectory">("chat");
  const messages = id ? transcript(id) : [];
  const live = id ? liveMessage(id) : undefined;
  const liveId = live?.id;
  const steps = id ? stepsFor(id) : [];

  // 进入会话时，如果有在线连接，加载历史消息；仅在该会话加载成功后标记，支持失败重试。
  useEffect(() => {
    if (!id || state !== "online") {
      historyLoadedFor.current = null;
      return;
    }
    if (historyLoadedFor.current === id) return;
    let cancelled = false;
    void loadHistory(id, 500).then((ok) => {
      if (!cancelled && ok) historyLoadedFor.current = id;
    });
    return () => {
      cancelled = true;
    };
  }, [id, state, loadHistory]);

  // 技能清单：宿主支持且返回非空时展示「技能」按钮；读不到/null 自动隐藏。
  useEffect(() => {
    if (!id || state !== "online") {
      setSkills(null);
      return;
    }
    let cancelled = false;
    setSkills(null);
    void skillList(id).then((list) => {
      if (!cancelled) setSkills(list);
    });
    return () => {
      cancelled = true;
    };
  }, [id, state, skillList]);

  const summary = id ? sessions.find((s) => s.id === id) : undefined;
  const queue = id ? queueItems(id) : [];
  const sessionJobs = id ? jobs(id) : [];
  const activeJobs = sessionJobs.filter((j) => j.status === "running" || j.status === "stopping");

  const goalRef = summary?.goalRef;
  const goalBusy = useRef(false);
  const [goalError, setGoalError] = useState("");

  const doGoalAction = async (action: "pause" | "resume" | "complete") => {
    if (!id || !goalRef || goalBusy.current) return;
    goalBusy.current = true;
    setGoalError("");
    try {
      let ok = false;
      if (action === "pause") ok = await goals.pause(id, goalRef);
      else if (action === "resume") ok = await goals.resume(id, goalRef);
      else if (action === "complete") ok = await goals.complete(id, goalRef);
      if (ok) {
        setGoalStatus(id, action === "pause" ? "paused" : action === "resume" ? "active" : "complete");
        void haptic("light");
      } else {
        setGoalError("目标操作未被主机确认");
        void haptic("error");
      }
    } catch {
      setGoalError("目标操作失败：连接异常");
      void haptic("error");
    } finally {
      goalBusy.current = false;
    }
  };

  const doQueueAction = async (itemId: string, action: { kind: "edit"; content: Array<{ type: "text"; text: string }> } | { kind: "remove" } | { kind: "steer" }) => {
    if (!id) return;
    const ok = await updateQueue(id, itemId, action);
    if (ok) void haptic("light");
    else void haptic("error");
  };

  const openModelPicker = async () => {
    if (!id) return;
    const data = await sessionModels(id);
    if (data) {
      setModelsData(data);
      setShowModelPicker(true);
    } else {
      void haptic("error");
    }
  };

  const pickModel = async (provider: string, model: string, reasoningEffort?: string) => {
    if (!id) return;
    const ok = await selectModel(id, provider, model, reasoningEffort);
    if (ok) {
      void haptic("light");
      setShowModelPicker(false);
    } else {
      void haptic("error");
    }
  };

  /** 选择一个模型，并带上默认思考强度（DSH Web 的行为）。 */
  const pickModelWithDefaultEffort = async (group: { id: string; models: Array<{ id: string; name: string; reasoning?: { defaultEffort?: string } }> }, m: { id: string; name: string; reasoning?: { defaultEffort?: string } }) => {
    await pickModel(group.id, m.id, m.reasoning?.defaultEffort);
  };

  const openPresetPicker = async () => {
    if (!id) return;
    setPresetLoading(true);
    setShowPresetPicker(true);
    const list = await agentPresetList();
    if (list) setPresets(list);
    setPresetLoading(false);
  };

  const applyPreset = async (presetId: string) => {
    if (!id) return;
    const ok = await agentPresetSelect(id, presetId);
    if (ok) {
      void haptic("light");
      setShowPresetPicker(false);
    } else {
      void haptic("error");
    }
  };

  const pickSkill = (name: string) => {
    setDraft((prev) => {
      const base = prev.endsWith("@") ? prev.slice(0, -1) : prev;
      return `${base}${base.length > 0 && !base.endsWith(" ") ? " " : ""}@${name} `;
    });
    setShowSkillPicker(false);
    void haptic("light");
  };

  const pickImage = async () => {
    if (!id || !online || sendingImage) return;
    setSendingImage(true);
    setSendError("");
    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ["images"],
        base64: true,
        quality: 1,
        allowsMultipleSelection: false,
      });
      if (result.canceled) return;
      const asset = result.assets[0];
      if (!asset) return;
      if (typeof asset.base64 !== "string" || asset.base64.length === 0) {
        setSendError("图片读取失败：未获得图片数据");
        return;
      }
      const mediaType = resolveImageMediaType({
        mimeType: asset.mimeType,
        fileName: asset.fileName,
        uri: asset.uri,
      });
      if (!mediaType) {
        setSendError("不支持的图片格式（仅支持 PNG/JPEG/WebP/GIF）");
        return;
      }
      const limits = summary?.imageLimits;
      if (limits) {
        if (!limits.mediaTypes.includes(mediaType)) {
          setSendError(`宿主未开放 ${mediaType}，允许：${limits.mediaTypes.join(" / ")}`);
          return;
        }
        if (asset.width > 0 && asset.height > 0 && asset.width * asset.height > limits.maxImagePixels) {
          setSendError(`图片超过宿主像素限制（最大 ${limits.maxImagePixels.toLocaleString()} 像素）`);
          return;
        }
        const bytes = typeof asset.fileSize === "number" && asset.fileSize > 0
          ? asset.fileSize
          : estimateBase64Bytes(asset.base64);
        if (bytes > limits.maxImageBytes || bytes > limits.maxMessageImageBytes) {
          setSendError(`图片超过宿主大小限制（最大 ${(limits.maxImageBytes / 1024 / 1024).toFixed(1)}MB）`);
          return;
        }
      }
      await sendImageMessage(id, {
        mediaType,
        data: asset.base64,
        name: asset.fileName ?? undefined,
      });
      void haptic("light");
    } catch (err) {
      setSendError(err instanceof Error ? err.message : "图片发送失败");
    } finally {
      setSendingImage(false);
    }
  };

  const openPermissionPicker = () => {
    setShowPermissionPicker(true);
  };

  const permissionOptions = summary?.permissionOptions ?? ["read-only", "workspace-write", "danger-full-access"];
  const permissionCurrent = summary?.permissionCurrent;

  const applyPermission = async (preset: string) => {
    if (!id) return;
    void haptic("light");
    const r = await executeCommand(id, `/permission ${preset}`);
    if (r?.ok) {
      setShowPermissionPicker(false);
    } else {
      void haptic("error");
    }
  };

  const online = state === "online";

  const earliestSeq = messages.reduce<number | undefined>(
    (min, m) => (m.seq !== undefined && (min === undefined || m.seq < min) ? m.seq : min),
    undefined,
  );

  const handleDraftChange = (text: string) => {
    setDraft(text);
    if (text.endsWith("/") && online) setShowCommandPanel(true);
    if (text.endsWith("@") && online && skills && skills.length > 0) {
      setSkillQuery("");
      setShowSkillPicker(true);
    }
    if (!text.endsWith("/") && !text.endsWith("@")) setShowCommandPanel(false);
  };

  const loadOlderHistory = async () => {
    if (!id || !online || loadingHistory) return;
    setLoadingHistory(true);
    try {
      await loadHistory(id, 500, earliestSeq);
    } finally {
      setLoadingHistory(false);
    }
  };

  const runQueueEdit = async () => {
    if (!id || !editQueueItem) return;
    const text = queueEditText.trim();
    if (!text) return;
    const ok = await updateQueue(id, editQueueItem.id, queueEditPayload(text));
    if (ok) {
      void haptic("light");
      setEditQueueItem(null);
    } else {
      void haptic("error");
    }
  };

  const runGoalEdit = async () => {
    if (!id || !goalRef) return;
    const objective = goalEditText.trim();
    if (!objective) return;
    const ok = await goals.edit(id, goalRef, { objective });
    if (ok) {
      setGoalStatus(id, summary?.goalStatus ?? "active");
      setGoalEditVisible(false);
      void haptic("light");
    } else {
      void haptic("error");
    }
  };

  const formatJobDuration = (j: { startedAt: number; finishedAt?: number }) => {
    const end = j.finishedAt ?? Date.now();
    const ms = Math.max(0, end - j.startedAt);
    if (ms < 1000) return `${ms}ms`;
    if (ms < 60_000) return `${(ms / 1000).toFixed(1)}s`;
    return `${Math.floor(ms / 60_000)}m ${Math.round((ms % 60_000) / 1000)}s`;
  };

  const commandItems = availableCommands(online);

  const pickCommand = (command: string) => {
    setDraft((prev) => (prev.endsWith("/") ? prev.slice(0, -1) : prev));
    setShowCommandPanel(false);
    if (command === "permission") {
      setShowPermissionPicker(true);
    } else if (command === "queue") {
      setPromptMode("queue");
      void haptic("light");
    } else if (command === "steer") {
      setPromptMode("steer");
      void haptic("light");
    }
  };

  useEffect(() => {
    setStreamPaused(false); // 新一轮流式开始时恢复渲染
    setPauseHint("");
    setPausedData(null);
  }, [liveId]);
  const data = streamPaused ? (pausedData ?? messages) : live ? [...messages, live] : messages;
  const rows = useMemo(() => buildTranscriptRows(data), [data]);
  const filteredSkills = skills ? filterSkills(skills, skillQuery) : [];
  const goalStatus = summary?.goalStatus;
  const goalLabel =
    goalStatus === "active" ? t.chat.goalRunning : goalStatus === "paused" ? t.chat.goalPaused : goalStatus === "completed" ? t.chat.goalCompleted : goalStatus;
  const turnCount = steps.filter((s) => s.type === "turn").length;
  const stepCount = steps.length;

  // 当前选中模型所在分组与思考强度列表（原生 session.models 返回，不用写死）
  const currentModelGroup = modelsData?.groups.find((g) => g.id === modelsData?.current.provider);
  const currentModelInfo = currentModelGroup?.models.find((m) => m.id === modelsData?.current.model);
  const reasoningEfforts = currentModelInfo?.reasoning?.efforts ?? [];
  const selectedReasoningEffort = modelsData?.current.reasoningEffort ?? currentModelInfo?.reasoning?.defaultEffort;

  // 新消息到达时滚到底部（仅当用户仍停留在底部附近，不打断浏览历史）。
  useEffect(() => {
    if (viewMode === "chat" && data.length > 0 && stickyToBottom) {
      listRef.current?.scrollToEnd({ animated: data.length <= 4 });
    }
  }, [data.length, stickyToBottom, viewMode]);

  const jumpToBottom = () => {
    setStickyToBottom(true);
    listRef.current?.scrollToEnd({ animated: true });
    void haptic("light");
  };

  const switchView = (mode: "chat" | "trajectory") => {
    setViewMode(mode);
    swipeRef.current?.scrollTo({ x: mode === "chat" ? 0 : pageWidth, animated: true });
    void haptic("light");
  };

  const onSwipeEnd = (e: { nativeEvent: { contentOffset: { x: number } } }) => {
    const next = e.nativeEvent.contentOffset.x >= pageWidth * 0.5 ? "trajectory" : "chat";
    setViewMode(next);
  };

  const onScroll = (e: { nativeEvent: { contentOffset: { y: number }; layoutMeasurement: { height: number }; contentSize: { height: number } } }) => {
    const { contentOffset, layoutMeasurement, contentSize } = e.nativeEvent;
    const distance = contentSize.height - (contentOffset.y + layoutMeasurement.height);
    const shouldShow = showJumpRef.current ? distance > 280 : distance > 360;
    if (shouldShow !== showJumpRef.current) {
      showJumpRef.current = shouldShow;
      setShowJump(shouldShow);
    }
    const nearBottom = shouldStickToBottom(distance);
    if (nearBottom !== stickyToBottom) setStickyToBottom(nearBottom);
    // M5：滚动到顶自动向前翻页（beforeSeq 取当前最早 seq）。
    if (contentOffset.y < 60) void loadOlderHistory();
  };

  const sendText = async (raw: string) => {
    const text = raw.trim();
    if (!text || !id || !online) return;
    setDraft("");
    setSendError("");
    setFailedDraft("");
    void haptic("light");
    try {
      await sendMessage(id, text, promptMode);
    } catch (err) {
      setDraft(text);
      setFailedDraft(text);
      setSendError(err instanceof Error ? err.message : "发送失败");
    }
  };

  const send = async () => {
    await sendText(draft);
  };

  const retrySend = async () => {
    if (!failedDraft) return;
    await sendText(failedDraft);
  };

  // Phase 1：暂停流式 = 先发 session.interrupt，失败才回退本地暂停。
  const togglePause = async () => {
    if (streamPaused) {
      setStreamPaused(false);
      setPausedData(null);
      setPauseHint("");
      void haptic("light");
      return;
    }
    if (!id) return;
    void haptic("light");
    // H3：暂停前把已显示的 live 内容冻结进快照，暂停期间不抹掉已显示部分。
    setPausedData(live ? [...messages, live] : messages);
    try {
      await interruptStream(id);
      setStreamPaused(true);
      setPauseHint("已发送中断请求");
    } catch {
      setStreamPaused(true);
      setPauseHint("发送中断失败，已回退本地暂停（远端可能仍在继续）");
    }
  };

  return (
    <KeyboardAvoidingView
      style={styles.screen}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
      keyboardVerticalOffset={90}
    >
      <Stack.Screen
        options={{
          title: summary?.title ?? id ?? "对话",
          headerBackTitle: "返回",
          headerRight: () => <ChatHeaderRight state={state} onPressMenu={() => setShowHeaderMenu(true)} />,
        }}
      />
      <View style={styles.switchBar}>
        <Pressable
          style={[styles.switchTabBtn, viewMode === "chat" && styles.switchTabBtnActive]}
          onPress={() => switchView("chat")}
          accessibilityRole="button"
          accessibilityLabel={t.chat.tabChat}
        >
          <Text style={[styles.switchTabText, viewMode === "chat" && styles.switchTabTextActive]}>{t.chat.tabChat}</Text>
        </Pressable>
        <Pressable
          style={[styles.switchTabBtn, viewMode === "trajectory" && styles.switchTabBtnActive]}
          onPress={() => switchView("trajectory")}
          accessibilityRole="button"
          accessibilityLabel={t.chat.tabTrajectory}
        >
          <Text style={[styles.switchTabText, viewMode === "trajectory" && styles.switchTabTextActive]}>{t.chat.tabTrajectory}</Text>
        </Pressable>
      </View>
      <View style={styles.viewContainer}>
        <ScrollView
          ref={swipeRef}
          horizontal
          pagingEnabled
          showsHorizontalScrollIndicator={false}
          onMomentumScrollEnd={onSwipeEnd}
          style={styles.swiper}
          contentContainerStyle={styles.swiperContent}
        >
          <View style={[styles.swiperPage, { width: pageWidth }]}>
            <FlashList
              ref={listRef}
        style={styles.list}
        contentContainerStyle={styles.listContent}
        data={rows}
        keyExtractor={(row) => row.key}
        ListHeaderComponent={
          <View style={styles.listHeader}>
            <View style={styles.sessionHeader}>
              {loadingHistory && (
                <View style={styles.jobsRow}>
                  <Text style={styles.jobsText}>正在加载历史…</Text>
                </View>
              )}
              {activeJobs.length > 0 && (
                <Pressable
                  style={({ pressed }) => [styles.jobsRow, pressed && styles.modelItemPressed]}
                  onPress={() => setShowJobsSheet(true)}
                  accessibilityRole="button"
                  accessibilityLabel="查看后台任务"
                >
                  <Text style={styles.jobsText} numberOfLines={1}>
                    后台任务 · {activeJobs[0]?.label}
                    {activeJobs.length > 1 ? ` +${activeJobs.length - 1}` : ""}
                  </Text>
                </Pressable>
              )}

              {summary?.goalObjective !== undefined || goalStatus !== undefined ? (
                <View style={styles.goalBar}>
                  <View style={styles.goalBarHeader}>
                    <Text style={styles.goalBarTitle} numberOfLines={1}>
                      {goalStatus ? `${t.chat.goal} · ${goalLabel}` : t.chat.goal}
                    </Text>
                    <View style={styles.goalBarActions}>
                      {goalRef ? (
                        <Pressable
                          onPress={() => {
                            setGoalEditText(summary?.goalObjective ?? "");
                            setGoalEditVisible(true);
                          }}
                          hitSlop={6}
                          accessibilityRole="button"
                          accessibilityLabel="编辑目标"
                        >
                          <Text style={styles.goalBarAction}>编辑</Text>
                        </Pressable>
                      ) : null}
                      {(goalStatus === "active" || goalStatus === "paused") && goalRef ? (
                        <>
                          {goalStatus === "active" ? (
                            <Pressable onPress={() => void doGoalAction("pause")} hitSlop={6} accessibilityRole="button" accessibilityLabel="暂停目标">
                              <Text style={styles.goalBarAction}>暂停</Text>
                            </Pressable>
                          ) : (
                            <Pressable onPress={() => void doGoalAction("resume")} hitSlop={6} accessibilityRole="button" accessibilityLabel="恢复目标">
                              <Text style={styles.goalBarAction}>恢复</Text>
                            </Pressable>
                          )}
                          <Pressable onPress={() => void doGoalAction("complete")} hitSlop={6} accessibilityRole="button" accessibilityLabel="完成目标">
                            <Text style={styles.goalBarAction}>完成</Text>
                          </Pressable>
                        </>
                      ) : null}
                    </View>
                  </View>
                  {summary?.plan !== undefined && (
                    <View style={styles.planBadge}>
                      <Text style={styles.planBadgeText}>计划模式</Text>
                    </View>
                  )}
                  {summary?.goalObjective !== undefined && (
                    <Text style={styles.goalBarObjective} numberOfLines={2}>
                      {summary.goalObjective}
                    </Text>
                  )}
                  {summary?.todos !== undefined && summary.todos.length > 0 && (
                    <View style={styles.todosBlock}>
                      {summary.todos.map((todo, i) => (
                        <View key={`${todo.content}-${i}`} style={styles.todoRow}>
                          <Text style={styles.todoCheck}>{todo.status === "completed" ? "☑" : "☐"}</Text>
                          <Text style={[styles.todoText, todo.status === "completed" && styles.todoTextDone]} numberOfLines={2}>
                            {todo.content}
                          </Text>
                        </View>
                      ))}
                    </View>
                  )}
                  {goalError.length > 0 && <Text style={styles.goalBarError}>{goalError}</Text>}
                </View>
              ) : null}

              {queue.length > 0 && (
                <View style={styles.queueBanner}>
                  <Text style={styles.queueTitle}>{t.chat.queueTitle}</Text>
                  {queue.map((q) => (
                    <View key={q.id} style={styles.queueRow}>
                      <Pressable
                        style={{ flex: 1 }}
                        onPress={() => setDraft(q.text)}
                        accessibilityRole="button"
                        accessibilityLabel="填入输入框"
                      >
                        <Text style={styles.queueText} numberOfLines={1}>{q.text}</Text>
                      </Pressable>
                      <Pressable
                        onPress={() => { setEditQueueItem(q); setQueueEditText(q.text); }}
                        hitSlop={6}
                        accessibilityRole="button"
                        accessibilityLabel="编辑"
                      >
                        <Text style={styles.queueAction}>编辑</Text>
                      </Pressable>
                      {q.placement !== "steering" && (
                        <Pressable onPress={() => void doQueueAction(q.id, { kind: "steer" })} hitSlop={6} accessibilityRole="button" accessibilityLabel="立即执行">
                          <Text style={styles.queueAction}>{t.chat.execute}</Text>
                        </Pressable>
                      )}
                      <Pressable onPress={() => void doQueueAction(q.id, { kind: "remove" })} hitSlop={6} accessibilityRole="button" accessibilityLabel="移除">
                        <Text style={[styles.queueAction, { color: colors.danger }]}>{t.chat.remove}</Text>
                      </Pressable>
                    </View>
                  ))}
                </View>
              )}
            </View>
          </View>
        }
        renderItem={({ item, index }) =>
          item.kind === "day" ? (
            <View style={styles.dayDivider}>
              <Text style={styles.dayDividerText}>{item.label}</Text>
            </View>
          ) : (
            <View>
              <MessageBubble m={item.message} live={item.message.id === live?.id} sessionId={id} />
            </View>
          )
        }
        onScroll={onScroll}
        scrollEventThrottle={64}
        ListEmptyComponent={
          state === "connecting" || state === "backoff" ? (
            <View style={styles.skeletonStack}>
              <SkeletonRow />
              <SkeletonRow />
            </View>
          ) : online ? (
            <EmptyState eyebrow="NO MESSAGES" text={t.chat.noMessagesText} />
          ) : (
            <EmptyState
              eyebrow="OFFLINE"
              text={t.chat.offlineText}
              action={<Button label={t.common.goConnect} onPress={() => router.push("/")} full />}
            />
          )
        }
      />
          </View>
          <View style={[styles.swiperPage, { width: pageWidth }]}>
            <TrajectoryView steps={steps} listRef={trajectoryRef} />
          </View>
        </ScrollView>
      </View>
      {showJump && (
        <View style={styles.jumpFabWrap}>
          <Pressable style={styles.jumpFab} onPress={jumpToBottom} accessibilityRole="button" accessibilityLabel={t.chat.jumpToBottom}>
            <Text style={styles.jumpFabText}>↓</Text>
          </Pressable>
        </View>
      )}

      {/* 会话头部菜单 */}
      <Modal visible={showHeaderMenu} transparent animationType="fade" onRequestClose={() => setShowHeaderMenu(false)}>
        <View style={styles.modalBackdrop}>
          <Pressable style={StyleSheet.absoluteFill} onPress={() => setShowHeaderMenu(false)} accessibilityRole="button" accessibilityLabel="关闭菜单" />
          <View style={styles.menuPanel}>
            <Text style={styles.menuTitle}>会话</Text>
            {online && (
              <Pressable
                style={({ pressed }) => [styles.modelItem, pressed && styles.modelItemPressed]}
                onPress={() => { setShowHeaderMenu(false); void loadHistory(id, 500); }}
                accessibilityRole="button"
                accessibilityLabel="重新加载历史"
              >
                <Text style={styles.modelItemName}>重新加载历史</Text>
              </Pressable>
            )}
            <Pressable
              style={({ pressed }) => [styles.modelItem, pressed && styles.modelItemPressed]}
              onPress={() => setShowHeaderMenu(false)}
              accessibilityRole="button"
              accessibilityLabel={t.common.cancel}
            >
              <Text style={[styles.modelItemName, { color: colors.textMuted }]}>{t.common.cancel}</Text>
            </Pressable>
          </View>
        </View>
      </Modal>

      {/* 模型选择器弹窗 */}
      <Modal visible={showModelPicker} transparent animationType="fade" onRequestClose={() => setShowModelPicker(false)}>
        <View style={styles.modalBackdrop}>
          <Pressable style={StyleSheet.absoluteFill} onPress={() => setShowModelPicker(false)} accessibilityRole="button" accessibilityLabel={t.chat.closeModel} />
          <View style={styles.menuPanel}>
            <Text style={styles.menuTitle}>{t.chat.chooseModel}</Text>
            {modelsData ? (
              <ScrollView style={{ maxHeight: 400 }}>
                {modelsData.groups.map((group) => (
                  <View key={group.id} style={{ marginBottom: 12 }}>
                    <Text style={styles.modelGroupName}>{group.name}</Text>
                    {group.models.map((m) => (
                      <Pressable
                        key={m.id}
                        style={({ pressed }) => [styles.modelItem, pressed && styles.modelItemPressed]}
                        onPress={() => void pickModelWithDefaultEffort(group, m)}
                        accessibilityRole="button"
                        accessibilityLabel={m.name}
                      >
                        <Text style={styles.modelItemName}>{m.name}</Text>
                        {modelsData.current.model === m.id && modelsData.current.provider === group.id && (
                          <Text style={styles.modelItemTick}>✓</Text>
                        )}
                      </Pressable>
                    ))}
                  </View>
                ))}
                {reasoningEfforts.length > 0 && (
                  <View>
                    <Text style={styles.modelGroupName}>{t.chat.thinkingEffort}</Text>
                    {reasoningEfforts.map((effort) => (
                      <Pressable
                        key={effort.id}
                        style={({ pressed }) => [styles.modelItem, pressed && styles.modelItemPressed]}
                        onPress={() => {
                          if (modelsData.current.model) {
                            void pickModel(modelsData.current.provider, modelsData.current.model, effort.id);
                          }
                        }}
                        accessibilityRole="button"
                        accessibilityLabel={effort.name}
                      >
                        <Text style={styles.modelItemName}>{effort.name}</Text>
                        {selectedReasoningEffort === effort.id && (
                          <Text style={styles.modelItemTick}>✓</Text>
                        )}
                      </Pressable>
                    ))}
                  </View>
                )}
              </ScrollView>
            ) : (
              <Text style={styles.modelItemName}>{t.common.loading}</Text>
            )}
            <Pressable
              style={({ pressed }) => [styles.modelItem, pressed && styles.modelItemPressed]}
              onPress={() => setShowModelPicker(false)}
            >
              <Text style={[styles.modelItemName, { color: colors.textMuted }]}>{t.common.cancel}</Text>
            </Pressable>
          </View>
        </View>
      </Modal>

      {/* 权限选择器弹窗 */}
      <Modal visible={showPermissionPicker} transparent animationType="fade" onRequestClose={() => setShowPermissionPicker(false)}>
        <View style={styles.modalBackdrop}>
          <Pressable style={StyleSheet.absoluteFill} onPress={() => setShowPermissionPicker(false)} accessibilityRole="button" accessibilityLabel={t.chat.closePermission} />
          <View style={styles.menuPanel}>
            <Text style={styles.menuTitle}>{t.chat.choosePermission}</Text>
            {permissionOptions.map((preset) => (
              <Pressable
                key={preset}
                style={({ pressed }) => [styles.modelItem, pressed && styles.modelItemPressed]}
                onPress={() => void applyPermission(preset)}
                accessibilityRole="button"
                accessibilityLabel={preset}
              >
                <Text style={styles.modelItemName}>{preset}</Text>
                {permissionCurrent === preset && (
                  <Text style={styles.modelItemTick}>✓</Text>
                )}
              </Pressable>
            ))}
            <Pressable
              style={({ pressed }) => [styles.modelItem, pressed && styles.modelItemPressed]}
              onPress={() => setShowPermissionPicker(false)}
            >
              <Text style={[styles.modelItemName, { color: colors.textMuted }]}>{t.common.cancel}</Text>
            </Pressable>
          </View>
        </View>
      </Modal>

      {/* Agent 预设选择器弹窗 */}
      <Modal visible={showPresetPicker} transparent animationType="fade" onRequestClose={() => setShowPresetPicker(false)}>
        <View style={styles.modalBackdrop}>
          <Pressable style={StyleSheet.absoluteFill} onPress={() => setShowPresetPicker(false)} accessibilityRole="button" accessibilityLabel={t.chat.closePreset} />
          <View style={styles.menuPanel}>
            <Text style={styles.menuTitle}>{t.chat.choosePreset}</Text>
            {presetLoading ? (
              <Text style={styles.modelItemName}>{t.common.loading}</Text>
            ) : presets.length === 0 ? (
              <Text style={styles.modelItemName}>{t.chat.loadingPresets}</Text>
            ) : (
              presets.map((p) => (
                <Pressable
                  key={p.id}
                  style={({ pressed }) => [styles.modelItem, pressed && styles.modelItemPressed]}
                  onPress={() => void applyPreset(p.id)}
                  accessibilityRole="button"
                  accessibilityLabel={p.name}
                >
                  <Text style={styles.modelItemName}>
                    {p.name}{p.isDefault ? " · 默认" : ""}{p.broken ? " · 不可用" : ""}
                  </Text>
                </Pressable>
              ))
            )}
            <Pressable
              style={({ pressed }) => [styles.modelItem, pressed && styles.modelItemPressed]}
              onPress={() => setShowPresetPicker(false)}
            >
              <Text style={[styles.modelItemName, { color: colors.textMuted }]}>{t.common.cancel}</Text>
            </Pressable>
          </View>
        </View>
      </Modal>

      {/* 技能选择器弹窗 */}
      <Modal visible={showSkillPicker} transparent animationType="fade" onRequestClose={() => setShowSkillPicker(false)}>
        <View style={styles.modalBackdrop}>
          <Pressable style={StyleSheet.absoluteFill} onPress={() => setShowSkillPicker(false)} accessibilityRole="button" accessibilityLabel={t.chat.closeSkill} />
          <View style={styles.menuPanel}>
            <Text style={styles.menuTitle}>{t.chat.chooseSkill}</Text>
            {skills && skills.length > 0 ? (
              <>
                <TextInput
                  style={styles.skillSearch}
                  placeholder={t.chat.searchSkillPlaceholder}
                  placeholderTextColor={colors.textDim}
                  value={skillQuery}
                  onChangeText={setSkillQuery}
                  autoCorrect={false}
                  autoCapitalize="none"
                />
                {filteredSkills.length > 0 ? (
                  <ScrollView style={{ maxHeight: 400 }}>
                    {filteredSkills.map((s) => (
                      <Pressable
                        key={s.name}
                        style={({ pressed }) => [styles.modelItem, pressed && styles.modelItemPressed]}
                        onPress={() => pickSkill(s.name)}
                        accessibilityRole="button"
                        accessibilityLabel={`@${s.name}`}
                      >
                        <View style={{ flex: 1, gap: 3 }}>
                          <Text style={styles.modelItemName}>@{s.name}</Text>
                          {s.description.length > 0 && (
                            <Text style={styles.skillDescription} numberOfLines={2}>{s.description}</Text>
                          )}
                          {s.whenToUse !== undefined && s.whenToUse.length > 0 && (
                            <Text style={styles.skillWhenToUse} numberOfLines={2}>{s.whenToUse}</Text>
                          )}
                        </View>
                      </Pressable>
                    ))}
                  </ScrollView>
                ) : (
                  <Text style={styles.modelItemName}>{t.chat.noMatchSkills}</Text>
                )}
              </>
            ) : (
              <Text style={styles.modelItemName}>{t.chat.noSkills}</Text>
            )}
            <Pressable
              style={({ pressed }) => [styles.modelItem, pressed && styles.modelItemPressed]}
              onPress={() => setShowSkillPicker(false)}
            >
              <Text style={[styles.modelItemName, { color: colors.textMuted }]}>{t.common.cancel}</Text>
            </Pressable>
          </View>
        </View>
      </Modal>

      {/* M4：/ 命令面板 */}
      <Modal visible={showCommandPanel} transparent animationType="fade" onRequestClose={() => setShowCommandPanel(false)}>
        <View style={styles.modalBackdrop}>
          <Pressable style={StyleSheet.absoluteFill} onPress={() => setShowCommandPanel(false)} accessibilityRole="button" accessibilityLabel="关闭命令面板" />
          <View style={styles.menuPanel}>
            <Text style={styles.menuTitle}>命令</Text>
            {commandItems.map((c) => (
              <Pressable
                key={c.id}
                style={({ pressed }) => [styles.modelItem, pressed && styles.modelItemPressed]}
                onPress={() => pickCommand(c.id)}
                accessibilityRole="button"
                accessibilityLabel={c.label}
              >
                <View style={{ flex: 1, gap: 3 }}>
                  <Text style={styles.modelItemName}>{c.label}</Text>
                  <Text style={styles.skillDescription}>{c.hint}</Text>
                </View>
              </Pressable>
            ))}
            <Pressable
              style={({ pressed }) => [styles.modelItem, pressed && styles.modelItemPressed]}
              onPress={() => setShowCommandPanel(false)}
            >
              <Text style={[styles.modelItemName, { color: colors.textMuted }]}>{t.common.cancel}</Text>
            </Pressable>
          </View>
        </View>
      </Modal>

      {/* M3：上下文用量 Sheet */}
      <Modal visible={showContextSheet} transparent animationType="fade" onRequestClose={() => setShowContextSheet(false)}>
        <View style={styles.modalBackdrop}>
          <Pressable style={StyleSheet.absoluteFill} onPress={() => setShowContextSheet(false)} accessibilityRole="button" accessibilityLabel="关闭上下文用量" />
          <View style={styles.menuPanel}>
            <Text style={styles.menuTitle}>上下文用量</Text>
            <View style={styles.contextSheetRow}>
              <Text style={styles.modelItemName}>当前占用</Text>
              <Text style={styles.contextSheetValue}>{summary?.contextPercent ?? 0}%</Text>
            </View>
            {summary?.tokenUsageTotal !== undefined && (
              <View style={styles.contextSheetRow}>
                <Text style={styles.modelItemName}>Token 总量</Text>
                <Text style={styles.contextSheetValue}>{summary.tokenUsageTotal}</Text>
              </View>
            )}
            <Text style={styles.skillDescription}>数据来自会话投影（contextPressure / tokenUsage），由宿主实时推送。</Text>
            <Pressable
              style={({ pressed }) => [styles.modelItem, pressed && styles.modelItemPressed]}
              onPress={() => setShowContextSheet(false)}
            >
              <Text style={[styles.modelItemName, { color: colors.textMuted }]}>{t.common.cancel}</Text>
            </Pressable>
          </View>
        </View>
      </Modal>

      {/* M6：后台任务 Sheet（只读；宿主未提供停止 RPC） */}
      <Modal visible={showJobsSheet} transparent animationType="fade" onRequestClose={() => setShowJobsSheet(false)}>
        <View style={styles.modalBackdrop}>
          <Pressable style={StyleSheet.absoluteFill} onPress={() => setShowJobsSheet(false)} accessibilityRole="button" accessibilityLabel="关闭后台任务" />
          <View style={styles.menuPanel}>
            <Text style={styles.menuTitle}>后台任务</Text>
            {sessionJobs.length === 0 ? (
              <Text style={styles.modelItemName}>暂无后台任务</Text>
            ) : (
              sessionJobs.map((j) => (
                <View key={j.id} style={styles.jobSheetRow}>
                  <View style={{ flex: 1, gap: 3 }}>
                    <Text style={styles.modelItemName}>{j.label}</Text>
                    <Text style={styles.skillDescription}>{j.kind} · {j.status} · {formatJobDuration(j)}</Text>
                    {j.detail !== undefined && <Text style={styles.skillDescription} numberOfLines={2}>{j.detail}</Text>}
                  </View>
                </View>
              ))
            )}
            <Text style={styles.skillDescription}>宿主未提供任务停止能力，此面板为只读展示。</Text>
            <Pressable
              style={({ pressed }) => [styles.modelItem, pressed && styles.modelItemPressed]}
              onPress={() => setShowJobsSheet(false)}
            >
              <Text style={[styles.modelItemName, { color: colors.textMuted }]}>{t.common.cancel}</Text>
            </Pressable>
          </View>
        </View>
      </Modal>

      {/* M8：队列编辑 */}
      <Modal visible={editQueueItem !== null} transparent animationType="fade" onRequestClose={() => setEditQueueItem(null)}>
        <View style={styles.modalBackdrop}>
          <Pressable style={StyleSheet.absoluteFill} onPress={() => setEditQueueItem(null)} accessibilityRole="button" accessibilityLabel="关闭编辑" />
          <View style={styles.menuPanel}>
            <Text style={styles.menuTitle}>编辑排队消息</Text>
            <TextInput
              style={styles.skillSearch}
              placeholder="输入新的消息内容"
              placeholderTextColor={colors.textDim}
              value={queueEditText}
              onChangeText={setQueueEditText}
              multiline
            />
            <Pressable
              style={({ pressed }) => [styles.modelItem, pressed && styles.modelItemPressed]}
              onPress={() => void runQueueEdit()}
              accessibilityRole="button"
              accessibilityLabel="保存编辑"
            >
              <Text style={styles.modelItemName}>保存</Text>
            </Pressable>
            <Pressable
              style={({ pressed }) => [styles.modelItem, pressed && styles.modelItemPressed]}
              onPress={() => setEditQueueItem(null)}
            >
              <Text style={[styles.modelItemName, { color: colors.textMuted }]}>{t.common.cancel}</Text>
            </Pressable>
          </View>
        </View>
      </Modal>

      {/* M7：目标编辑 Sheet */}
      <Modal visible={goalEditVisible} transparent animationType="fade" onRequestClose={() => setGoalEditVisible(false)}>
        <View style={styles.modalBackdrop}>
          <Pressable style={StyleSheet.absoluteFill} onPress={() => setGoalEditVisible(false)} accessibilityRole="button" accessibilityLabel="关闭目标编辑" />
          <View style={styles.menuPanel}>
            <Text style={styles.menuTitle}>编辑目标</Text>
            <TextInput
              style={styles.skillSearch}
              placeholder="输入新的目标描述"
              placeholderTextColor={colors.textDim}
              value={goalEditText}
              onChangeText={setGoalEditText}
              multiline
            />
            <Pressable
              style={({ pressed }) => [styles.modelItem, pressed && styles.modelItemPressed]}
              onPress={() => void runGoalEdit()}
              accessibilityRole="button"
              accessibilityLabel="保存目标"
            >
              <Text style={styles.modelItemName}>保存</Text>
            </Pressable>
            <Pressable
              style={({ pressed }) => [styles.modelItem, pressed && styles.modelItemPressed]}
              onPress={() => setGoalEditVisible(false)}
            >
              <Text style={[styles.modelItemName, { color: colors.textMuted }]}>{t.common.cancel}</Text>
            </Pressable>
          </View>
        </View>
      </Modal>

      <View style={styles.inputBar}>
        {(turnCount > 0 || stepCount > 0) && (
          <View style={styles.statsPillWrap}>
            <Pressable
              style={({ pressed }) => [styles.statsPill, pressed && styles.statsPillPressed]}
              onPress={() => switchView("trajectory")}
              accessibilityRole="button"
              accessibilityLabel={`${turnCount} 轮 · ${stepCount} 步，查看轨迹`}
            >
              <Text style={styles.statsPillText}>{turnCount} 轮 · {stepCount} 步</Text>
              <Text style={styles.statsPillChevron}>⌃</Text>
            </Pressable>
          </View>
        )}
        {live && (
          <View style={styles.pauseRow}>
            <Pressable
              style={({ pressed }) => [styles.pauseButton, pressed && styles.pauseButtonPressed]}
              onPress={() => void togglePause()}
              accessibilityRole="button"
              accessibilityLabel={streamPaused ? t.chat.resumeStreaming : t.chat.pauseStreaming}
            >
              <Text style={styles.pauseButtonText}>{streamPaused ? t.chat.resumeRender : t.chat.pauseStreaming}</Text>
            </Pressable>
            {streamPaused && <Text style={styles.pauseHint}>{pauseHint}</Text>}
          </View>
        )}
        {sendError.length > 0 && (
          <View style={styles.sendErrorRow}>
            <Text style={styles.sendError} numberOfLines={2}>
              {sendError}
            </Text>
            {failedDraft.length > 0 && (
              <Pressable onPress={() => void retrySend()} hitSlop={8} accessibilityRole="button" accessibilityLabel="重新发送">
                <Text style={styles.retryLink}>{t.chat.retry}</Text>
              </Pressable>
            )}
          </View>
        )}
        {/* M3 + P1-4：composer 控制行——单行横滚，不再折两行挤压输入区 */}
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={styles.controlRow}
        >
          <Pressable
            style={({ pressed }) => [styles.controlChip, pressed && styles.modelItemPressed]}
            onPress={openPermissionPicker}
            disabled={!online}
            accessibilityRole="button"
            accessibilityLabel={`${t.chat.permission}${permissionCurrent ? ` ${permissionCurrent}` : ""}`}
          >
            <Text style={styles.controlChipText} numberOfLines={1}>
              🛡 {permissionCurrent ?? t.chat.permission}
            </Text>
          </Pressable>
          <Pressable
            style={({ pressed }) => [styles.controlChip, pressed && styles.modelItemPressed]}
            onPress={() => void openPresetPicker()}
            disabled={!online}
            accessibilityRole="button"
            accessibilityLabel={t.chat.choosePreset}
          >
            <Text style={styles.controlChipText} numberOfLines={1}>{t.chat.preset}</Text>
          </Pressable>
          <Pressable
            style={({ pressed }) => [styles.controlChip, pressed && styles.modelItemPressed]}
            onPress={() => void openModelPicker()}
            disabled={!online}
            accessibilityRole="button"
            accessibilityLabel={t.chat.chooseModel}
          >
            <Text style={styles.controlChipText} numberOfLines={1}>
              {modelsData?.current.model
                ? `${modelsData.current.model}${selectedReasoningEffort ? ` · ${selectedReasoningEffort}` : ""}`
                : t.chat.model}
            </Text>
          </Pressable>
          <Pressable
            style={({ pressed }) => [styles.controlChip, pressed && styles.modelItemPressed, promptMode === "steer" && styles.controlChipActive]}
            onPress={() => setPromptMode((m) => (m === "queue" ? "steer" : "queue"))}
            disabled={!online}
            accessibilityRole="button"
            accessibilityLabel={`发送模式 ${promptMode}`}
          >
            <Text style={styles.controlChipText}>{promptMode === "queue" ? "queue" : "steer"}</Text>
          </Pressable>
          {summary?.contextPercent !== undefined && (
            <Pressable
              style={({ pressed }) => [styles.contextRing, pressed && styles.modelItemPressed]}
              onPress={() => setShowContextSheet(true)}
              accessibilityRole="button"
              accessibilityLabel={`上下文用量 ${summary.contextPercent}%`}
            >
              <Text style={styles.contextRingText}>{summary.contextPercent}%</Text>
            </Pressable>
          )}
          <Pressable
            style={({ pressed }) => [styles.controlChip, (pressed || !online || sendingImage) && styles.modelItemPressed]}
            onPress={() => void pickImage()}
            disabled={!online || sendingImage}
            accessibilityRole="button"
            accessibilityLabel="发送图片"
          >
            <Text style={[styles.controlChipText, (!online || sendingImage) && styles.controlChipTextDim]}>
              {sendingImage ? `${t.chat.image}…` : t.chat.image}
            </Text>
          </Pressable>
          {skills && skills.length > 0 && (
            <Pressable
              style={({ pressed }) => [styles.controlChip, pressed && styles.modelItemPressed]}
              onPress={() => {
                setSkillQuery("");
                setShowSkillPicker(true);
              }}
              accessibilityRole="button"
              accessibilityLabel="选择技能"
            >
              <Text style={styles.controlChipText}>{t.chat.skill}</Text>
            </Pressable>
          )}
        </ScrollView>
        <View style={styles.inputRow}>
          <TextInput
            style={styles.input}
            placeholder={online ? t.chat.sendPlaceholder : t.chat.offlinePlaceholder}
            placeholderTextColor={colors.textDim}
            value={draft}
            onChangeText={handleDraftChange}
            editable={online}
            onSubmitEditing={send}
            returnKeyType="send"
            multiline
          />
          <Pressable
            style={[styles.send, (!draft.trim() || !online) && styles.sendDisabled]}
            onPress={send}
            disabled={!draft.trim() || !online}
          >
            <Text style={styles.sendIcon}>↑</Text>
          </Pressable>
        </View>
      </View>
    </KeyboardAvoidingView>
  );
}

function createStyles(colors: ReturnType<typeof useTheme>["colors"]) {
  return StyleSheet.create({
    screen: { flex: 1, backgroundColor: colors.bg },
    switchBar: {
      flexDirection: "row",
      marginHorizontal: 20,
      marginTop: space.x3,
      marginBottom: space.x2,
      backgroundColor: colors.surface2,
      borderRadius: 10,
      padding: 2,
    },
    switchTabBtn: {
      flex: 1,
      alignItems: "center",
      borderRadius: 8,
      paddingVertical: 6,
    },
    switchTabBtnActive: {
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.separator,
      shadowColor: "#000",
      shadowOpacity: 0.08,
      shadowRadius: 4,
      shadowOffset: { width: 0, height: 1 },
      elevation: 2,
    },
    switchTabText: { color: colors.textMuted, fontSize: 13, fontWeight: "500" },
    switchTabTextActive: { color: colors.text, fontWeight: "600" },
    viewContainer: { flex: 1 },
    swiper: { flex: 1 },
    swiperContent: { flexGrow: 1 },
    swiperPage: { height: "100%" },
    list: { flex: 1 },
    listContent: { padding: space.x5, gap: space.x3, paddingBottom: space.x6 },
    listHeader: { marginBottom: space.x2 },
    sessionHeader: {
      gap: space.x1,
    },
    sessionTitleRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: space.x2,
      flexWrap: "wrap",
    },
    sessionTitle: {
      color: colors.text,
      fontSize: 20,
      fontWeight: "600",
      letterSpacing: -0.3,
    },
    sessionActions: {
      flexDirection: "row",
      gap: space.x2,
      marginTop: space.x1,
    },
    sessionActionBtn: {
      backgroundColor: colors.surface2,
      borderRadius: radius.pill,
      borderWidth: 1,
      borderColor: colors.separator,
      paddingHorizontal: 10,
      paddingVertical: 4,
    },
    sessionActionText: {
      color: colors.accent,
      fontSize: font.eyebrow,
      fontWeight: "500",
    },
    goalPill: {
      backgroundColor: colors.surface2,
      borderRadius: radius.pill,
      paddingHorizontal: 10,
      paddingVertical: 3,
    },
    goalPillText: { color: colors.textMuted, fontSize: font.caption },
    jobsRow: {
      backgroundColor: colors.surface2,
      borderRadius: radius.pill,
      paddingHorizontal: 10,
      paddingVertical: 4,
      marginTop: space.x1,
      alignSelf: "flex-start",
    },
    jobsText: { color: colors.textMuted, fontSize: font.eyebrow, fontFamily: font.mono },
    dayDivider: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      paddingVertical: space.x3,
    },
    dayDividerText: {
      color: colors.textDim,
      fontSize: font.caption,
      backgroundColor: colors.surface2,
      borderRadius: radius.pill,
      paddingHorizontal: 10,
      paddingVertical: 3,
      overflow: "hidden",
    },
    controlRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: 8,
      paddingHorizontal: 2,
      paddingVertical: 2,
    },
    controlChip: {
      backgroundColor: colors.surface,
      borderRadius: radius.pill,
      borderWidth: 1,
      borderColor: colors.separator,
      paddingHorizontal: 12,
      paddingVertical: 6,
      maxWidth: 220,
    },
    controlChipActive: { borderColor: colors.accent, backgroundColor: colors.accentSoft },
    controlChipText: { color: colors.text, fontSize: font.caption, fontWeight: "500" },
    contextRing: {
      width: 34,
      height: 34,
      borderRadius: 17,
      borderWidth: 2,
      borderColor: colors.accent,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: colors.surface,
    },
    contextRingText: { color: colors.accent, fontSize: 10, fontWeight: "700", fontFamily: font.mono },
    planBadge: {
      alignSelf: "flex-start",
      backgroundColor: colors.accentSoft,
      borderRadius: radius.pill,
      paddingHorizontal: 10,
      paddingVertical: 3,
    },
    planBadgeText: { color: colors.accent, fontSize: font.eyebrow, fontWeight: "600" },
    todosBlock: { gap: 4, marginTop: 2 },
    todoRow: { flexDirection: "row", alignItems: "flex-start", gap: 8 },
    todoCheck: { color: colors.accent, fontSize: font.body, lineHeight: 20 },
    todoText: { color: colors.text, fontSize: font.caption, lineHeight: 20, flex: 1 },
    todoTextDone: { color: colors.textDim, textDecorationLine: "line-through" },
    contextSheetRow: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      backgroundColor: colors.surface2,
      borderRadius: 12,
      paddingVertical: 12,
      paddingHorizontal: 16,
    },
    contextSheetValue: { color: colors.accent, fontSize: font.body, fontWeight: "700", fontFamily: font.mono },
    jobSheetRow: {
      backgroundColor: colors.surface2,
      borderRadius: 12,
      paddingVertical: 12,
      paddingHorizontal: 16,
      flexDirection: "row",
      alignItems: "center",
      gap: 10,
    },
    goalBar: {
      backgroundColor: colors.surface,
      borderRadius: radius.card,
      padding: space.x3,
      gap: 6,
      marginTop: space.x1,
    },
    goalBarHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: space.x2 },
    goalBarTitle: { color: colors.text, fontSize: font.caption, fontWeight: "600", flexShrink: 1 },
    goalBarActions: { flexDirection: "row", gap: space.x3 },
    goalBarAction: { color: colors.accent, fontSize: font.caption, fontWeight: "500" },
    goalBarObjective: { color: colors.textMuted, fontSize: font.caption, lineHeight: 18 },
    goalBarError: { color: colors.danger, fontSize: font.eyebrow, fontFamily: font.mono },
    queueBanner: {
      backgroundColor: colors.accentSoft,
      borderRadius: radius.card,
      padding: space.x3,
      gap: 6,
      marginTop: space.x1,
    },
    queueTitle: { color: colors.textMuted, fontSize: font.eyebrow, fontFamily: font.monoBold, textTransform: "uppercase", letterSpacing: 1.2 },
    queueRow: { flexDirection: "row", alignItems: "center", gap: space.x3 },
    queueText: { color: colors.text, fontSize: font.caption, flexShrink: 1 },
    queueAction: { color: colors.accent, fontSize: font.caption, fontWeight: "600" },
    modalBackdrop: {
      flex: 1,
      backgroundColor: "rgba(0,0,0,0.5)",
      justifyContent: "flex-end",
    },
    menuPanel: {
      backgroundColor: colors.surface,
      borderTopLeftRadius: 20,
      borderTopRightRadius: 20,
      padding: 16,
      paddingBottom: 28,
      gap: 8,
      maxHeight: "80%",
    },
    menuTitle: {
      color: colors.textMuted,
      fontSize: font.eyebrow,
      fontFamily: font.monoBold,
      letterSpacing: 1.6,
      textTransform: "uppercase",
      marginBottom: 6,
    },
    modelGroupName: {
      color: colors.textMuted,
      fontSize: font.caption,
      fontWeight: "500",
      marginBottom: 4,
      marginTop: 8,
    },
    modelItem: {
      backgroundColor: colors.surface2,
      borderRadius: 12,
      paddingVertical: 12,
      paddingHorizontal: 16,
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      marginBottom: 4,
    },
    modelItemPressed: { opacity: 0.7 },
    modelItemName: { color: colors.text, fontSize: font.body, fontWeight: "500" },
    modelItemTick: { color: colors.accent, fontSize: font.body, fontWeight: "600" },
    emptyWrap: { alignItems: "center", paddingTop: space.x7 * 2 },
    skeletonStack: { gap: space.x3, paddingTop: space.x3 },
    emptyText: { color: colors.textMuted, fontSize: font.body, fontWeight: "500" },
    inputBar: {
      gap: space.x2,
      padding: space.x3,
      backgroundColor: "transparent",
    },
    controlChipTextDim: { opacity: 0.45 },
    skillDescription: {
      color: colors.textMuted,
      fontSize: font.caption,
      lineHeight: 17,
    },
    skillWhenToUse: {
      color: colors.accent,
      fontSize: font.caption,
      lineHeight: 17,
    },
    skillSearch: {
      backgroundColor: colors.surface2,
      borderRadius: 12,
      paddingHorizontal: 12,
      paddingVertical: 10,
      color: colors.text,
      fontSize: font.body,
      marginBottom: 4,
    },
    pauseRow: { flexDirection: "row", alignItems: "center", gap: 10 },
    pauseButton: { paddingVertical: 4 },
    pauseButtonPressed: { opacity: 0.6 },
    pauseButtonText: { color: colors.accent, fontSize: font.caption, fontWeight: "500" },
    pauseHint: { color: colors.textMuted, fontSize: font.caption, flexShrink: 1 },
    inputRow: {
      flexDirection: "row",
      alignItems: "flex-end",
      gap: 8,
      backgroundColor: colors.surface,
      borderRadius: 24,
      borderWidth: 1,
      borderColor: colors.separator,
      paddingLeft: 16,
      paddingRight: 6,
      paddingVertical: 6,
    },
    input: {
      flex: 1,
      color: colors.text,
      paddingVertical: 8,
      fontSize: font.body,
      maxHeight: 120,
    },
    send: {
      width: 42,
      height: 42,
      borderRadius: 21,
      backgroundColor: colors.ocean,
      alignItems: "center",
      justifyContent: "center",
    },
    sendDisabled: { opacity: 0.4 },
    sendIcon: { color: "#FFFFFF", fontSize: 18, fontWeight: "600", textAlign: "center", textAlignVertical: "center", lineHeight: 20 },
    statsPillWrap: { alignItems: "center", marginBottom: 2 },
    statsPill: {
      flexDirection: "row",
      alignItems: "center",
      gap: 7,
      backgroundColor: colors.surface,
      borderRadius: 16,
      borderWidth: 1,
      borderColor: colors.separator,
      paddingHorizontal: 16,
      paddingVertical: 9,
      shadowColor: "#000",
      shadowOpacity: 0.06,
      shadowRadius: 8,
      shadowOffset: { width: 0, height: 2 },
      elevation: 1,
    },
    statsPillPressed: { opacity: 0.7 },
    statsPillText: { color: colors.textMuted, fontSize: font.caption, fontFamily: font.monoMedium },
    statsPillChevron: { color: colors.textDim, fontSize: 12, fontWeight: "600" },
    sendError: { color: colors.danger, fontSize: font.caption, flexShrink: 1 },
    sendErrorRow: { flexDirection: "row", alignItems: "center", gap: space.x3 },
    retryLink: { color: colors.accent, fontSize: font.caption, fontWeight: "600" },
    jumpFabWrap: {
      position: "absolute",
      right: space.x5,
      bottom: 96,
    },
    jumpFab: {
      width: 36,
      height: 36,
      borderRadius: 18,
      backgroundColor: colors.surface2,
      borderWidth: 1,
      borderColor: colors.separator,
      opacity: 0.85,
      alignItems: "center",
      justifyContent: "center",
    },
    jumpFabText: { color: colors.textMuted, fontSize: 15, fontWeight: "600" },
  });
}

function ChatHeaderRight({ state, onPressMenu }: { state: string; onPressMenu: () => void }) {
  const { colors } = useTheme();
  const styles = useMemo(
    () =>
      StyleSheet.create({
        row: { flexDirection: "row", alignItems: "center", gap: 10, paddingRight: 6 },
        dot: {
          width: 8,
          height: 8,
          borderRadius: 4,
          shadowOpacity: 0.65,
          shadowRadius: 5,
          shadowOffset: { width: 0, height: 0 },
          elevation: 2,
        },
        moreIconText: { color: colors.text, fontSize: 18, fontWeight: "600", lineHeight: 22 },
      }),
    [colors],
  );
  const dotColor =
    state === "online"
      ? colors.success
      : state === "offline"
        ? colors.danger
        : state === "connecting" || state === "backoff"
          ? colors.warn
          : colors.textDim;
  return (
    <View style={styles.row}>
      <View
        style={[styles.dot, { backgroundColor: dotColor, shadowColor: dotColor }]}
      />
      <Pressable onPress={onPressMenu} hitSlop={8} accessibilityRole="button" accessibilityLabel="会话菜单">
        <Text style={styles.moreIconText}>⋯</Text>
      </Pressable>
    </View>
  );
}
