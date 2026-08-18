import { useEffect, useMemo, useState } from "react";
import { Linking, Pressable, ScrollView, StyleSheet, Switch, Text, View } from "react-native";
import { useRouter } from "expo-router";
import Constants from "expo-constants";
import { useConnection, STATE_LABEL } from "../src/transport/ConnectionProvider";
import { autoReconnectStore } from "../src/discovery/autoReconnectStoreAdapter";
import { isExpoGo } from "../src/notify/expoEnv";
import { useAppSettings } from "../src/data/appSettingsContext";
import type { FontSize } from "../src/data/appSettingsStore";
import type { HostSettings } from "@dsh-remote/protocol";
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
      style={[optionStyles.chip, { backgroundColor: active ? colors.accent : colors.surface2 }]}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
    >
      <Text style={[optionStyles.chipText, { color: active ? "#FFFFFF" : colors.textMuted }]}>{label}</Text>
    </Pressable>
  );
}

const optionStyles = StyleSheet.create({
  chip: { borderRadius: 10, paddingHorizontal: 12, paddingVertical: 7 },
  chipText: { fontSize: font.transcript, fontWeight: "500" },
});

function permissionText(p?: HostSettings["permissions"]): string {
  if (!p) return "未知";
  if (p.mode === "auto") return "自动放行";
  if (p.mode === "readonly") return "只读";
  if (p.mode === "approve") return "需审批";
  return p.description ?? p.mode ?? "未知";
}

