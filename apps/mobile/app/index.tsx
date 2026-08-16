import { useRouter } from "expo-router";
import { useState } from "react";
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useConnection, STATE_LABEL } from "../src/transport/ConnectionProvider";
import { colors, font, radius, space, stroke } from "../src/theme";

const DOT: Record<string, string> = {
  online: colors.success,
  connecting: colors.warn,
  backoff: colors.warn,
  offline: colors.danger,
};

export default function ConnectScreen() {
  const { state, describe, connect, disconnect } = useConnection();
  const router = useRouter();
  const [host, setHost] = useState("");
  const [port, setPort] = useState("3080");
  const [busy, setBusy] = useState(false);

  const online = state === "online";

  const onConnect = async () => {
    if (!host.trim() || busy) return;
    setBusy(true);
    try {
      await connect(host.trim(), Number.parseInt(port || "3080", 10));
    } finally {
      setBusy(false);
    }
    if (state === "online") router.push("/sessions");
  };

  return (
    <KeyboardAvoidingView
      style={styles.screen}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <View style={styles.card}>
        <Text style={styles.title}>dsh-remote</Text>
        <Text style={styles.subtitle}>DeepSeek Harness · 手机视口</Text>

        <View style={styles.statusRow}>
          <View style={[styles.dot, { backgroundColor: DOT[state] ?? colors.textMuted }]} />
          <Text style={styles.statusText}>{STATE_LABEL[state] ?? state}</Text>
        </View>

        <TextInput
          style={styles.input}
          placeholder="DSH 主机地址，如 192.168.1.5"
          placeholderTextColor={colors.textMuted}
          autoCapitalize="none"
          autoCorrect={false}
          value={host}
          onChangeText={setHost}
          editable={!online}
        />
        <TextInput
          style={styles.input}
          placeholder="端口"
          placeholderTextColor={colors.textMuted}
          keyboardType="number-pad"
          value={port}
          onChangeText={setPort}
          editable={!online}
        />

        {online ? (
          <Pressable style={[styles.button, styles.buttonGhost]} onPress={disconnect}>
            <Text style={styles.buttonGhostText}>断开连接</Text>
          </Pressable>
        ) : (
          <Pressable
            style={[styles.button, styles.buttonPrimary, (!host.trim() || busy) && styles.buttonDisabled]}
            onPress={onConnect}
            disabled={!host.trim() || busy}
          >
            <Text style={styles.buttonPrimaryText}>{busy ? "连接中…" : "连接"}</Text>
          </Pressable>
        )}

        {online && (
          <Pressable style={styles.linkRow} onPress={() => router.push("/sessions")}>
            <Text style={styles.link}>进入 Sessions →</Text>
          </Pressable>
        )}

        <View style={styles.warning}>
          <Text style={styles.warningText}>
            ⚠ LAN 直连，无鉴权——请仅在可信网络使用
          </Text>
        </View>

        {Boolean(describe) && (
          <Text style={styles.describe} numberOfLines={1}>
            {(describe as { name?: string }).name} {(describe as { version?: string }).version}
          </Text>
        )}
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg, justifyContent: "center", padding: space.x5 },
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.large,
    borderWidth: stroke.hairline,
    borderColor: colors.border,
    padding: space.x5,
    gap: space.x3,
  },
  title: { color: colors.text, fontSize: font.title, fontWeight: "700" },
  subtitle: { color: colors.textMuted, fontSize: font.body - 2 },
  statusRow: { flexDirection: "row", alignItems: "center", gap: space.x2 },
  dot: { width: 8, height: 8, borderRadius: 4 },
  statusText: { color: colors.text, fontSize: font.body - 1, fontFamily: font.mono },
  input: {
    backgroundColor: colors.surface2,
    borderColor: colors.border,
    borderWidth: stroke.hairline,
    borderRadius: radius.card,
    color: colors.text,
    paddingHorizontal: space.x3,
    paddingVertical: space.x3,
    fontSize: font.body,
  },
  button: {
    borderRadius: radius.card,
    alignItems: "center",
    paddingVertical: space.x3 + 2,
  },
  buttonPrimary: { backgroundColor: colors.accent },
  buttonPrimaryText: { color: "#FFFFFF", fontSize: font.body, fontWeight: "600" },
  buttonDisabled: { opacity: 0.5 },
  buttonGhost: { backgroundColor: colors.surface2, borderWidth: stroke.hairline, borderColor: colors.border },
  buttonGhostText: { color: colors.danger, fontSize: font.body, fontWeight: "600" },
  linkRow: { alignItems: "center", paddingVertical: space.x2 },
  link: { color: colors.accent, fontSize: font.body },
  warning: {
    backgroundColor: colors.accentSoft,
    borderRadius: radius.card,
    padding: space.x3,
  },
  warningText: { color: colors.warn, fontSize: font.body - 3, lineHeight: 18 },
  describe: { color: colors.textMuted, fontSize: font.body - 3, fontFamily: font.mono },
});
