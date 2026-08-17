import { useEffect, useMemo, useState } from "react";
import { ScrollView, StyleSheet, Switch, Text, View } from "react-native";
import { useRouter } from "expo-router";
import * as Linking from "expo-linking";
import Constants from "expo-constants";
import { useConnection, STATE_LABEL } from "../src/transport/ConnectionProvider";
import { autoReconnectStore } from "../src/discovery/autoReconnectStoreAdapter";
import { isExpoGo } from "../src/notify/expoEnv";
import { Button } from "../src/ui/Button";
import { font, radius, space, type ThemeColors } from "../src/theme";
import { useTheme } from "../src/theme-context";
import { SectionLabel } from "../src/ui/SectionLabel";
import { StatusChip } from "../src/ui/StatusChip";

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

export default function SettingsScreen() {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const { state, describe, lastEndpoint, notifications, disconnect, notificationsEnabled, setNotificationsEnabled } = useConnection();
  const router = useRouter();
  const [autoReconnect, setAutoReconnect] = useState(true);
  useEffect(() => {
    void autoReconnectStore.enabled().then(setAutoReconnect);
  }, []);
  const toggleAutoReconnect = async (v: boolean) => {
    setAutoReconnect(v);
    await autoReconnectStore.setEnabled(v);
  };
  const describeName =
    describe && typeof describe === "object"
      ? `${(describe as { name?: string }).name ?? ""} ${(describe as { version?: string }).version ?? ""}`.trim()
      : "—";

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <View style={styles.card}>
        <View style={styles.statusRow}>
          <Text style={styles.rowLabel}>状态</Text>
          <StatusChip
            tone={state === "online" ? "success" : state === "offline" ? "danger" : "warn"}
            label={STATE_LABEL[state] ?? state}
          />
        </View>
        <Row label="目标主机" value={lastEndpoint ? `${lastEndpoint.host}:${lastEndpoint.port}` : "未连接"} />
        <Row label="远端实例" value={describeName} />
        <View style={styles.statusRow}>
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

        <View style={styles.statusRow}>
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
        <View style={styles.linkRow}>
          <Button tone="ghost" label="审批 / 提问处理历史" onPress={() => router.push("/approval/history" as never)} full />
        </View>
      </View>

      <Group eyebrow="关于">
        <Row label="应用" value="harness remote" />
        <Row label="版本" value={Constants.expoConfig?.version ? `v${Constants.expoConfig.version}` : "v0.1.0"} />
        <Row label="项目" value="dsh-remote · DeepSeek Harness 手机视口" />
        <View style={styles.linkRow}>
          <Button tone="ghost" label="GitHub · 使用手册" onPress={() => void Linking.openURL("https://github.com/Andiii208/dsh-remote")} full />
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
    statusRow: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      gap: space.x3,
      paddingVertical: space.x3,
      borderBottomWidth: 1,
      borderBottomColor: colors.separator,
    },
    rowLabel: { color: colors.text, fontSize: font.body },
    rowValue: { color: colors.textMuted, fontSize: font.caption, flexShrink: 1, textAlign: "right" },
    disconnectRow: { paddingVertical: space.x3 },
    linkRow: { paddingVertical: space.x3 },
    hint: { color: colors.textMuted, fontSize: font.caption, lineHeight: 18, paddingVertical: space.x3 },
    sectionSeparator: {
      height: StyleSheet.hairlineWidth,
      backgroundColor: colors.separator,
      marginVertical: space.x3,
    },
  });
}
