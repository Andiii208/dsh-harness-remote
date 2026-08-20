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
import type { TranscriptMessage } from "../../src/data/SessionStore";
import type { TranscriptStep } from "../../src/data/transcriptSteps";
import { filterSkills, type SkillEntry } from "../../src/data/skillList";
import { estimateBase64Bytes, resolveImageMediaType } from "../../src/data/imageMessage";
import { shouldStickToBottom } from "../../src/ui/chat/stickyBottom";
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
  const listRef = useRef<FlashListRef<TranscriptMessage> | null>(null);
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
    setDraft((prev) => `${prev}${prev.length > 0 && !prev.endsWith(" ") ? " " : ""}@${name} `);
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

  useEffect(() => {
    setStreamPaused(false); // 新一轮流式开始时恢复渲染
    setPauseHint("");
  }, [liveId]);
  const data = streamPaused ? messages : live ? [...messages, live] : messages;
  const online = state === "online";
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
  };

  const sendText = async (raw: string) => {
    const text = raw.trim();
    if (!text || !id || !online) return;
    setDraft("");
    setSendError("");
    setFailedDraft("");
    void haptic("light");
    try {
      await sendMessage(id, text);
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
      setPauseHint("");
      void haptic("light");
      return;
    }
    if (!id) return;
    void haptic("light");
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
        data={data}
        keyExtractor={(m, i) => `${m.id ?? "m"}-${i}`}
        ListHeaderComponent={
          <View style={styles.listHeader}>
            <View style={styles.sessionHeader}>
              {activeJobs.length > 0 && (
                <View style={styles.jobsRow}>
                  <Text style={styles.jobsText} numberOfLines={1}>
                    后台任务 · {activeJobs[0]?.label}
                    {activeJobs.length > 1 ? ` +${activeJobs.length - 1}` : ""}
                  </Text>
                </View>
              )}

              {summary?.goalObjective !== undefined || goalStatus !== undefined ? (
                <View style={styles.goalBar}>
                  <View style={styles.goalBarHeader}>
                    <Text style={styles.goalBarTitle} numberOfLines={1}>
                      {goalStatus ? `${t.chat.goal} · ${goalLabel}` : t.chat.goal}
                    </Text>
                    <View style={styles.goalBarActions}>
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
                  {summary?.goalObjective !== undefined && (
                    <Text style={styles.goalBarObjective} numberOfLines={2}>
                      {summary.goalObjective}
                    </Text>
                  )}
                  {goalError.length > 0 && <Text style={styles.goalBarError}>{goalError}</Text>}
                </View>
              ) : null}

              {queue.length > 0 && (
                <View style={styles.queueBanner}>
                  <Text style={styles.queueTitle}>{t.chat.queueTitle}</Text>
                  {queue.map((q) => (
                    <View key={q.id} style={styles.queueRow}>
                      <Pressable style={{ flex: 1 }} onPress={() => setDraft(q.text)} accessibilityRole="button" accessibilityLabel="填入输入框">
                        <Text style={styles.queueText} numberOfLines={1}>{q.text}</Text>
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
        renderItem={({ item, index }) => (
          <View>
            <MessageBubble m={item} live={index === messages.length && item.id === live?.id} sessionId={id} />
          </View>
        )}
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
            <Pressable
              style={({ pressed }) => [styles.modelItem, pressed && styles.modelItemPressed]}
              onPress={() => { setShowHeaderMenu(false); void openModelPicker(); }}
              accessibilityRole="button"
              accessibilityLabel={t.chat.chooseModel}
            >
              <Text style={styles.modelItemName}>{t.chat.model}</Text>
            </Pressable>
            <Pressable
              style={({ pressed }) => [styles.modelItem, pressed && styles.modelItemPressed]}
              onPress={() => { setShowHeaderMenu(false); openPermissionPicker(); }}
              accessibilityRole="button"
              accessibilityLabel={t.chat.choosePermission}
            >
              <Text style={styles.modelItemName}>{permissionCurrent ? `${t.chat.permission} · ${permissionCurrent}` : t.chat.permission}</Text>
            </Pressable>
            <Pressable
              style={({ pressed }) => [styles.modelItem, pressed && styles.modelItemPressed]}
              onPress={() => { setShowHeaderMenu(false); void openPresetPicker(); }}
              accessibilityRole="button"
              accessibilityLabel={t.chat.choosePreset}
            >
              <Text style={styles.modelItemName}>{t.chat.preset}</Text>
            </Pressable>
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
        <View style={styles.toolRow}>
          <Pressable
            style={({ pressed }) => [styles.toolChip, (pressed || !online || sendingImage) && styles.modelItemPressed]}
            onPress={() => void pickImage()}
            disabled={!online || sendingImage}
            accessibilityRole="button"
            accessibilityLabel="发送图片"
          >
            <Text style={[styles.toolChipText, (!online || sendingImage) && styles.toolChipTextDim]}>
              {sendingImage ? `${t.chat.image}…` : t.chat.image}
            </Text>
          </Pressable>
          {skills && skills.length > 0 && (
            <Pressable
              style={({ pressed }) => [styles.toolChip, pressed && styles.modelItemPressed]}
              onPress={() => {
                setSkillQuery("");
                setShowSkillPicker(true);
              }}
              accessibilityRole="button"
              accessibilityLabel="选择技能"
            >
              <Text style={styles.toolChipText}>{t.chat.skill}</Text>
            </Pressable>
          )}
        </View>
        <View style={styles.inputRow}>
          <TextInput
            style={styles.input}
            placeholder={online ? t.chat.sendPlaceholder : t.chat.offlinePlaceholder}
            placeholderTextColor={colors.textDim}
            value={draft}
            onChangeText={setDraft}
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
            <Text style={styles.sendText}>↑</Text>
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
      marginHorizontal: 66,
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
      fontSize: 18,
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
    toolRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: 8,
    },
    toolChip: {
      backgroundColor: colors.surface,
      borderRadius: radius.pill,
      borderWidth: 1,
      borderColor: colors.separator,
      paddingHorizontal: 12,
      paddingVertical: 4,
    },
    toolChipText: {
      color: colors.accent,
      fontSize: font.caption,
      fontWeight: "500",
    },
    toolChipTextDim: { opacity: 0.45 },
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
    sendText: { color: "#FFFFFF", fontSize: 18, fontWeight: "600", textAlign: "center", textAlignVertical: "center", lineHeight: 20 },
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
    jumpFabText: { color: colors.textMuted, fontSize: 16, fontWeight: "600" },
  });
}

function ChatHeaderRight({ state, onPressMenu }: { state: string; onPressMenu: () => void }) {
  const { colors } = useTheme();
  const dotColor =
    state === "online"
      ? colors.success
      : state === "offline"
        ? colors.danger
        : state === "connecting" || state === "backoff"
          ? colors.warn
          : colors.textDim;
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
      <View
        style={{
          width: 8,
          height: 8,
          borderRadius: 4,
          backgroundColor: dotColor,
          shadowColor: dotColor,
          shadowOpacity: 0.65,
          shadowRadius: 5,
          shadowOffset: { width: 0, height: 0 },
          elevation: 2,
        }}
      />
      <Pressable onPress={onPressMenu} hitSlop={8} accessibilityRole="button" accessibilityLabel="会话菜单">
        <Text style={{ color: colors.text, fontSize: 18, fontWeight: "600", lineHeight: 22 }}>⋯</Text>
      </Pressable>
    </View>
  );
}
