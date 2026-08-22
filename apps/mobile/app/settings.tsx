import { useEffect, useMemo, useState } from "react";
import { Linking, Pressable, ScrollView, StyleSheet, Switch, Text, View } from "react-native";
import { useRouter } from "expo-router";
import Constants from "expo-constants";
import { useConnection } from "../src/transport/ConnectionProvider";
import { useI18n } from "../src/i18n";
import { defaultsFromSettingsNamespaces } from "../src/ui/settingsDefaults";
import { modelsPermissionsVisible, pluginsRowVisible } from "../src/ui/settingsVisibility";
import { autoReconnectStore } from "../src/discovery/autoReconnectStoreAdapter";
import { isExpoGo } from "../src/notify/expoEnv";
import { useAppSettings } from "../src/data/appSettingsContext";
import type { FontSize } from "../src/data/appSettingsStore";
import { Button } from "../src/ui/Button";
import { font, radius, space, type ThemeColors, type ThemePreference } from "../src/theme";
import { useTheme } from "../src/theme-context";
import { SectionLabel } from "../src/ui/SectionLabel";
import { StatusChip } from "../src/ui/StatusChip";
import { haptic } from "../src/ui/haptics";

function Group({ eyebrow, children }: { eyebrow: string; children: React.ReactNode }) {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  return (
    <View style={styles.group}>
      <SectionLabel>{eyebrow}</SectionLabel>
      <View style={styles.card}>{children}</View>
    </View>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  return (
    <View style={styles.row}>
      <Text style={styles.rowLabel}>{label}</Text>
      <Text style={styles.rowValue} numberOfLines={1}>
        {value}
      </Text>
    </View>
  );
}

function PressableRow({ label, value, onPress, last }: { label: string; value: string; onPress: () => void; last?: boolean }) {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  return (
    <Pressable
      style={({ pressed }) => [styles.row, pressed && styles.rowPressed, last && styles.rowLast]}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
    >
      <Text style={styles.rowLabel}>{label}</Text>
      <Text style={styles.rowValue} numberOfLines={1}>{value} ›</Text>
    </Pressable>
  );
}

function OptionChip({ label, active, onPress }: { label: string; active: boolean; onPress: () => void }) {
  const { colors } = useTheme();
  return (
    <Pressable
      style={[optionStyles.chip, { backgroundColor: active ? colors.text : colors.surface2 }]}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
    >
      <Text style={[optionStyles.chipText, { color: active ? colors.bg : colors.textMuted }]}>{label}</Text>
    </Pressable>
  );
}

const PRESET_DESCRIPTIONS: Record<string, string> = {
  standard: "功能完整的编码 Agent，支持文件编辑、Shell、文件与网页检索、Skills、计划、目标、子代理和工作流。",
  code: "具备标准模式的全部能力，并通过 Code Mode SDK 呈现工具，让模型用一个 TypeScript 程序组合多步操作。",
  minimal: "仅提供持久 bash 与 str_replace_editor 的双工具编码 Agent。",
  cordis: "用于创建自定义 Agent preset：具备标准模式的全部能力，并提供运行时检查、插件实验和 preset 创作指导。",
};

const optionStyles = StyleSheet.create({
  chip: { borderRadius: 10, paddingHorizontal: 12, paddingVertical: 7 },
  chipText: { fontSize: font.transcript, fontWeight: "500" },
});

export default function SettingsScreen() {
  const { colors, preference, setPreference } = useTheme();
  const { t, locale, setLocale } = useI18n();
  const stateLabel = (s: typeof state) =>
    s === "online" ? t.common.stateOnline
      : s === "offline" ? t.common.stateOffline
        : s === "backoff" ? t.common.stateBackoff
          : t.common.stateConnecting;
  const styles = useMemo(() => createStyles(colors), [colors]);
  const { state, describe, lastEndpoint, notifications, disconnect, notificationsEnabled, setNotificationsEnabled, settingsDescribe, settingsMutate, agentPresetList, pluginList } = useConnection();
  const { fontSize, setFontSize } = useAppSettings();
  const router = useRouter();
  const [autoReconnect, setAutoReconnect] = useState(true);
  const [settingsInfo, setSettingsInfo] = useState<{ writable: boolean; hasDocument: boolean; namespaces: Array<{ ns: string; value: unknown; revision: number; applies: string }> } | null>(null);
  const [presets, setPresets] = useState<Array<{ id: string; name: string; isDefault: boolean; trust: string; broken?: string }>>([]);
  const [presetRead, setPresetRead] = useState(false);
  const [pluginCount, setPluginCount] = useState(0);
  const [pluginRead, setPluginRead] = useState(false);
  const [updateState, setUpdateState] = useState<{ status: "idle" | "checking" | "new" | "latest" | "error"; message: string; url?: string }>({
    status: "idle",
    message: "",
  });

  useEffect(() => {
    void autoReconnectStore.enabled().then(setAutoReconnect);
  }, []);

  useEffect(() => {
    let alive = true;
    void settingsDescribe().then((s) => {
      if (alive) setSettingsInfo(s);
    });
    return () => {
      alive = false;
    };
  }, [settingsDescribe]);

  useEffect(() => {
    let alive = true;
    void agentPresetList().then((list) => {
      if (alive) {
        setPresets(list ?? []);
        setPresetRead(true);
      }
    });
    return () => {
      alive = false;
    };
  }, [agentPresetList]);

  useEffect(() => {
    let alive = true;
    void pluginList().then((list) => {
      if (alive) {
        setPluginCount(list?.plugins.length ?? 0);
        setPluginRead(true);
      }
    });
    return () => {
      alive = false;
    };
  }, [pluginList]);

  const toggleAutoReconnect = async (v: boolean) => {
    setAutoReconnect(v);
    await autoReconnectStore.setEnabled(v);
  };
  const describeName =
    describe && typeof describe === "object"
      ? `${(describe as { name?: string }).name ?? ""} ${(describe as { version?: string }).version ?? ""}`.trim()
      : "—";

  const defaults = defaultsFromSettingsNamespaces(settingsInfo?.namespaces, settingsInfo?.writable !== false);

  const modelNs = settingsInfo?.namespaces.find((n) => n.ns === "agent-default-model");
  const applyDefaultModel = async (model: string) => {
    if (!modelNs) return;
    void haptic("light");
    const ok = await settingsMutate(
      modelNs.ns,
      [{ op: "set", path: ["model"], value: model }],
      modelNs.revision,
    );
    if (ok) {
      setSettingsInfo((prev) => prev ? {
        ...prev,
        namespaces: prev.namespaces.map((n) => n.ns === modelNs.ns
          ? { ...n, value: { ...(n.value as Record<string, unknown>), model }, revision: n.revision + 1 }
          : n),
      } : prev);
    }
  };

  const applyDefaultThinking = async (thinking: string) => {
    if (!modelNs) return;
    void haptic("light");
    const ok = await settingsMutate(
      modelNs.ns,
      [{ op: "set", path: ["reasoningEffort"], value: thinking }],
      modelNs.revision,
    );
    if (ok) {
      setSettingsInfo((prev) => prev ? {
        ...prev,
        namespaces: prev.namespaces.map((n) => n.ns === modelNs.ns
          ? { ...n, value: { ...(n.value as Record<string, unknown>), reasoningEffort: thinking }, revision: n.revision + 1 }
          : n),
      } : prev);
    }
  };

  const permissionNs = settingsInfo?.namespaces.find((n) => n.ns === "permission");
  const permissionValue = (permissionNs?.value as { defaultPreset?: unknown } | undefined)?.defaultPreset;
  const permissionPreset = typeof permissionValue === "string" ? permissionValue : "";
  const applyDefaultPreset = async (preset: string) => {
    if (!permissionNs) return;
    void haptic("light");
    const ok = await settingsMutate(
      permissionNs.ns,
      [{ op: "set", path: ["defaultPreset"], value: preset }],
      permissionNs.revision,
    );
    if (ok) {
      setSettingsInfo((prev) => prev ? {
        ...prev,
        namespaces: prev.namespaces.map((n) => n.ns === permissionNs.ns
          ? { ...n, value: { ...(n.value as Record<string, unknown>), defaultPreset: preset }, revision: n.revision + 1 }
          : n),
      } : prev);
    }
  };

  const checkUpdate = async () => {
    setUpdateState({ status: "checking", message: "正在检查…" });
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 8000);
    try {
      const res = await fetch("https://api.github.com/repos/Andiii208/dsh-harness-remote/releases/latest", {
        signal: ctrl.signal,
        headers: { accept: "application/vnd.github+json" },
      });
      const data = (await res.json()) as {
        tag_name?: string;
        html_url?: string;
        assets?: Array<{ name?: string; browser_download_url?: string }>;
      };
      const current = `v${Constants.expoConfig?.version ?? "0.1.0"}`;
      if (data.tag_name && data.tag_name !== current) {
        const apk = data.assets?.find((a) => a.name?.endsWith(".apk"));
        setUpdateState({
          status: "new",
          message: `新版本 ${data.tag_name}`,
          url: apk?.browser_download_url ?? data.html_url,
        });
      } else {
        setUpdateState({ status: "latest", message: "已是最新版本" });
      }
    } catch {
      setUpdateState({ status: "error", message: "检查失败，请稍后重试" });
    } finally {
      clearTimeout(timer);
    }
  };

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <Group eyebrow={t.settings.connection}>
        <View style={styles.row}>
          <Text style={styles.rowLabel}>{t.settings.status}</Text>
          <StatusChip
            tone={state === "online" ? "success" : state === "offline" ? "danger" : "warn"}
            label={stateLabel(state)}
          />
        </View>
        <Row label={t.settings.targetHost} value={lastEndpoint ? `${lastEndpoint.host}:${lastEndpoint.port}` : t.common.notSet} />
        <Row label={t.settings.remoteInstance} value={describeName} />
        <View style={styles.row}>
          <Text style={styles.rowLabel}>{t.settings.autoReconnect}</Text>
          <Switch
            value={autoReconnect}
            onValueChange={(v) => void toggleAutoReconnect(v)}
            trackColor={{ false: colors.surface2, true: colors.accent }}
            thumbColor={colors.text}
          />
        </View>
        {state === "online" && (
          <View style={styles.disconnectRow}>
            <Button tone="danger" label={t.settings.disconnect} onPress={disconnect} full />
          </View>
        )}
        <View style={styles.sectionSeparator} />
        <View style={styles.row}>
          <Text style={styles.rowLabel}>{t.settings.localNotifications}</Text>
          <Switch
            value={notificationsEnabled}
            onValueChange={setNotificationsEnabled}
            disabled={isExpoGo()}
            trackColor={{ false: colors.surface2, true: colors.accent }}
            thumbColor={colors.text}
          />
        </View>
        <PressableRow
          label={t.settings.unreadEvents}
          value={notifications.length > 0 ? `${notifications.length}` : t.settings.none}
          onPress={() => router.push("/events" as never)}
        />
        <Text style={styles.hint}>
          {isExpoGo() ? "Expo Go 不支持本地通知——此开关在 Expo Go 下不可用，development build 中生效。" : "关闭后仍会在应用内记录事件，只是不弹系统通知。"}
        </Text>
      </Group>

      {modelsPermissionsVisible({
        online: state === "online",
        settingsInfoPresent: settingsInfo !== null,
        presetRead,
        presetCount: presets.length,
      }) ? (
        <Group eyebrow={t.settings.modelsPermissions}>
          {presetRead && presets.length > 0 && (
            <>
              <View style={styles.row}>
                <Text style={styles.rowLabel}>{t.settings.agentPreset}</Text>
                <Text style={styles.rowValue}>{presets.find((p) => p.isDefault)?.name ?? "未设置默认"}</Text>
              </View>
              <View style={styles.presetList}>
                {presets.map((p) => {
                  const desc = PRESET_DESCRIPTIONS[p.id] ?? p.trust;
                  return (
                    <View key={p.id} style={[styles.presetCard, p.isDefault && styles.presetCardActive]}>
                      <View style={styles.presetCardHeader}>
                        <Text style={styles.presetCardName}>{p.name}</Text>
                        <Text style={styles.presetCardId}>{p.id}</Text>
                        {p.isDefault && <Text style={styles.presetCardBadge}>当前使用</Text>}
                      </View>
                      {desc.length > 0 && <Text style={styles.presetCardDesc}>{desc}</Text>}
                      {p.broken && <Text style={styles.presetCardBroken}>该预设存在配置错误，暂时不能设为默认值</Text>}
                    </View>
                  );
                })}
              </View>
              <Text style={styles.hint}>会话内可在聊天页切换当前会话使用的 Agent 预设。</Text>
            </>
          )}

          {permissionNs && (
            <>
              <View style={styles.row}>
                <Text style={styles.rowLabel}>{t.settings.defaultPermissionPreset}</Text>
                <Text style={styles.rowValue}>{permissionPreset || "未设置"}</Text>
              </View>
              {permissionNs.applies !== "restart" && settingsInfo?.writable !== false && (
                <View style={styles.optionsRow}>
                  {["read-only", "workspace-write", "danger-full-access"].map((preset) => (
                    <OptionChip
                      key={preset}
                      label={preset}
                      active={permissionPreset === preset}
                      onPress={() => void applyDefaultPreset(preset)}
                    />
                  ))}
                </View>
              )}
              <Text style={styles.hint}>默认权限影响新会话；当前会话权限在聊天页顶部切换。</Text>
            </>
          )}

          <PressableRow label={t.settings.approvalHistory} value={t.settings.view} onPress={() => router.push("/approval/history" as never)} last />
        </Group>
      ) : null}

      {modelNs !== undefined && (
        <Group eyebrow={t.settings.defaults}>
          {defaults.models.length > 0 && (
            <>
              <View style={styles.row}>
                <Text style={styles.rowLabel}>{t.settings.defaultModel}</Text>
                <Text style={styles.rowValue}>{defaults.model ?? "未设置"}</Text>
              </View>
              {defaults.writable && (
                <View style={styles.optionsRow}>
                  {defaults.models.map((m) => (
                    <OptionChip
                      key={m}
                      label={m}
                      active={defaults.model === m}
                      onPress={() => void applyDefaultModel(m)}
                    />
                  ))}
                </View>
              )}
              <Text style={styles.hint}>新会话默认使用的模型；读不到 settings.describe 的 agent-default-model 命名空间时此分组自动隐藏。</Text>
            </>
          )}

          {defaults.thinking !== undefined && (
            <>
              <View style={styles.row}>
                <Text style={styles.rowLabel}>{t.settings.defaultThinking}</Text>
                <Text style={styles.rowValue}>{defaults.thinking}</Text>
              </View>
              {defaults.writable && (
                <View style={styles.optionsRow}>
                  {defaults.thinkingOptions.map((t) => (
                    <OptionChip
                      key={t}
                      label={t}
                      active={defaults.thinking === t}
                      onPress={() => void applyDefaultThinking(t)}
                    />
                  ))}
                </View>
              )}
            </>
          )}
          {defaults.models.length === 0 && defaults.thinking === undefined && (
            <Text style={styles.hint}>宿主未提供默认模型/思考强度配置。</Text>
          )}
        </Group>
      )}

      {pluginsRowVisible(pluginRead, pluginCount) && (
        <Group eyebrow={t.settings.plugins}>
          <PressableRow
            label="用户插件"
            value={`${pluginCount} 个可用`}
            onPress={() => router.push("/plugins" as never)}
            last
          />
        </Group>
      )}

      <Group eyebrow={t.settings.display}>
        <View style={styles.row}>
          <Text style={styles.rowLabel}>外观</Text>
          <Text style={styles.rowValue}>{preference === "light" ? "浅色" : preference === "dark" ? "深色" : "跟随系统"}</Text>
        </View>
        <View style={styles.optionsRow}>
          {([
            ["light", "浅色"],
            ["dark", "深色"],
            ["system", "跟随系统"],
          ] as Array<[ThemePreference, string]>).map(([value, label]) => (
            <OptionChip
              key={value}
              label={label}
              active={preference === value}
              onPress={() => {
                void haptic("light");
                setPreference(value);
              }}
            />
          ))}
        </View>
        <Text style={styles.hint}>默认浅色；深色模式适合夜间使用，跟随系统会随手机外观自动切换。</Text>
        <View style={styles.row}>
          <Text style={styles.rowLabel}>语言 / Language</Text>
          <Text style={styles.rowValue}>{locale === "zh-CN" ? "中文" : "English"}</Text>
        </View>
        <View style={styles.optionsRow}>
          {(["zh-CN", "en"] as const).map((lang) => (
            <OptionChip
              key={lang}
              label={lang === "zh-CN" ? "中文" : "English"}
              active={locale === lang}
              onPress={() => {
                void haptic("light");
                setLocale(lang);
              }}
            />
          ))}
        </View>
        <Text style={styles.hint}>中英界面切换立即生效并保存在本机。</Text>
        <View style={styles.row}>
          <Text style={styles.rowLabel}>字体大小</Text>
          <Text style={styles.rowValue}>{fontSize === "small" ? "小" : fontSize === "large" ? "大" : "标准"}</Text>
        </View>
        <View style={styles.optionsRow}>
          {(["small", "standard", "large"] as FontSize[]).map((s) => (
            <OptionChip
              key={s}
              label={s === "small" ? "小" : s === "large" ? "大" : "标准"}
              active={s === fontSize}
              onPress={() => {
                void haptic("light");
                setFontSize(s);
              }}
            />
          ))}
        </View>
        <Text style={styles.hint}>只影响聊天正文与列表正文，不缩放 UI 框架。</Text>
      </Group>

      <Group eyebrow={t.settings.about}>
        <Row label={t.settings.app} value="harness remote" />
        <Row label={t.settings.version} value={Constants.expoConfig?.version ? `v${Constants.expoConfig.version}` : "v0.1.0"} />
        <PressableRow
          label={t.settings.checkUpdate}
          value={updateState.status === "checking" ? updateState.message : updateState.status === "new" ? `${updateState.message} ›` : updateState.status === "latest" ? updateState.message : updateState.status === "error" ? updateState.message : "GitHub Releases"}
          onPress={() => {
            if (updateState.status === "new" && updateState.url) void Linking.openURL(updateState.url);
            else void checkUpdate();
          }}
          last
        />
        <Text style={styles.hint}>电脑端插件更新：dsh plugin --profile web update dsh-harness-remote --latest -w</Text>
        <View style={styles.linkRow}>
          <Button tone="ghost" label="GitHub · 使用手册" onPress={() => void Linking.openURL("https://github.com/Andiii208/dsh-harness-remote")} full />
        </View>
      </Group>
    </ScrollView>
  );
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    screen: { flex: 1, backgroundColor: colors.bg },
    content: { padding: space.x5, gap: space.x4, paddingBottom: space.x7 },
    group: { gap: space.x2 },
    card: {
      backgroundColor: colors.surface,
      borderRadius: radius.card,
      paddingHorizontal: space.x4,
      paddingVertical: space.x2,
    },
    row: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      gap: space.x3,
      minHeight: 48,
      paddingVertical: space.x3,
      borderBottomWidth: 1,
      borderBottomColor: colors.separator,
    },
    rowPressed: { opacity: 0.7 },
    rowLast: { borderBottomWidth: 0 },
    rowLabel: { color: colors.text, fontSize: font.body },
    rowValue: { color: colors.textMuted, fontSize: font.caption, flexShrink: 1, textAlign: "right" },
    optionsRow: { flexDirection: "row", flexWrap: "wrap", gap: space.x2, paddingVertical: space.x3, borderBottomWidth: 1, borderBottomColor: colors.separator },
    presetList: { paddingVertical: space.x3, gap: space.x2, borderBottomWidth: 1, borderBottomColor: colors.separator },
    presetCard: {
      backgroundColor: colors.surface2,
      borderRadius: 14,
      borderWidth: 1,
      borderColor: colors.separator,
      padding: 14,
      gap: 8,
    },
    presetCardActive: { borderWidth: 1.5, borderColor: colors.text },
    presetCardHeader: { flexDirection: "row", alignItems: "center", gap: space.x2 },
    presetCardName: { color: colors.text, fontSize: font.body + 1, fontWeight: "600" },
    presetCardId: {
      color: colors.textMuted,
      fontFamily: font.monoMedium,
      fontSize: font.eyebrow,
      paddingHorizontal: 7,
      paddingVertical: 3,
      backgroundColor: colors.surface2,
      borderRadius: radius.pill,
      overflow: "hidden",
    },
    presetCardBadge: {
      color: colors.bg,
      backgroundColor: colors.text,
      fontSize: font.eyebrow,
      fontWeight: "600",
      paddingHorizontal: 10,
      paddingVertical: 5,
      borderRadius: radius.pill,
      overflow: "hidden",
      marginLeft: "auto",
    },
    presetCardDesc: { color: colors.textMuted, fontSize: font.caption, lineHeight: 18 },
    presetCardBroken: { color: colors.warn, fontSize: font.caption, fontWeight: "500" },
    contextBlock: { paddingVertical: space.x3, gap: space.x2, borderBottomWidth: 1, borderBottomColor: colors.separator },
    contextHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
    progressTrack: { height: 4, borderRadius: 2, backgroundColor: colors.surface2, overflow: "hidden" },
    progressFill: { height: 4, borderRadius: 2, backgroundColor: colors.accent },
    disconnectRow: { paddingVertical: space.x3, borderBottomWidth: 1, borderBottomColor: colors.separator },
    linkRow: { paddingVertical: space.x3 },
    hint: { color: colors.textMuted, fontSize: font.caption, lineHeight: 18, paddingVertical: space.x3 },
    sectionSeparator: {
      height: StyleSheet.hairlineWidth,
      backgroundColor: colors.separator,
      marginVertical: space.x3,
    },
  });
}
