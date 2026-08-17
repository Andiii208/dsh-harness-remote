import { useRouter } from "expo-router";
import { useEffect, useMemo, useRef, useState } from "react";
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
import Animated from "react-native-reanimated";
import * as Network from "expo-network";
import { useEntering } from "../src/ui/anim";
import { useConnection, STATE_LABEL } from "../src/transport/ConnectionProvider";
import { isRelayUrl } from "../src/transport/relayMode";
import { tokenStore } from "../src/data/secureStoreAdapter";
import { hostStore } from "../src/discovery/hostStoreAdapter";
import type { RecentHost } from "../src/discovery/hostStore";
import { draftStore } from "../src/discovery/draftStoreAdapter";
import { onboardingStore } from "../src/discovery/onboardingStoreAdapter";
import { registerPairDeepLink } from "../src/discovery/pairLink";
import { discoverHosts, type DiscoveredHost } from "../src/discovery/discover";
import { font, radius, space } from "../src/theme";
import { WhaleMark } from "../src/ui/WhaleMark";
import { StatusChip, type StatusTone } from "../src/ui/StatusChip";
import { Field } from "../src/ui/Field";
import { Button } from "../src/ui/Button";
import { ConnectingBar } from "../src/ui/ConnectingBar";
import { useTheme } from "../src/theme-context";
import { haptic } from "../src/ui/haptics";

const STATE_TONE: Record<string, StatusTone> = {
  online: "success",
  connecting: "warn",
  backoff: "warn",
  offline: "danger",
};

