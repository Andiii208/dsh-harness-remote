import { useLocalSearchParams, useRouter } from "expo-router";
import { useMemo, useState } from "react";
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, View } from "react-native";
import { useConnection } from "../../src/transport/ConnectionProvider";
import { font, radius, space, type ThemeColors } from "../../src/theme";
import { Field } from "../../src/ui/Field";
import { Button } from "../../src/ui/Button";
import { useTheme } from "../../src/theme-context";
import { haptic } from "../../src/ui/haptics";

export default function ApprovalScreen() {
  const { rpcId } = useLocalSearchParams<{ rpcId: string }>();
  const id = Array.isArray(rpcId) ? rpcId[0] : rpcId;
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const { pending, respond } = useConnection();
  const router = useRouter();
  const [answer, setAnswer] = useState("");
  const [busy, setBusy] = useState(false);

  const req = id ? pending.find((p) => p.rpcId === id) : undefined;

  const done = async (result: unknown) => {
    if (!id || busy) return;
    setBusy(true);
    const approved = (result as { approved?: boolean })?.approved === true;
    try {
      await respond(id, result);
      void haptic(approved ? "success" : "warning");
      router.back();
    } catch (err) {
      console.warn("[approval] respond failed", err);
      void haptic("error");
    } finally {
      setBusy(false);
    }
  };

  if (!req) {
    return (
      <View style={styles.screen}>
        <View style={styles.card}>
          <Text style={styles.doneTitle}>已处理</Text>
          <Text style={styles.prompt}>该请求已处理或不存在</Text>
          <Button label="返回" onPress={() => router.back()} full />
        </View>
      </View>
    );
  }

  const payload = (req.payload ?? {}) as Record<string, unknown>;
  const isApproval = req.kind === "approval";
  const rail = isApproval ? colors.warn : colors.accent;

  return (
    <KeyboardAvoidingView
      style={styles.screen}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <View style={styles.card}>
          <View style={styles.kindRow}>
            <View style={styles.kindWrap}>
              <View style={[styles.kindDot, { backgroundColor: rail }]} />
              <Text style={[styles.kindTag, { color: rail }]}>{isApproval ? "审批" : "提问"}</Text>
            </View>
            {id && <Text style={styles.rpcId}>{id}</Text>}
          </View>
          <Text style={styles.prompt}>{String(payload.prompt ?? (isApproval ? "允许执行？" : "请回答"))}</Text>

          {isApproval ? (
            <>
              {payload.command !== undefined && (
                <View style={styles.commandBox}>
                  <Text style={styles.command}>{String(payload.command)}</Text>
                </View>
              )}
              <View style={styles.buttonRow}>
                <Button label="批准" onPress={() => done({ approved: true })} disabled={busy} style={styles.flex} />
                <Button tone="danger" label="拒绝" onPress={() => done({ approved: false })} disabled={busy} style={styles.flex} />
              </View>
            </>
          ) : (
            <>
              <Field
                placeholder="回答…"
                value={answer}
                onChangeText={setAnswer}
                multiline
                style={styles.answerInput}
              />
              <Button
                label="提交回答"
                onPress={() => done({ answer: answer.trim() })}
                disabled={!answer.trim() || busy}
                full
              />
              <Button tone="danger" label="跳过" onPress={() => done({ skipped: true })} disabled={busy} full />
            </>
          )}
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    screen: { flex: 1, backgroundColor: colors.bg },
    content: { flexGrow: 1, justifyContent: "center", padding: space.x5, gap: space.x4 },
    card: {
      backgroundColor: colors.surface,
      borderRadius: radius.card,
      padding: space.x5,
      gap: space.x3,
    },
    flex: { flex: 1 },
    doneTitle: { color: colors.success, fontSize: font.section + 1, fontWeight: "600" },
    prompt: { color: colors.text, fontSize: font.body + 1, lineHeight: 22 },
    commandBox: {
      backgroundColor: colors.codeBg,
      borderRadius: radius.control,
      padding: space.x3,
    },
    command: { color: colors.codeText, fontFamily: font.mono, fontSize: font.transcript },
    buttonRow: { flexDirection: "row", gap: space.x3 },
    kindRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: space.x3 },
    kindWrap: { flexDirection: "row", alignItems: "center", gap: 6 },
    kindDot: { width: 4, height: 4, borderRadius: 2 },
    kindTag: { fontSize: font.caption, fontWeight: "600" },
    rpcId: { color: colors.textDim, fontSize: font.eyebrow, fontFamily: font.mono },
    answerInput: { minHeight: 88, textAlignVertical: "top", height: undefined },
  });
}
