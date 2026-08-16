import { useEffect, useState } from "react";
import { ScrollView, StyleSheet, Switch, Text, View } from "react-native";
import * as Linking from "expo-linking";
import Constants from "expo-constants";
import { useConnection, STATE_LABEL } from "../src/transport/ConnectionProvider";
import { autoReconnectStore } from "../src/discovery/autoReconnectStoreAdapter";
import { Button } from "../src/ui/Button";
import { colors, font, radius, space, stroke } from "../src/theme";
import { SectionLabel } from "../src/ui/SectionLabel";
import { StatusChip } from "../src/ui/StatusChip";

function Group({ eyebrow, children }: { eyebrow: string; children: React.ReactNode }) {
  return (
    <View style={styles.group}>
      <SectionLabel>{eyebrow}</SectionLabel>
      <View style={styles.card}>{children}</View>
    </View>
  );
}

function Row({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <View style={styles.row}>
      <Text style={styles.rowLabel}>{label}</Text>
      <Text style={[styles.rowValue, mono && styles.rowValueMono]} numberOfLines={1}>
        {value}
      </Text>
    </View>
  );
}

export default function SettingsScreen() {
  const { state, describe, lastEndpoint, notifications, disconnect } = useConnection();
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
      <Group eyebrow="Connection">
        <View style={styles.statusRow}>
          <Text style={styles.rowLabel}>状态</Text>
          <StatusChip
            tone={state === "online" ? "success" : state === "offline" ? "danger" : "warn"}
            label={STATE_LABEL[state] ?? state}
          />
        </View>
        <Row label="目标主机" value={lastEndpoint ? `${lastEndpoint.host}:${lastEndpoint.port}` : "未连接"} mono />
        <Row label="远端实例" value={describeName} mono />
        <View style={styles.statusRow}>
          <Text style={styles.rowLabel}>自动重连</Text>
          <Switch
            value={autoReconnect}
            onValueChange={(v) => void toggleAutoReconnect(v)}
            trackColor={{ false: colors.surface3, true: colors.accent }}
            thumbColor={colors.text}
          />
        </View>
        {state === "online" && (
          <View style={styles.disconnectRow}>
            <Button tone="danger" label="断开连接" onPress={disconnect} full />
          </View>
        )}
      </Group>

      <Group eyebrow="Notifications">
        <Row label="本地通知" value={notifications.length > 0 ? `${notifications.length} 条未读` : "无"} />
      </Group>

      <Group eyebrow="About">
        <Row label="应用" value="harness remote" />
        <Row label="版本" value={Constants.expoConfig?.version ? `v${Constants.expoConfig.version}` : "v0.1.0"} mono />
        <Row label="项目" value="dsh-remote · DeepSeek Harness 手机视口" />
        <View style={styles.linkRow}>
          <Button tone="ghost" label="GitHub · 使用手册" onPress={() => void Linking.openURL("https://github.com/Andiii208/dsh-remote")} full />
        </View>
      </Group>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  content: { padding: space.x5, gap: space.x5, paddingBottom: space.x7 },
  group: { gap: space.x2 },
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.card,
    borderWidth: stroke.hairline,
    borderColor: colors.border,
    paddingHorizontal: space.x4,
    paddingVertical: space.x2,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: space.x3,
    paddingVertical: space.x3,
    borderBottomWidth: stroke.hairline,
    borderBottomColor: colors.border,
  },
  statusRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: space.x3,
    paddingVertical: space.x3,
    borderBottomWidth: stroke.hairline,
    borderBottomColor: colors.border,
  },
  rowLabel: { color: colors.text, fontSize: font.body },
  disconnectRow: { paddingVertical: space.x3 },
  linkRow: { paddingVertical: space.x3 },
  rowValue: { color: colors.textMuted, fontSize: font.caption, flexShrink: 1, textAlign: "right" },
  rowValueMono: { fontFamily: font.mono, color: colors.textMuted },
});