export default function ConnectScreen() {
  const { state, describe, relayPeerId, connect, disconnect } = useConnection();
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [host, setHost] = useState("");
  const [port, setPort] = useState("3080");
  const [token, setToken] = useState("");
  const [pairCode, setPairCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [recent, setRecent] = useState<RecentHost[]>([]);
  const [found, setFound] = useState<DiscoveredHost[]>([]);
  const [discovering, setDiscovering] = useState(false);
  const [discoverError, setDiscoverError] = useState("");
  const [connectError, setConnectError] = useState("");
  const [showRecent, setShowRecent] = useState(false);
  const [showToken, setShowToken] = useState(false);
  const justConnected = useRef(false);
  const discoverAbort = useRef<AbortController | null>(null);
  const heroEntering = useEntering(10, 260);

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
    });
  }, [connect, router]);

  useEffect(() => {
    void tokenStore.get().then((t) => {
      if (t) {
        setToken(t);
        setShowToken(true);
      }
    });
    void draftStore.get().then((d) => {
      if (d) {
        setHost(d.host);
        setPort(String(d.port));
      }
    });
  }, []);

  const online = state === "online";
  const hostRelayMode = isRelayUrl(host.trim());

  useEffect(() => {
    if (online && justConnected.current) {
      justConnected.current = false;
      setConnectError("");
      router.push("/sessions");
    }
    if (state === "offline") {
      if (justConnected.current) setConnectError("连接失败：请检查主机地址与网络");
      justConnected.current = false;
    }
  }, [online, state, router]);

  const onConnect = async () => {
    if (!host.trim() || busy) return;
    setBusy(true);
    setConnectError("");
    justConnected.current = true;
    void haptic("light");
    try {
      const t = token.trim();
      if (t) await tokenStore.set(t);
      // relay:// / ws:// / wss:// 填在 HOST 里，端口忽略。
      const relayMode = isRelayUrl(host.trim());
      const p = relayMode ? 0 : Number.parseInt(port || "3080", 10);
      void draftStore.set(host.trim(), p);
      await connect(host.trim(), p, t || undefined, pairCode.trim() || undefined);
    } finally {
      setBusy(false);
    }
  };

  const connectTo = async (h: string, p: number, t?: string) => {
    setHost(h);
    setPort(String(p));
    if (t) setToken(t);
    setConnectError("");
    justConnected.current = true;
    await connect(h, p, t);
  };

  useEffect(() => {
    return () => {
      discoverAbort.current?.abort();
    };
  }, []);

  const onDiscover = async () => {
    if (discovering) return;
    discoverAbort.current?.abort();
    discoverAbort.current = new AbortController();
    setDiscovering(true);
    setDiscoverError("");
    try {
      const ip = await Network.getIpAddressAsync();
      if (!ip) {
        setDiscoverError("无法获取本机 IP（请在真机/局域网下使用）");
        return;
      }
      const list = await discoverHosts({ localIp: ip, signal: discoverAbort.current.signal });
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

  const items = found.length > 0
    ? found.map((f) => ({ key: `found-${f.host}`, host: f.host, port: f.port, name: f.name, version: f.version, token: undefined }))
    : recent.map((r) => ({ key: `recent-${r.host}-${r.port}`, host: r.host, port: r.port, name: r.name, version: undefined, token: r.token }));

  const showList = found.length > 0 || showRecent;

  return (
    <KeyboardAvoidingView
      style={[styles.screen, { paddingTop: insets.top + space.x4 }]}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <Animated.View entering={heroEntering} style={styles.header}>
          <View style={styles.brand}>
            <WhaleMark size={34} />
            <Text style={styles.brandText}>harness remote</Text>
          </View>
          <StatusChip tone={STATE_TONE[state] ?? "neutral"} label={STATE_LABEL[state] ?? state} />
        </Animated.View>

        {state === "connecting" && <ConnectingBar />}

        {(describeName.length > 0 || (online && relayPeerId)) && (
          <View style={styles.stateRow}>
            {describeName.length > 0 && <Text style={styles.describe} numberOfLines={1}>{describeName}</Text>}
            {online && relayPeerId && <Text style={styles.pairedConsole} numberOfLines={1}>{relayPeerId} · paired</Text>}
          </View>
        )}

        <View style={styles.card}>
          <View style={styles.fieldsRow}>
            <View style={styles.hostField}>
              <Field
                label="主机"
                placeholder="192.168.1.5"
                autoCapitalize="none"
                autoCorrect={false}
                value={host}
                onChangeText={setHost}
                onBlur={() => void draftStore.set(host.trim(), hostRelayMode ? 0 : Number.parseInt(port || "3080", 10))}
                editable={!online}
              />
            </View>
            <View style={styles.portField}>
              <Field
                label="端口"
                placeholder="3080"
                keyboardType="number-pad"
                value={port}
                onChangeText={setPort}
                onBlur={() => void draftStore.set(host.trim(), hostRelayMode ? 0 : Number.parseInt(port || "3080", 10))}
                editable={!online && !hostRelayMode}
              />
            </View>
          </View>

          {hostRelayMode && (
            <Field
              label="配对码 · 可选"
              placeholder="6 位配对码（可选）"
              keyboardType="number-pad"
              maxLength={6}
              value={pairCode}
              onChangeText={setPairCode}
              editable={!online}
            />
          )}

          <View style={styles.advancedRow}>
            <Pressable onPress={() => setShowToken((v) => !v)} hitSlop={8} accessibilityRole="button" accessibilityLabel="展开配对高级设置">
              <Text style={styles.linkText}>{showToken ? "收起高级" : "高级"}</Text>
            </Pressable>
            {token.length > 0 && !showToken && <Text style={styles.savedToken}>已保存配对</Text>}
          </View>

          {showToken && (
            <Field
              label="配对 Token"
              placeholder="可选"
              autoCapitalize="none"
              autoCorrect={false}
              value={token}
              onChangeText={setToken}
              editable={!online}
              secureTextEntry
            />
          )}

          <Text style={styles.relayHint}>支持 relay:// 或 ws:// URL（Relay 模式）</Text>
          {showToken && token.length > 0 && (
            <Pressable style={({ pressed }) => [styles.clearToken, pressed && styles.textPressed]} onPress={onClearToken} accessibilityRole="button" accessibilityLabel="清除已保存的配对">
              <Text style={styles.clearTokenText}>清除已保存的配对</Text>
            </Pressable>
          )}
        </View>

        <View style={styles.quickRow}>
          <Pressable onPress={() => void onDiscover()} hitSlop={8} disabled={discovering} accessibilityRole="button" accessibilityLabel="自动发现主机">
            <Text style={styles.quickLink}>{discovering ? "扫描中…" : "自动发现"}</Text>
          </Pressable>
          <Text style={styles.quickSeparator}>·</Text>
          <Pressable onPress={() => router.push("/scan" as never)} hitSlop={8} accessibilityRole="button" accessibilityLabel="扫码配对">
            <Text style={styles.quickLink}>扫码配对</Text>
          </Pressable>
        </View>

        {online ? (
          <Button tone="danger" label="断开连接" onPress={() => { justConnected.current = false; void haptic("warning"); void disconnect(); }} full />
        ) : (
          <Button
            label={busy ? "连接中…" : "连接"}
            onPress={() => void onConnect()}
            disabled={!host.trim() || busy}
            full
          />
        )}
        {connectError.length > 0 && <Text style={styles.connectError}>{connectError}</Text>}

        {showList ? (
          <View style={styles.listCard}>
            <View style={styles.listHeader}>
              <Text style={styles.listTitle}>{found.length > 0 ? "发现的主机" : "历史主机"}</Text>
              {found.length === 0 && (
                <Pressable onPress={() => setShowRecent(false)} hitSlop={8} accessibilityRole="button" accessibilityLabel="收起历史主机">
                  <Text style={styles.linkText}>收起</Text>
                </Pressable>
              )}
            </View>
            {items.length === 0 ? (
              <Text style={styles.listEmpty}>暂无历史主机</Text>
            ) : (
              items.map((h) => (
                <Pressable
                  key={h.key}
                  style={({ pressed }) => [styles.hostRow, pressed && styles.hostRowPressed]}
                  onPress={() => void connectTo(h.host, h.port, h.token)}
                  accessibilityRole="button"
                  accessibilityLabel={`连接 ${h.host}:${h.port}`}
                >
                  <Text style={styles.hostRowText} numberOfLines={1}>
                    {h.host}:{h.port}
                  </Text>
                  <Text style={styles.hostRowArrow}>›</Text>
                </Pressable>
              ))
            )}
          </View>
        ) : (
          <Pressable onPress={() => setShowRecent(true)} style={styles.historyButton} hitSlop={8} accessibilityRole="button" accessibilityLabel="展开历史主机">
            <Text style={styles.linkText}>历史主机{recent.length > 0 ? ` · ${recent.length}` : ""} ›</Text>
          </Pressable>
        )}

        {discoverError.length > 0 && <Text style={styles.discoverError}>{discoverError}</Text>}
        {found.length > 0 && (
          <Text style={styles.discoverHint}>发现的实例首次连接可能需要配对 token——请用「扫码配对」获取</Text>
        )}

        {online && (
          <Pressable style={styles.linkRow} onPress={() => router.push("/sessions")} accessibilityRole="link" accessibilityLabel="进入 Sessions">
            <Text style={styles.link}>进入会话 →</Text>
          </Pressable>
        )}

        <Text style={styles.hint}>
          {token.trim()
            ? "已启用配对 token——仍请仅在可信网络使用"
            : "LAN 直连，未配对时无鉴权——请仅在可信网络使用"}
        </Text>

        <Text style={styles.version}>v0.7.0 · dsh-remote</Text>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

function createStyles(colors: ReturnType<typeof useTheme>["colors"]) {
  return StyleSheet.create({
    screen: { flex: 1, backgroundColor: colors.bg },
    content: { paddingHorizontal: 20, paddingBottom: space.x7, gap: 18 },
    header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingTop: space.x2 },
    brand: { flexDirection: "row", alignItems: "center", gap: space.x3 },
    brandText: {
      color: colors.text,
      fontFamily: font.display,
      fontSize: 24,
      fontWeight: "600",
      letterSpacing: -0.6,
      lineHeight: 28,
    },
    stateRow: { flexDirection: "row", alignItems: "center", gap: space.x3, flexWrap: "wrap" },
    describe: { color: colors.textMuted, fontSize: font.caption, fontFamily: font.mono, flexShrink: 1 },
    pairedConsole: { color: colors.success, fontSize: 11, fontFamily: font.mono, letterSpacing: 0.2, flexShrink: 1 },
    card: {
      backgroundColor: colors.surface,
      borderRadius: radius.card,
      padding: space.x5,
      gap: 14,
    },
    fieldsRow: { flexDirection: "row", gap: space.x3 },
    hostField: { flex: 1 },
    portField: { width: 96 },
    advancedRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
    linkText: { color: colors.accent, fontSize: font.body, fontWeight: "500" },
    savedToken: { color: colors.textMuted, fontSize: font.caption },
    clearToken: { alignItems: "flex-start" },
    textPressed: { opacity: 0.6 },
    clearTokenText: { color: colors.danger, fontSize: font.caption },
    relayHint: { color: colors.textMuted, fontSize: font.caption, lineHeight: 18 },
    quickRow: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: space.x3 },
    quickLink: { color: colors.accent, fontSize: font.body, fontWeight: "500" },
    quickSeparator: { color: colors.textDim, fontSize: font.body },
    connectError: { color: colors.danger, fontSize: font.caption, fontFamily: font.mono, textAlign: "center" },
    listCard: {
      backgroundColor: colors.surface,
      borderRadius: radius.card,
      overflow: "hidden",
    },
    listHeader: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      paddingHorizontal: space.x5,
      paddingTop: space.x4,
      paddingBottom: space.x2,
    },
    listTitle: { color: colors.text, fontSize: font.body, fontWeight: "600" },
    listEmpty: { color: colors.textMuted, fontSize: font.caption, padding: space.x5, paddingTop: 0 },
    hostRow: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      paddingHorizontal: space.x5,
      paddingVertical: space.x4,
      borderTopWidth: 1,
      borderTopColor: colors.separator,
    },
    hostRowPressed: { backgroundColor: colors.surface2 },
    hostRowText: { color: colors.text, fontSize: font.body, fontFamily: font.mono, flexShrink: 1 },
    hostRowArrow: { color: colors.textDim, fontSize: 18, fontWeight: "300" },
    historyButton: { alignItems: "center", paddingVertical: 2 },
    discoverError: { color: colors.warn, fontSize: font.caption, textAlign: "center" },
    discoverHint: { color: colors.textMuted, fontSize: font.caption, textAlign: "center", lineHeight: 18 },
    linkRow: { alignItems: "center", paddingVertical: space.x2 },
    link: { color: colors.accent, fontSize: font.body },
    hint: { fontSize: font.caption, color: colors.textMuted, lineHeight: 18, textAlign: "center" },
    version: { color: colors.textDim, fontSize: font.caption, fontFamily: font.mono, textAlign: "center" },
  });
}
