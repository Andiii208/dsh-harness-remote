import { useLocalSearchParams, useRouter } from "expo-router";
import { useState } from "react";
import { Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { useConnection } from "../../src/transport/ConnectionProvider";
import { colors, font, radius, space, stroke } from "../../src/theme";

export default function ApprovalScreen() {
  const { rpcId } = useLocalSearchParams<{ rpcId: string }>();
  const id = Array.isArray(rpcId) ? rpcId[0] : rpcId;
  const { pending, respond } = useConnection();
  const router = useRouter();
  const [answer, setAnswer] = useState("");
  const [busy, setBusy] = useState(false);

  const req = id ? pending.find((p) => p.rpcId === id) : undefined;

  const done = async (result: unknown) => {
    if (!id || busy) return;
    setBusy(true);
    try {
      await respond(id, result);
      router.back();
    } finally {
      setBusy(false);
    }
  };

  if (!req) {
    return (
      <View style={styles.screen}>
        <Text style={styles.muted}>请求不存在或已处理</Text>
      </View>
    );
  }

  const payload = (req.payload ?? {}) as Record<string, unknown>;
  const isApproval = req.kind === "approval";

  return (
    <View style={styles.screen}>
      <View style={[styles.card, isApproval ? styles.cardApproval : styles.cardQuestion]}>
        <Text style={styles.kind}>{isApproval ? "权限请求" : "提问"}</Text>

        {isApproval ? (
          <>
            <Text style={styles.prompt}>{String(payload.prompt ?? "允许执行？")}</Text>
            {payload.command !== undefined && (
              <View style={styles.commandBox}>
                <Text style={styles.command}>{String(payload.command)}</Text>
              </View>
            )}
            <View style={styles.buttonRow}>
              <Pressable
                style={[styles.button, styles.buttonReject]}
                onPress={() => done({ approved: false })}
                disabled={busy}
              >
                <Text style={styles.buttonRejectText}>拒绝</Text>
              </Pressable>
              <Pressable
                style={[styles.button, styles.buttonApprove]}
                onPress={() => done({ approved: true })}
                disabled={busy}
              >
                <Text style={styles.buttonApproveText}>批准</Text>
              </Pressable>
            </View>
          </>
        ) : (
          <>
            <Text style={styles.prompt}>{String(payload.question ?? "请回答")}</Text>
            <TextInput
              style={styles.input}
              placeholder="回答…"
              placeholderTextColor={colors.textMuted}
              value={answer}
              onChangeText={setAnswer}
              multiline
            />
            <Pressable
              style={[styles.button, styles.buttonApprove, !answer.trim() && styles.buttonDisabled]}
              onPress={() => done({ answer: answer.trim() })}
              disabled={!answer.trim() || busy}
            >
              <Text style={styles.buttonApproveText}>提交回答</Text>
            </Pressable>
          </>
        )}
      </View>
    </View>
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
  cardApproval: { borderLeftWidth: 4, borderLeftColor: colors.warn },
  cardQuestion: { borderLeftWidth: 4, borderLeftColor: colors.accent },
  kind: {
    color: colors.textMuted,
    fontSize: font.body - 4,
    fontFamily: font.mono,
    textTransform: "uppercase",
    letterSpacing: 1,
  },
  prompt: { color: colors.text, fontSize: font.body, lineHeight: 22 },
  commandBox: {
    backgroundColor: colors.surface2,
    borderRadius: radius.card,
    padding: space.x3,
    borderWidth: stroke.hairline,
    borderColor: colors.border,
  },
  command: { color: colors.text, fontFamily: font.mono, fontSize: font.transcript },
  buttonRow: { flexDirection: "row", gap: space.x3 },
  button: { flex: 1, borderRadius: radius.card, alignItems: "center", paddingVertical: space.x3 + 2 },
  buttonApprove: { backgroundColor: colors.accent },
  buttonApproveText: { color: "#FFFFFF", fontWeight: "600", fontSize: font.body },
  buttonReject: { backgroundColor: colors.surface2, borderWidth: stroke.hairline, borderColor: colors.border },
  buttonRejectText: { color: colors.danger, fontWeight: "600", fontSize: font.body },
  buttonDisabled: { opacity: 0.4 },
  input: {
    backgroundColor: colors.surface2,
    borderColor: colors.border,
    borderWidth: stroke.hairline,
    borderRadius: radius.card,
    color: colors.text,
    padding: space.x3,
    minHeight: 80,
    textAlignVertical: "top",
  },
  muted: { color: colors.textMuted, textAlign: "center", marginTop: space.x6 },
});