export default function SettingsScreen() {
  const { colors, preference, setPreference } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const { state, describe, lastEndpoint, notifications, disconnect, notificationsEnabled, setNotificationsEnabled, hostSettingsGet, hostSettingsSet, pluginList } = useConnection();
  const { fontSize, setFontSize } = useAppSettings();
  const router = useRouter();
  const [autoReconnect, setAutoReconnect] = useState(true);
  const [hostSettings, setHostSettings] = useState<HostSettings | null>(null);
  const [settingsRead, setSettingsRead] = useState(false);
  const [pluginCount, setPluginCount] = useState(0);
  const [updateState, setUpdateState] = useState<{ status: "idle" | "checking" | "new" | "latest" | "error"; message: string; url?: string }>({
    status: "idle",
    message: "",
  });

  useEffect(() => {
    void autoReconnectStore.enabled().then(setAutoReconnect);
  }, []);

  useEffect(() => {
    let alive = true;
    void hostSettingsGet().then((s) => {
      if (alive) {
        setHostSettings(s);
        setSettingsRead(true);
      }
    });
    return () => {
      alive = false;
    };
  }, [hostSettingsGet]);

  useEffect(() => {
    let alive = true;
    void pluginList().then((list) => {
      if (alive) setPluginCount(list?.plugins.length ?? 0);
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

  const applyHostSetting = async (patch: { model?: string; thinking?: string }) => {
    void haptic("light");
    const ok = await hostSettingsSet(patch);
    if (ok) setHostSettings((prev) => (prev ? { ...prev, ...patch } : prev));
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
      <Group eyebrow="连接">
        <View style={styles.row}>
          <Text style={styles.rowLabel}>状态</Text>
          <StatusChip
            tone={state === "online" ? "success" : state === "offline" ? "danger" : "warn"}
            label={STATE_LABEL[state] ?? state}
          />
        </View>
        <Row label="目标主机" value={lastEndpoint ? `${lastEndpoint.host}:${lastEndpoint.port}` : "未连接"} />
        <Row label="远端实例" value={describeName} />
        <View style={styles.row}>
          <Text style={styles.rowLabel}>自动重连</Text>
          <Switch
            value={autoReconnect}
            onValueChange={(v) => void toggleAutoReconnect(v)}
            trackColor={{ false: colors.surface2, true: colors.accent }}
            thumbColor={colors.text}
          />
        </View>
        {state === "online" && (
          <View style={styles.disconnectRow}>
            <Button tone="danger" label="断开连接" onPress={disconnect} full />
          </View>
        )}
        <View style={styles.sectionSeparator} />
        <View style={styles.row}>
          <Text style={styles.rowLabel}>本地通知</Text>
          <Switch
            value={notificationsEnabled}
            onValueChange={setNotificationsEnabled}
            disabled={isExpoGo()}
            trackColor={{ false: colors.surface2, true: colors.accent }}
            thumbColor={colors.text}
          />
        </View>
        <Row label="未读事件" value={notifications.length > 0 ? `${notifications.length} 条` : "无"} />
        <Text style={styles.hint}>
          {isExpoGo() ? "Expo Go 不支持本地通知——此开关在 Expo Go 下不可用，development build 中生效。" : "关闭后仍会在应用内记录事件，只是不弹系统通知。"}
        </Text>
      </Group>

      {settingsRead && hostSettings ? (
        <Group eyebrow="模型与权限">
          {hostSettings.models && hostSettings.models.length > 0 ? (
            <>
              <View style={styles.row}>
                <Text style={styles.rowLabel}>模型</Text>
                <Text style={styles.rowValue}>{hostSettings.model ?? "未选择"}</Text>
              </View>
              {hostSettings.writable !== false && (
                <View style={styles.optionsRow}>
                  {hostSettings.models.map((m) => (
                    <OptionChip
                      key={m}
                      label={m}
                      active={m === hostSettings.model}
                      onPress={() => void applyHostSetting({ model: m })}
                    />
                  ))}
                </View>
              )}
            </>
          ) : null}

          {hostSettings.thinking ? (
            <>
              <View style={styles.row}>
                <Text style={styles.rowLabel}>思考强度</Text>
                <Text style={styles.rowValue}>{hostSettings.thinking}</Text>
              </View>
              {hostSettings.writable !== false && (
                <View style={styles.optionsRow}>
                  {["low", "medium", "high"].map((t) => (
                    <OptionChip
                      key={t}
                      label={t}
                      active={t === hostSettings.thinking}
                      onPress={() => void applyHostSetting({ thinking: t })}
                    />
                  ))}
                </View>
              )}
            </>
          ) : null}

          {hostSettings.contextPercent !== undefined && (
            <View style={styles.contextBlock}>
              <View style={styles.contextHeader}>
                <Text style={styles.rowLabel}>上下文容量</Text>
                <Text style={styles.rowValue}>
                  {hostSettings.contextPercent}%{hostSettings.contextLimit ? ` / ${hostSettings.contextLimit}` : ""}
                </Text>
              </View>
              <View style={styles.progressTrack}>
                <View style={[styles.progressFill, { width: `${Math.min(100, Math.max(0, hostSettings.contextPercent))}%` }]} />
              </View>
            </View>
          )}

          {hostSettings.permissions && (
            <View style={styles.row}>
              <Text style={styles.rowLabel}>审批权限</Text>
              <Text style={styles.rowValue}>{permissionText(hostSettings.permissions)}</Text>
            </View>
          )}
          <PressableRow label="审批 / 提问历史" value="查看" onPress={() => router.push("/approval/history" as never)} last />
        </Group>
      ) : null}

      <Group eyebrow="插件">
        <PressableRow
          label="用户插件"
          value={pluginCount > 0 ? `${pluginCount} 个可用` : "读不到自动隐藏"}
          onPress={() => router.push("/plugins" as never)}
          last
        />
      </Group>

      <Group eyebrow="显示">
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

      <Group eyebrow="关于">
        <Row label="应用" value="harness remote" />
        <Row label="版本" value={Constants.expoConfig?.version ? `v${Constants.expoConfig.version}` : "v0.1.0"} />
        <PressableRow
          label="检查更新"
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
      paddingVertical: space.x3,
      borderBottomWidth: 1,
      borderBottomColor: colors.separator,
    },
    rowPressed: { opacity: 0.7 },
    rowLast: { borderBottomWidth: 0 },
    rowLabel: { color: colors.text, fontSize: font.body },
    rowValue: { color: colors.textMuted, fontSize: font.caption, flexShrink: 1, textAlign: "right" },
    optionsRow: { flexDirection: "row", flexWrap: "wrap", gap: space.x2, paddingVertical: space.x3, borderBottomWidth: 1, borderBottomColor: colors.separator },
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
