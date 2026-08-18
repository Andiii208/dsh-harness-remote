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
import { isRelayUrl, toRelayWsUrl } from "../src/transport/relayMode";
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

type ConnectMode = "remote" | "lan";

export default function ConnectScreen() {
  const { state, describe, relayPeerId, connect, disconnect } = useConnection();
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const router = useRouter();
  const insets = useSafeAreaInsets();

  // 远程连接是首屏主路径；LAN 降级到「更多连接方式」里。
  const [mode, setMode] = useState<ConnectMode>("remote");
  const [remoteHost, setRemoteHost] = useState("");
  const [pairCode, setPairCode] = useState("");
  const [lanHost, setLanHost] = useState("");
  const [lanPort, setLanPort] = useState("3080");
  const [lanToken, setLanToken] = useState("");
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
  const heroEntering = useEntering(10, 240);
  const bannerEntering = useEntering(6, 200);
  const formEntering = useEntering(6, 200);

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

  // 配对深链（dshremote://pair?…）→ 进入 LAN 模式一键连接。
  useEffect(() => {
    return registerPairDeepLink((p) => {
      setMode("lan");
      setLanHost(p.host);
      setLanPort(String(p.port));
      if (p.token) setLanToken(p.token);
      justConnected.current = true;
      void connect(p.host, p.port, p.token);
    });
  }, [connect, router]);

  useEffect(() => {
    void tokenStore.get().then((t) => {
      if (t) {
        setLanToken(t);
        setShowToken(true);
      }
    });
    void draftStore.get().then((d) => {
      if (!d) return;
      // 远程草稿恢复到远程地址；LAN 草稿只填 LAN 表单，不抢占首屏主路径。
      if (d.port === 0) setRemoteHost(d.host);
      else {
        setLanHost(d.host);
        setLanPort(String(d.port));
      }
    });
  }, []);

  const online = state === "online";
  const normalizedRelayUrl = useMemo(
    () => (remoteHost.trim() ? toRelayWsUrl(remoteHost) : ""),
    [remoteHost],
  );

  useEffect(() => {
    if (online && justConnected.current) {
      justConnected.current = false;
      setConnectError("");
      router.push("/sessions");
    }
    if (state === "offline") {
      if (justConnected.current) setConnectError("没连上，请确认地址没错、电脑上的远程服务已开启");
      justConnected.current = false;
    }
  }, [online, state, router]);

  const onConnect = async () => {
    if (busy) return;
    if (mode === "remote") {
      if (!remoteHost.trim()) return;
      setBusy(true);
      setConnectError("");
      justConnected.current = true;
      void haptic("light");
      try {
        const wsUrl = toRelayWsUrl(remoteHost);
        void draftStore.set(remoteHost.trim(), 0);
        await connect(wsUrl, 0, undefined, pairCode.trim() || undefined);
      } finally {
        setBusy(false);
      }
      return;
    }

    if (!lanHost.trim()) return;
    setBusy(true);
    setConnectError("");
    justConnected.current = true;
    void haptic("light");
    try {
      const t = lanToken.trim();
      if (t) await tokenStore.set(t);
      const p = Number.parseInt(lanPort || "3080", 10);
      void draftStore.set(lanHost.trim(), p);
      await connect(lanHost.trim(), p, t || undefined);
    } finally {
      setBusy(false);
    }
  };

  const connectTo = async (h: string, p: number, t?: string) => {
    setConnectError("");
    justConnected.current = true;
    if (p === 0 || isRelayUrl(h)) {
      setMode("remote");
      setRemoteHost(h);
      await connect(isRelayUrl(h) ? h : toRelayWsUrl(h), 0, undefined, undefined);
    } else {
      setMode("lan");
      setLanHost(h);
      setLanPort(String(p));
      if (t) setLanToken(t);
      await connect(h, p, t);
    }
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
        setDiscoverError("没拿到本机 IP，请确认手机和电脑在同一个 Wi-Fi");
        return;
      }
      const list = await discoverHosts({ localIp: ip, signal: discoverAbort.current.signal });
      setFound(list);
      if (list.length === 0) setDiscoverError("没有发现电脑——请确认电脑上已开启远程服务且与手机同一 Wi-Fi");
    } catch (err) {
      console.warn("[discover] failed", err);
      setDiscoverError("自动发现失败，请手动输入电脑 IP");
    } finally {
      setDiscovering(false);
    }
  };

  const onClearToken = async () => {
    setLanToken("");
    await tokenStore.clear();
  };

  const describeName =
    describe && typeof describe === "object"
      ? `${(describe as { name?: string }).name ?? ""} ${(describe as { version?: string }).version ?? ""}`.trim()
      : "";

  const items = found.length > 0
    ? found.map((f) => ({ key: `found-${f.host}`, host: f.host, port: f.port, name: f.name, version: f.version, token: undefined }))
    : recent.map((r) => ({ key: `recent-${r.host}-${r.port}`, host: r.host, port: r.port, name: r.name, version: undefined, token: r.token }));

  const showList = mode === "lan" && (found.length > 0 || showRecent);

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

        <Animated.View key={`banner-${mode}`} entering={bannerEntering} style={styles.banner}>
          <Text style={styles.bannerTitle}>
            {mode === "remote" ? "远程连接我的电脑" : "同一 Wi-Fi 连接"}
          </Text>
          <Text style={styles.bannerDesc}>
            {mode === "remote"
              ? "走到哪儿都能连。填写电脑上显示的地址和 6 位码即可。"
              : "手机和电脑连同一个 Wi-Fi 时使用。"}
          </Text>
        </Animated.View>

        {mode === "lan" && (
          <Pressable style={styles.backRow} onPress={() => setMode("remote")} hitSlop={8} accessibilityRole="button" accessibilityLabel="返回远程连接">
            <Text style={styles.backLink}>‹ 返回远程连接</Text>
          </Pressable>
        )}

        <Animated.View key={`form-${mode}`} entering={formEntering} style={styles.card}>
          {mode === "remote" ? (
            <>
              <Field
                label="连接地址"
                placeholder="电脑上显示的地址，例如 relay.example.com"
                autoCapitalize="none"
                autoCorrect={false}
                value={remoteHost}
                onChangeText={setRemoteHost}
                onBlur={() => remoteHost.trim() && void draftStore.set(remoteHost.trim(), 0)}
                editable={!online}
              />
              <Field
                label="6 位码（可选）"
                placeholder="电脑上显示的 6 位数字"
                keyboardType="number-pad"
                maxLength={6}
                value={pairCode}
                onChangeText={setPairCode}
                editable={!online}
              />
              <Text style={styles.relayHint}>
                {normalizedRelayUrl
                  ? `将连接 ${normalizedRelayUrl}`
                  : "地址不用加 http、ws 或端口，App 会自动补全"}
              </Text>
            </>
          ) : (
            <>
              <View style={styles.fieldsRow}>
                <View style={styles.hostField}>
                  <Field
                    label="电脑 IP"
                    placeholder="192.168.1.5"
                    autoCapitalize="none"
                    autoCorrect={false}
                    value={lanHost}
                    onChangeText={setLanHost}
                    onBlur={() => lanHost.trim() && void draftStore.set(lanHost.trim(), Number.parseInt(lanPort || "3080", 10))}
                    editable={!online}
                  />
                </View>
                <View style={styles.portField}>
                  <Field
                    label="端口"
                    placeholder="3080"
                    keyboardType="number-pad"
                    value={lanPort}
                    onChangeText={setLanPort}
                    onBlur={() => lanHost.trim() && void draftStore.set(lanHost.trim(), Number.parseInt(lanPort || "3080", 10))}
                    editable={!online}
                  />
                </View>
              </View>

              <View style={styles.advancedRow}>
                <Pressable onPress={() => setShowToken((v) => !v)} hitSlop={8} accessibilityRole="button" accessibilityLabel="展开高级设置">
                  <Text style={styles.linkText}>{showToken ? "收起高级" : "高级"}</Text>
                </Pressable>
                {lanToken.length > 0 && !showToken && <Text style={styles.savedToken}>已保存安全码</Text>}
              </View>

              {showToken && (
                <Field
                  label="安全码"
                  placeholder="可选"
                  autoCapitalize="none"
                  autoCorrect={false}
                  value={lanToken}
                  onChangeText={setLanToken}
                  editable={!online}
                  secureTextEntry
                />
              )}

              <Text style={styles.relayHint}>同一 Wi-Fi 直连。未设置安全码时，请仅在可信网络使用</Text>
              {showToken && lanToken.length > 0 && (
                <Pressable style={({ pressed }) => [styles.clearToken, pressed && styles.textPressed]} onPress={onClearToken} accessibilityRole="button" accessibilityLabel="清除已保存的安全码">
                  <Text style={styles.clearTokenText}>清除已保存的安全码</Text>
                </Pressable>
              )}
            </>
          )}
        </Animated.View>

        {mode === "lan" && (
          <View style={styles.quickRow}>
            <Pressable onPress={() => void onDiscover()} hitSlop={8} disabled={discovering} accessibilityRole="button" accessibilityLabel="自动发现电脑">
              <Text style={styles.quickLink}>{discovering ? "正在扫描…" : "自动发现电脑"}</Text>
            </Pressable>
            <Text style={styles.quickSeparator}>·</Text>
            <Pressable onPress={() => router.push("/scan" as never)} hitSlop={8} accessibilityRole="button" accessibilityLabel="扫码连接">
              <Text style={styles.quickLink}>扫码连接</Text>
            </Pressable>
          </View>
        )}

        {online ? (
          <Button tone="danger" label="断开连接" onPress={() => { justConnected.current = false; void haptic("warning"); void disconnect(); }} full />
        ) : (
          <Button
            label={busy ? "连接中…" : "连接"}
            onPress={() => void onConnect()}
            disabled={busy || (mode === "remote" ? !remoteHost.trim() : !lanHost.trim())}
            full
          />
        )}
        {connectError.length > 0 && <Text style={styles.connectError}>{connectError}</Text>}

        {mode === "remote" && !online && (
          <Pressable style={styles.moreRow} onPress={() => { void haptic("light"); setMode("lan"); }} accessibilityRole="button" accessibilityLabel="更多连接方式">
            <Text style={styles.moreLink}>更多连接方式 · 同一 Wi-Fi / 扫码 ›</Text>
          </Pressable>
        )}

        {showList ? (
          <View style={styles.listCard}>
            <View style={styles.listHeader}>
              <Text style={styles.listTitle}>{found.length > 0 ? "发现的电脑" : "历史电脑"}</Text>
              {found.length === 0 && (
                <Pressable onPress={() => setShowRecent(false)} hitSlop={8} accessibilityRole="button" accessibilityLabel="收起历史电脑">
                  <Text style={styles.linkText}>收起</Text>
                </Pressable>
              )}
            </View>
            {items.length === 0 ? (
              <Text style={styles.listEmpty}>暂无历史电脑</Text>
            ) : (
              items.map((h) => (
                <Pressable
                  key={h.key}
                  style={({ pressed }) => [styles.hostRow, pressed && styles.hostRowPressed]}
                  onPress={() => void connectTo(h.host, h.port, h.token)}
                  accessibilityRole="button"
                  accessibilityLabel={`连接 ${h.name ?? h.host}`}
                >
                  <Text style={styles.hostRowText} numberOfLines={1}>
                    {h.name ?? h.host}{h.port !== 0 ? ` · ${h.host}:${h.port}` : ""}
                  </Text>
                  <Text style={styles.hostRowArrow}>›</Text>
                </Pressable>
              ))
            )}
          </View>
        ) : (
          mode === "lan" && (
            <Pressable onPress={() => setShowRecent(true)} style={styles.historyButton} hitSlop={8} accessibilityRole="button" accessibilityLabel="展开历史电脑">
              <Text style={styles.linkText}>历史电脑{recent.length > 0 ? ` · ${recent.length}` : ""} ›</Text>
            </Pressable>
          )
        )}

        {mode === "lan" && discoverError.length > 0 && <Text style={styles.discoverError}>{discoverError}</Text>}
        {mode === "lan" && found.length > 0 && (
          <Text style={styles.discoverHint}>第一次连接可能需要安全码——可用「扫码连接」获取</Text>
        )}

        {online && (
          <Pressable style={styles.linkRow} onPress={() => router.push("/sessions")} accessibilityRole="link" accessibilityLabel="进入会话">
            <Text style={styles.link}>进入会话 →</Text>
          </Pressable>
        )}

        {mode === "lan" && (
          <Text style={styles.hint}>
            {lanToken.trim()
              ? "已启用安全码——仍请仅在可信网络使用"
              : "同一 Wi-Fi 直连，未设置安全码时无鉴权——请仅在可信网络使用"}
          </Text>
        )}

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
    banner: {
      backgroundColor: colors.accentSoft,
      borderRadius: radius.card,
      padding: space.x5,
      gap: 6,
    },
    bannerTitle: { color: colors.text, fontSize: font.section, fontWeight: "600", letterSpacing: -0.2 },
    bannerDesc: { color: colors.textMuted, fontSize: font.caption, lineHeight: 18 },
    backRow: { alignItems: "flex-start", paddingVertical: 2 },
    backLink: { color: colors.accent, fontSize: font.body, fontWeight: "500" },
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
    moreRow: { alignItems: "center", paddingVertical: 2 },
    moreLink: { color: colors.textMuted, fontSize: font.caption, fontWeight: "500" },
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
