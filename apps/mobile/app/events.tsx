import { useMemo } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useRouter } from "expo-router";
import { useConnection } from "../src/transport/ConnectionProvider";
import { useI18n } from "../src/i18n";
import { font, radius, space, type ThemeColors } from "../src/theme";
import { useTheme } from "../src/theme-context";
import { EmptyState } from "../src/ui/EmptyState";
import type { NotificationEvent } from "../src/notify/classifier";

function kindLabel(ev: NotificationEvent, t: ReturnType<typeof useI18n>["t"]): string {
  switch (ev.kind) {
    case "turn-complete":
      return t.events.kindTurnComplete;
    case "goal-complete":
      return t.events.kindGoalComplete;
    case "goal-blocked":
      return t.events.kindGoalBlocked;
    case "approval-waiting":
      return t.events.kindApprovalWaiting;
    case "question-waiting":
      return t.events.kindQuestionWaiting;
    case "context-pressure":
      return t.events.kindContextPressure;
    default:
      return ev.kind;
  }
}

function kindIcon(ev: NotificationEvent): string {
  switch (ev.kind) {
    case "turn-complete":
      return "↻";
    case "goal-complete":
      return "✓";
    case "goal-blocked":
      return "⛔";
    case "approval-waiting":
      return "🛡";
    case "question-waiting":
      return "?";
    case "context-pressure":
      return "◔";
    default:
      return "•";
  }
}

export default function EventsScreen() {
  const { notifications } = useConnection();
  const { t } = useI18n();
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const router = useRouter();

  const rows = [...notifications].sort((a, b) => (b.receivedAt ?? 0) - (a.receivedAt ?? 0));

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <View style={styles.header}>
        <Text style={styles.title}>{t.events.title}</Text>
        <Text style={styles.subtitle}>{rows.length}</Text>
      </View>
      {rows.length === 0 ? (
        <EmptyState eyebrow={t.events.empty} text={t.events.emptyText} />
      ) : (
        <View style={styles.list}>
          {rows.map((ev, i) => {
            const route = ev.kind === "approval-waiting" || ev.kind === "question-waiting"
              ? `/approval/${encodeURIComponent(ev.rpcId ?? "")}`
              : `/chat/${encodeURIComponent(ev.sessionId ?? "")}`;
            return (
              <Pressable
                key={`${ev.dedupeKey}-${i}`}
                style={({ pressed }) => [styles.card, pressed && styles.cardPressed]}
                onPress={() => router.push(route as never)}
                accessibilityRole="button"
                accessibilityLabel={kindLabel(ev, t)}
              >
                <View style={styles.cardTop}>
                  <View style={styles.kindWrap}>
                    <Text style={styles.kindIcon}>{kindIcon(ev)}</Text>
                    <Text style={styles.kindTitle}>{kindLabel(ev, t)}</Text>
                  </View>
                  <Text style={styles.time}>
                    {ev.receivedAt !== undefined
                      ? new Date(ev.receivedAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
                      : ""}
                  </Text>
                </View>
                {ev.prompt !== undefined && ev.prompt.length > 0 && (
                  <Text style={styles.prompt} numberOfLines={2}>{ev.prompt}</Text>
                )}
                {ev.percent !== undefined && (
                  <Text style={styles.prompt}>{t.events.kindContextPressure} · {ev.percent}%</Text>
                )}
                <Text style={styles.meta} numberOfLines={1}>
                  {ev.sessionId ? `${t.events.session} ${ev.sessionId}` : ev.rpcId ?? ""}
                </Text>
              </Pressable>
            );
          })}
        </View>
      )}
    </ScrollView>
  );
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    screen: { flex: 1, backgroundColor: colors.bg },
    content: { padding: space.x5, gap: space.x3, paddingBottom: space.x7 },
    header: { gap: space.x1, marginBottom: space.x2 },
    title: { color: colors.text, fontFamily: font.display, fontSize: 28, fontWeight: "600", letterSpacing: -0.5 },
    subtitle: { color: colors.textMuted, fontSize: font.caption },
    list: { gap: space.x3 },
    card: {
      backgroundColor: colors.surface,
      borderRadius: radius.card,
      borderWidth: 1,
      borderColor: colors.separator,
      padding: space.x4,
      gap: space.x2,
    },
    cardPressed: { opacity: 0.85 },
    cardTop: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: space.x3 },
    kindWrap: { flexDirection: "row", alignItems: "center", gap: 8 },
    kindIcon: { fontSize: 16, color: colors.accent },
    kindTitle: { color: colors.text, fontSize: font.body, fontWeight: "600" },
    time: { color: colors.textDim, fontSize: font.eyebrow, fontFamily: font.mono },
    prompt: { color: colors.textMuted, fontSize: font.caption, lineHeight: 18 },
    meta: { color: colors.textDim, fontSize: font.eyebrow, fontFamily: font.mono },
  });
}
