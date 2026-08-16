import { useRouter } from "expo-router";
import { useEffect, useRef, useState } from "react";
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import * as Network from "expo-network";
import { useConnection, STATE_LABEL } from "../src/transport/ConnectionProvider";
import { tokenStore } from "../src/data/secureStoreAdapter";
import { hostStore } from "../src/discovery/hostStoreAdapter";
import type { RecentHost } from "../src/discovery/hostStore";
import { onboardingStore } from "../src/discovery/onboardingStoreAdapter";
import { registerPairDeepLink } from "../src/discovery/pairLink";
import { discoverHosts, type DiscoveredHost } from "../src/discovery/discover";
import { colors, font, radius, space, stroke } from "../src/theme";
import { WhaleMark } from "../src/ui/WhaleMark";
import { StatusChip, type StatusTone } from "../src/ui/StatusChip";
import { SectionLabel } from "../src/ui/SectionLabel";
import { Field } from "../src/ui/Field";
import { Button } from "../src/ui/Button";

const STATE_TONE: Record<string, StatusTone> = {
  online: "success",
  connecting: "warn",
  backoff: "warn",
  offline: "danger",
};

export default function ConnectScreen() {
  const { state, describe, connect, disconnect } = useConnection();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [host, setHost] = useState("");
  const [port, setPort] = useState("3080");
  const [token, setToken] = useState("");
  const [busy, setBusy] = useState(false);
  const [recent, setRecent] = useState<RecentHost[]>([]);
  const [found, setFound] = useState<DiscoveredHost[]>([]);
  const [discovering, setDiscovering] = useState(false);
  const [discoverError, setDiscoverError] = useState("");
  const justConnected = useRef(false);

  // 首启引导 + 最近主机
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const seen = await onboardingStore.seen();
      if (!cancelled && !seen) {
        router.replace("/onboarding" as never);
        return;
      }
      const list = await hostStore.list();
      if (!cancelled) setRecent(list);
    })();
    return () => {
      cancelled = true;
    };
  }, [router]);

  // 配对深链（dshremote://pair?…）→ 一键连接
  useEffect(() => {
    return registerPairDeepLink((p) => {
      setHost(p.host);
      setPort(String(p.port));
      if (p.token) setToken(p.token);
      justConnected.current = true;
      void connect(p.host, p.port, p.token);
      router.replace("/sessions");
    });
  }, [connect, router]);

  useEffect(() => {
    void tokenStore.get().then((t) => {
      if (t) setToken(t);
    });
  }, []);

  const online = state === "online";

  useEffect(() => {
    if (online && justConnected.current) {
      justConnected.current = false;
      router.push("/sessions");
    }
  }, [online, router]);

  const onConnect = async () => {
    if (!host.trim() || busy) return;
    setBusy(true);
    justConnected.current = true;
    try {
      const t = token.trim();
      if (t) await tokenStore.set(t);
      await connect(host.trim(), Number.parseInt(port || "3080", 10), t || undefined);
    } finally {
      setBusy(false);
    }
  };

  const connectTo = async (h: string, p: number, t?: string) => {
    setHost(h);
    setPort(String(p));
    if (t) setToken(t);
    justConnected.current = true;
    await connect(h, p, t);
    router.push("/sessions");
  };

  const onDiscover = async () => {
    if (discovering) return;
    setDiscovering(true);
    setDiscoverError("");
    try {
      const ip = await Network.getIpAddressAsync();
      if (!ip) {
        setDiscoverError("无法获取本机 IP（请在真机/局域网下使用）");
        return;
      }
      const list = await discoverHosts({ localIp: ip });
      setFound(list);
      if (list.length === 0) setDiscoverError("没有发现 DSH 实例——请确认电脑已启动插件且与手机同一网络");
    } catch (err) {
      console.warn("[discover] failed", err);
      setDiscoverError("自动发现失败，请手动输入地址");
    } finally {
      setDiscovering(false);
    }
  };

  const onClearToken = async () => {
    setToken("");
    await tokenStore.clear();
  };

  const describeName =
    describe && typeof describe === "object"
      ? `${(describe as { name?: string }).name ?? ""} ${(describe as { version?: string }).version ?? ""}`.trim()
      : "";

  const list = found.length > 0 ? found.map((f) => ({ key: `found-${f.host}`, host: f.host, port: f.port, name: f.name })) : recent.map((r) => ({ key: `recent-${r.host}-${r.port}`, host: r.host, port: r.port, name: r.name }));

  return (
    <KeyboardAvoidingView
      style={[styles.screen, { paddingTop: insets.top + space.x5 }]}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <View style={styles.hero}>
          <WhaleMark size={44} />
          <View style={styles.heroText}>
            <Text style={styles.display}>harness remote</Text>
            <SectionLabel>DeepSeek Harness · LAN remote</SectionLabel>
          </View>
        </View>

        <View style={styles.statusRow}>
          <StatusChip tone={STATE_TONE[state] ?? "neutral"} label={STATE_LABEL[state] ?? state} />
          {describeName.length > 0 && <Text style={styles.describe} numberOfLines={1}>{describeName}</Text>}
        </View>

        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <SectionLabel>{found.length > 0 ? "Discovered hosts" : "Recent hosts"}</SectionLabel>
            <Pressable onPress={() => router.push("/scan" as never)} hitSlop={8}>
              <Text style={styles.scanLink}>扫码配对 →</Text>
            </Pressable>
          </View>
          <View style={styles.hostList}>
            {list.length === 0 && (
              <View style={styles.hostEmpty}>
                <Text style={styles.hostEmptyText}>
                  {discovering ? "扫描中…" : "没有主机——扫码配对，或点「自动发现」"}
                </Text>
              </View>
            )}
            {list.map((h) => (
              <Pressable
                key={h.key}
                style={({ pressed }) => [styles.hostRow, pressed && styles.hostRowPressed]}
                onPress={() => void connectTo(h.host, h.port)}
              >
                <View style={styles.hostRowText}>
                  <Text style={styles.hostRowTitle} numberOfLines={1}>
                    {h.name ?? h.host}
                  </Text>
                  <Text style={styles.hostRowMeta} numberOfLines={1}>
                    {`${h.host}:${h.port}`}
                  </Text>
                </View>
                <Text style={styles.hostRowArrow}>→</Text>
              </Pressable>
            ))}
            {discoverError.length > 0 && <Text style={styles.discoverError}>{discoverError}</Text>}
          </View>
          <View style={styles.discoverRow}>
            <Button tone="ghost" label={discovering ? "扫描中…" : "自动发现"} onPress={() => void onDiscover()} disabled={discovering} style={styles.flex} />
            <Button label="扫码配对" onPress={() => router.push("/scan" as never)} style={styles.flex} />
          </View>
        </View>

        <View style={styles.card}>
          <SectionLabel>Manual connect</SectionLabel>
          <Field
            label="HOST"
            mono
            placeholder="192.168.1.5"
            autoCapitalize="none"
            autoCorrect={false}
            value={host}
            onChangeText={setHost}
            editable={!online}
          />
          <Field
            label="PORT"
            mono
            placeholder="3080"
            keyboardType="number-pad"
            value={port}
            onChangeText={setPort}
            editable={!online}
          />
          <Field
            label="PAIR TOKEN · OPTIONAL"
            mono
            placeholder="配对 token（可选）"
            autoCapitalize="none"
            autoCorrect={false}
            value={token}
            onChangeText={setToken}
            editable={!online}
            secureTextEntry
          />
          {token.length > 0 && (
            <Pressable style={styles.clearToken} onPress={onClearToken}>
              <Text style={styles.clearTokenText}>清除已保存的配对</Text>
            </Pressable>
          )}
        </View>

        {online ? (
          <Button tone="danger" label="断开连接" onPress={disconnect} full />
        ) : (
          <Button
            label={busy ? "连接中…" : "连接"}
            onPress={() => void onConnect()}
            disabled={!host.trim() || busy}
            full
          />
        )}

        {online && (
          <Pressable style={styles.linkRow} onPress={() => router.push("/sessions")}>
            <Text style={styles.link}>进入 Sessions →</Text>
          </Pressable>
        )}

        <View style={styles.warning}>
          <Text style={styles.warningText}>
            {token.trim()
              ? "已启用配对 token——仍请仅在可信网络使用"
              : "LAN 直连，未配对时无鉴权——请仅在可信网络使用"}
          </Text>
        </View>

        <Text style={styles.version}>v0.1.0 · dsh-remote</Text>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  content: { paddingHorizontal: space.x5, paddingBottom: space.x7, gap: space.x5 },
  hero: { flexDirection: "row", alignItems: "center", gap: space.x4 },
  heroText: { gap: space.x1 },
  display: { color: colors.text, fontSize: font.display, fontWeight: "700", letterSpacing: -0.3 },
  statusRow: { flexDirection: "row", alignItems: "center", gap: space.x3, flexWrap: "wrap" },
  describe: { color: colors.textMuted, fontSize: font.caption, fontFamily: font.mono, flexShrink: 1 },
  section: { gap: space.x2 },
  sectionHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  scanLink: { color: colors.accent, fontSize: font.caption, fontFamily: font.mono },
  hostList: {
    backgroundColor: colors.surface,
    borderRadius: radius.card,
    borderWidth: stroke.hairline,
    borderColor: colors.border,
    overflow: "hidden",
  },
  hostEmpty: { padding: space.x4 },
  hostEmptyText: { color: colors.textDim, fontSize: font.caption, lineHeight: 18 },
  hostRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: space.x4,
    paddingVertical: space.x3,
    borderBottomWidth: stroke.hairline,
    borderBottomColor: colors.border,
  },
  hostRowPressed: { backgroundColor: colors.surface2 },
  hostRowText: { flex: 1, gap: 2 },
  hostRowTitle: { color: colors.text, fontSize: font.body, fontWeight: "600" },
  hostRowMeta: { color: colors.textDim, fontSize: font.eyebrow, fontFamily: font.mono },
  hostRowArrow: { color: colors.textDim, fontSize: font.body, fontFamily: font.mono },
  discoverError: { color: colors.warn, fontSize: font.caption, padding: space.x3 },
  discoverRow: { flexDirection: "row", gap: space.x3 },
  flex: { flex: 1 },
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.card,
    borderWidth: stroke.hairline,
    borderColor: colors.border,
    padding: space.x4,
    gap: space.x3,
  },
  clearToken: { alignItems: "flex-start" },
  clearTokenText: { color: colors.danger, fontSize: font.caption },
  linkRow: { alignItems: "center", paddingVertical: space.x2 },
  link: { color: colors.accent, fontSize: font.body },
  warning: {
    backgroundColor: colors.accentSoft,
    borderRadius: radius.card,
    padding: space.x3,
  },
  warningText: { color: colors.warn, fontSize: font.caption, lineHeight: 18 },
  version: { color: colors.textDim, fontSize: font.caption, fontFamily: font.mono, textAlign: "center" },
});
