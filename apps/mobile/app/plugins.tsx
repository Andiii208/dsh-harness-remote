import { useEffect, useMemo, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useConnection } from "../src/transport/ConnectionProvider";
import type { PluginCommand, PluginInfo, PluginListResult } from "@dsh-remote/protocol";
import { font, radius, space, type ThemeColors } from "../src/theme";
import { useTheme } from "../src/theme-context";
import { SectionLabel } from "../src/ui/SectionLabel";
import { StatusChip } from "../src/ui/StatusChip";
import { haptic } from "../src/ui/haptics";

function riskLabel(risk?: PluginCommand["risk"]): string | null {
  switch (risk) {
    case "read":
      return "只读";
    case "write":
      return "写入";
    case "approve":
      return "需审批";
    default:
      return null;
  }
}

function CommandRow({ command }: { command: PluginCommand }) {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const { pluginExec } = useConnection();
  const [notice, setNotice] = useState("");
  const run = async () => {
    void haptic("light");
    const r = await pluginExec(command.id);
    setNotice(r?.ok === false ? `执行失败：${r.error?.message ?? "未知错误"}` : "已发送");
    setTimeout(() => setNotice(""), 1600);
  };
  const risk = riskLabel(command.risk);
  return (
    <Pressable style={({ pressed }) => [styles.itemRow, pressed && styles.itemRowPressed]} onPress={() => void run()} accessibilityRole="button" accessibilityLabel={command.title}>
      <View style={styles.itemBody}>
        <Text style={styles.itemTitle}>{command.title}</Text>
        {command.description ? <Text style={styles.itemDesc}>{command.description}</Text> : null}
        {risk ? <Text style={styles.itemMeta}>{risk}</Text> : null}
      </View>
      <Text style={styles.itemAction}>{notice || "执行"}</Text>
    </Pressable>
  );
}

function SettingRow({ pluginId, itemKey, title, value }: { pluginId: string; itemKey: string; title: string; value: unknown }) {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  return (
    <View style={styles.itemRow}>
      <View style={styles.itemBody}>
        <Text style={styles.itemTitle}>{title}</Text>
        <Text style={styles.itemMeta}>{pluginId} · {itemKey}</Text>
      </View>
      <Text style={styles.itemValue} numberOfLines={1}>{String(value)}</Text>
    </View>
  );
}

export default function PluginsScreen() {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const { pluginList } = useConnection();
  const [list, setList] = useState<PluginListResult | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    void pluginList().then((r) => {
      if (alive) {
        setList(r);
        setLoading(false);
      }
    });
    return () => {
      alive = false;
    };
  }, [pluginList]);

  const plugins: PluginInfo[] = list?.plugins ?? [];
  const commands = list?.commands ?? [];
  const settings = list?.settings ?? [];

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <View style={styles.header}>
        <StatusChip tone={plugins.length > 0 ? "success" : "warn"} label={plugins.length > 0 ? `${plugins.length} 个插件` : "未发现插件"} />
        <Text style={styles.headerHint}>能力由宿主动态提供，读不到时自动隐藏</Text>
      </View>

      {loading && <Text style={styles.empty}>正在读取插件能力…</Text>}

      {!loading && plugins.length === 0 && (
        <View style={styles.emptyWrap}>
          <Text style={styles.empty}>当前宿主未暴露插件能力</Text>
          <Text style={styles.emptyHint}>在电脑端 DSH 安装插件后，手机会自动展示其指令与设置</Text>
        </View>
      )}

      {commands.length > 0 && (
        <View style={styles.group}>
          <SectionLabel>插件指令</SectionLabel>
          <View style={styles.card}>
            {commands.map((c) => (
              <CommandRow key={c.id} command={c} />
            ))}
          </View>
        </View>
      )}

      {settings.length > 0 && (
        <View style={styles.group}>
          <SectionLabel>插件设置</SectionLabel>
          <View style={styles.card}>
            {settings.map((s, i) => (
              <SettingRow key={`${s.key}-${i}`} pluginId={s.key.split(".")[0] ?? ""} itemKey={s.key} title={s.title} value={s.value} />
            ))}
          </View>
          <Text style={styles.footnote}>设置项当前只读展示；修改能力由宿主提供后开放</Text>
        </View>
      )}
    </ScrollView>
  );
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    screen: { flex: 1, backgroundColor: colors.bg },
    content: { padding: space.x5, gap: space.x4, paddingBottom: space.x7 },
    header: { gap: space.x2 },
    headerHint: { color: colors.textMuted, fontSize: font.caption },
    group: { gap: space.x2 },
    card: {
      backgroundColor: colors.surface,
      borderRadius: radius.card,
      paddingHorizontal: space.x4,
    },
    itemRow: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      gap: space.x3,
      paddingVertical: space.x4,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: colors.separator,
    },
    itemRowPressed: { opacity: 0.7 },
    itemBody: { flex: 1, gap: 3 },
    itemTitle: { color: colors.text, fontSize: font.body, fontWeight: "500" },
    itemDesc: { color: colors.textMuted, fontSize: font.caption, lineHeight: 18 },
    itemMeta: { color: colors.warn, fontSize: 10, fontFamily: font.mono },
    itemAction: { color: colors.accent, fontSize: font.caption, fontWeight: "500" },
    itemValue: { color: colors.textMuted, fontSize: font.caption, fontFamily: font.mono, flexShrink: 1, textAlign: "right" },
    emptyWrap: { gap: space.x2, alignItems: "center", paddingVertical: space.x7 },
    empty: { color: colors.textMuted, fontSize: font.body, textAlign: "center" },
    emptyHint: { color: colors.textDim, fontSize: font.caption, textAlign: "center", lineHeight: 18 },
    footnote: { color: colors.textDim, fontSize: font.caption, lineHeight: 18 },
  });
}
