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
import * as Network from "expo-network";
import Constants from "expo-constants";
import { StatusBar } from "expo-status-bar";
import { useEntering, useExiting } from "../src/ui/anim";
import { useConnection } from "../src/transport/ConnectionProvider";
import { isRelayUrl, toRelayWsUrl } from "../src/transport/relayMode";
import { tokenStore } from "../src/data/secureStoreAdapter";
import { hostStore } from "../src/discovery/hostStoreAdapter";
import type { RecentHost } from "../src/discovery/hostStore";
import { draftStore } from "../src/discovery/draftStoreAdapter";
import { onboardingStore } from "../src/discovery/onboardingStoreAdapter";
import { registerPairDeepLink } from "../src/discovery/pairLink";
import { discoverHosts, type DiscoveredHost } from "../src/discovery/discover";
import { font, radius, space } from "../src/theme";
import { DeepOceanBackground } from "../src/ui/DeepOceanBackground";
import { HarnessMark } from "../src/ui/HarnessMark";
import { StatusChip, type StatusTone } from "../src/ui/StatusChip";
import { Field } from "../src/ui/Field";
import { Button } from "../src/ui/Button";
import { ConnectionBanner } from "../src/ui/ConnectionBanner";
import { SectionLabel } from "../src/ui/SectionLabel";
import { useTheme } from "../src/theme-context";
import { useI18n } from "../src/i18n";
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
  const { t } = useI18n();
  const stateLabel = (s: typeof state) =>
    s === "online" ? t.common.stateOnline
      : s === "offline" ? t.common.stateOffline
        : s === "backoff" ? t.common.stateBackoff
          : t.common.stateConnecting;
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const router = useRouter();
  const insets = useSafeAreaInsets();

  // 引导检查：首次加载时先判断是否已引导，避免闪一下连接界面再跳转
  const [booted, setBooted] = useState(false);
  const [redirectToOnboarding, setRedirectToOnboarding] = useState(false);

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
  const [showManual, setShowManual] = useState(false);
  const [showPcHelp, setShowPcHelp] = useState(false);
  const justConnected = useRef(false);
  const discoverAbort = useRef<AbortController | null>(null);

  // 首启引导 + 最近主机（在 booted 状态之前执行，不渲染任何 UI）
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const seen = await onboardingStore.seen();
      if (!cancelled && !seen) {
        setRedirectToOnboarding(true);
        router.replace("/onboarding" as never);
        return;
      }
      // 已引导，加载最近主机
      if (!cancelled) {
        try {
          const list = await hostStore.list();
          if (!cancelled) setRecent(list);
        } catch {
          // 忽略存储读取失败
        }
        setBooted(true);
      }
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

  const relayRecent = useMemo(
    () =>
      recent.filter(
        (r) => r.port === 0 || r.host.startsWith("ws://") || r.host.startsWith("wss://") || r.host.startsWith("relay://"),
      ),
    [recent],
  );
  const lanItems = found.length > 0
    ? found.map((f) => ({ key: `found-${f.host}`, host: f.host, port: f.port, name: f.name, version: f.version, token: undefined }))
    : recent.map((r) => ({ key: `recent-${r.host}-${r.port}`, host: r.host, port: r.port, name: r.name, version: undefined, token: r.token }));
  const remoteItems = relayRecent.map((r) => ({
    key: `recent-relay-${r.host}`,
    host: r.host,
    port: r.port,
    name: r.name,
    version: undefined,
    token: r.token,
  }));

  const items = mode === "remote" ? remoteItems : lanItems;

  const showList = mode === "remote" ? (!online && relayRecent.length > 0) : (found.length > 0 || showRecent);

  // 在引导检查完成前，不渲染连接表单（避免闪一下连接界面再跳转）。
  // 注意：必须放在所有 hooks 之后，否则会触发 hooks 数量不一致。
  if (!booted && !redirectToOnboarding) {
    return <View style={styles.screen} />;
  }

  return (
    <View style={styles.screen}>
      <DeepOceanBackground whale />
      <StatusBar style="light" />
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <ScrollView
          contentContainerStyle={[styles.content, { paddingTop: insets.top + space.x3 }]}
          keyboardShouldPersistTaps="handled"
        >
          <View style={styles.header}>
            <HarnessMark size={26} tone="hero" />
            <View style={styles.headerRight}>
              <StatusChip tone={STATE_TONE[state] ?? "neutral"} label={stateLabel(state)} variant="hero" />
              <Pressable
                onPress={() => router.push("/settings")}
                hitSlop={8}
                style={({ pressed }) => [styles.headerIconBtn, pressed && styles.headerIconBtnPressed]}
                accessibilityRole="button"
                accessibilityLabel="设置"
              >
                <Text style={styles.headerIconText}>⚙</Text>
              </Pressable>
            </View>
          </View>

          <ConnectionBanner variant="hero" />

          {(describeName.length > 0 || (online && relayPeerId)) && (
            <View style={styles.stateRow}>
              {describeName.length > 0 && <Text style={styles.describe} numberOfLines={1}>{describeName}</Text>}
              {online && relayPeerId && <Text style={styles.pairedConsole} numberOfLines={1}>已配对 · {relayPeerId}</Text>}
            </View>
          )}

          <View style={styles.heroBlock}>
            <View style={styles.heroPill}>
              <Text style={styles.heroPillText}>DEEPSEEK HARNESS · REMOTE</Text>
            </View>
            <Text style={styles.heroTitle}>{t.connect.heroTitle}</Text>
            <Text style={styles.heroSubtitle}>{t.connect.heroSubtitle}</Text>
          </View>

          {mode === "lan" && (
            <Pressable style={styles.backRow} onPress={() => setMode("remote")} hitSlop={8} accessibilityRole="button" accessibilityLabel="返回远程连接">
              <Text style={styles.backLink}>‹ 返回远程连接</Text>
            </Pressable>
          )}

          {!(mode === "remote" && !showManual && !online) && (
            <View key={`form-${mode}`} style={styles.card}>
              <View style={styles.cardHead}>
                <SectionLabel tone="mist">
                  {mode === "remote" ? t.connect.remoteBannerTitle : t.connect.lanBannerTitle}
                </SectionLabel>
                <Text style={styles.cardDesc}>
                  {mode === "remote" ? t.connect.remoteBannerDesc : t.connect.lanBannerDesc}
                </Text>
              </View>

              {mode === "remote" ? (
                <>
                  <Field
                    variant="hero"
                    label={t.connect.addressLabel}
                    placeholder={t.connect.addressPlaceholder}
                    autoCapitalize="none"
                    autoCorrect={false}
                    value={remoteHost}
                    onChangeText={setRemoteHost}
                    onBlur={() => remoteHost.trim() && void draftStore.set(remoteHost.trim(), 0)}
                    editable={!online}
                  />
                  <Field
                    variant="hero"
                    label={t.connect.codeLabel}
                    placeholder={t.connect.codePlaceholder}
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
                  {!online && (
                    <Pressable onPress={() => setShowManual(false)} hitSlop={8} accessibilityRole="button" accessibilityLabel="收起手动输入">
                      <Text style={styles.linkText}>{t.connect.collapseManual}</Text>
                    </Pressable>
                  )}
                </>
              ) : (
                <>
                  <View style={styles.fieldsRow}>
                    <View style={styles.hostField}>
                      <Field
                        variant="hero"
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
                        variant="hero"
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
                      variant="hero"
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
            </View>
          )}

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
            <Button
              tone="danger"
              label={t.connect.disconnect}
              onPress={() => { justConnected.current = false; void haptic("warning"); void disconnect(); }}
              full
            />
          ) : mode === "remote" && !showManual ? (
            <Button
              label={t.connect.scanConnect}
              onPress={() => { void haptic("light"); router.push("/scan"); }}
              full
            />
          ) : (
            <>
              <Button
                label={t.connect.connect}
                loading={busy}
                onPress={() => void onConnect()}
                disabled={busy || (mode === "remote" ? !remoteHost.trim() : !lanHost.trim())}
                full
              />
              {mode === "remote" && (
                <Button tone="ghost" label={t.connect.scanConnect} onPress={() => { void haptic("light"); router.push("/scan"); }} full />
              )}
            </>
          )}
          {connectError.length > 0 && <Text style={styles.connectError}>{connectError}</Text>}

          {mode === "remote" && !online && (
            <View style={styles.linksCard}>
              {!showManual && (
                <Pressable
                  style={({ pressed }) => [styles.linkRow, pressed && styles.linkRowPressed]}
                  onPress={() => setShowManual(true)}
                  accessibilityRole="button"
                  accessibilityLabel="手动输入地址和 6 位码"
                >
                  <Text style={styles.linkRowText}>{t.connect.manualToggle}</Text>
                  <Text style={styles.linkRowChevron}>›</Text>
                </Pressable>
              )}
              <Pressable
                style={({ pressed }) => [styles.linkRow, pressed && styles.linkRowPressed]}
                onPress={() => setShowPcHelp((v) => !v)}
                accessibilityRole="button"
                accessibilityLabel="电脑端怎么开"
              >
                <Text style={styles.linkRowText}>{showPcHelp ? t.connect.collapseManual : t.connect.pcHelp}</Text>
                <Text style={styles.linkRowChevron}>{showPcHelp ? "⌄" : "›"}</Text>
              </Pressable>
              {showPcHelp && (
                <View style={styles.pcHelpInner}>
                  <Text style={styles.pcHelpTitle}>{t.connect.pcHelpTitle}</Text>
                  <Text style={styles.pcHelpStep}>{t.connect.pcHelpStep1}</Text>
                  <Text style={styles.pcHelpStep}>{t.connect.pcHelpStep2}</Text>
                  <Text style={styles.pcHelpStep}>{t.connect.pcHelpStep3}</Text>
                </View>
              )}
              <Pressable
                style={({ pressed }) => [styles.linkRow, styles.linkRowLast, pressed && styles.linkRowPressed]}
                onPress={() => { void haptic("light"); setMode("lan"); }}
                accessibilityRole="button"
                accessibilityLabel="更多连接方式"
              >
                <Text style={styles.linkRowText}>{t.connect.moreConnections}</Text>
                <Text style={styles.linkRowChevron}>›</Text>
              </Pressable>
            </View>
          )}

          {showList ? (
            <View style={styles.listCard}>
              <View style={styles.listHeader}>
                <Text style={styles.listTitle}>{mode === "remote" ? t.connect.recentHosts : found.length > 0 ? "发现的电脑" : "历史电脑"}</Text>
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
            <Pressable style={styles.enterRow} onPress={() => router.push("/sessions")} accessibilityRole="link" accessibilityLabel="进入会话">
              <Text style={styles.link}>{t.connect.enterSessions}</Text>
            </Pressable>
          )}

          {mode === "lan" && (
            <Text style={styles.hint}>
              {lanToken.trim()
                ? "已启用安全码——仍请仅在可信网络使用"
                : "同一 Wi-Fi 直连，未设置安全码时无鉴权——请仅在可信网络使用"}
            </Text>
          )}

          <View style={styles.flexSpacer} />
          <Text style={styles.version}>v{Constants.expoConfig?.version ?? "0.3.1"} · harness remote</Text>
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

function createStyles(colors: ReturnType<typeof useTheme>["colors"]) {
  return StyleSheet.create({
    screen: { flex: 1, backgroundColor: colors.navy },
    flex: { flex: 1 },
    content: { paddingHorizontal: 20, paddingBottom: space.x4, gap: 16, flexGrow: 1 },
    flexSpacer: { flex: 1, minHeight: 24 },
    header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", rowGap: space.x2 },
    headerRight: { flexDirection: "row", alignItems: "center", gap: space.x3, flexShrink: 1 },
    headerIconBtn: {
      width: 40,
      height: 40,
      borderRadius: 20,
      backgroundColor: colors.heroCard,
      borderWidth: 1,
      borderColor: colors.heroStroke,
      alignItems: "center",
      justifyContent: "center",
    },
    headerIconBtnPressed: { opacity: 0.7 },
    headerIconText: { color: colors.heroText, fontSize: 17, fontWeight: "600" },
    heroBlock: { alignItems: "center", paddingTop: space.x4, gap: 8 },
    heroPill: {
      paddingHorizontal: 10,
      paddingTop: 5,
      paddingBottom: 4,
      borderRadius: 8,
      backgroundColor: "rgba(0,0,0,0.25)",
      borderWidth: 1,
      borderColor: "rgba(255,255,255,0.18)",
    },
    heroPillText: {
      color: colors.heroText,
      fontSize: 9,
      fontFamily: font.monoMedium,
      letterSpacing: 1.4,
      opacity: 0.9,
    },
    heroTitle: {
      color: colors.heroText,
      fontFamily: font.displayBold,
      fontSize: 26,
      fontWeight: "700",
      letterSpacing: -0.6,
      textAlign: "center",
      lineHeight: 32,
    },
    heroSubtitle: { color: colors.heroTextDim, fontSize: 14, textAlign: "center" },
    stateRow: { flexDirection: "row", alignItems: "center", gap: space.x3, flexWrap: "wrap" },
    describe: { color: colors.heroTextDim, fontSize: font.caption, fontFamily: font.mono, flexShrink: 1 },
    pairedConsole: { color: colors.success, fontSize: 11, fontFamily: font.mono, letterSpacing: 0.2, flexShrink: 1 },
    backRow: { alignItems: "flex-start", paddingVertical: 2 },
    backLink: { color: colors.mist, fontSize: font.body, fontWeight: "500" },
    card: {
      backgroundColor: colors.heroCard,
      borderRadius: radius.card,
      borderWidth: 1,
      borderColor: colors.heroStroke,
      padding: space.x5,
      gap: 14,
    },
    cardHead: { gap: 6 },
    cardDesc: { color: colors.heroTextDim, fontSize: font.caption, lineHeight: 18 },
    fieldsRow: { flexDirection: "row", gap: space.x3 },
    hostField: { flex: 1 },
    portField: { width: 96 },
    advancedRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
    linkText: { color: colors.mist, fontSize: font.body, fontWeight: "500" },
    pcHelpTitle: { color: colors.heroText, fontSize: font.body + 1, fontWeight: "600" },
    pcHelpStep: { color: colors.heroTextDim, fontSize: font.caption, lineHeight: 18 },
    savedToken: { color: colors.heroTextDim, fontSize: font.caption },
    clearToken: { alignItems: "flex-start" },
    textPressed: { opacity: 0.6 },
    clearTokenText: { color: colors.danger, fontSize: font.caption },
    relayHint: { color: colors.heroTextDim, fontSize: font.caption, lineHeight: 18 },
    quickRow: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: space.x3 },
    quickLink: { color: colors.mist, fontSize: font.body, fontWeight: "500" },
    quickSeparator: { color: colors.heroTextDim, fontSize: font.body },
    connectError: { color: colors.danger, fontSize: font.caption, fontFamily: font.mono, textAlign: "center" },
    linksCard: {
      backgroundColor: colors.heroCard,
      borderRadius: radius.card,
      borderWidth: 1,
      borderColor: colors.heroStroke,
      overflow: "hidden",
    },
    linkRow: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      paddingHorizontal: space.x4,
      paddingVertical: 14,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: colors.heroStroke,
    },
    linkRowPressed: { opacity: 0.7 },
    linkRowLast: { borderBottomWidth: 0 },
    linkRowText: { color: colors.mist, fontSize: font.body, fontWeight: "500" },
    linkRowChevron: { color: colors.heroTextDim, fontSize: font.title, fontWeight: "400" },
    pcHelpInner: {
      paddingHorizontal: space.x4,
      paddingBottom: space.x3,
      gap: space.x1,
      backgroundColor: "rgba(0,0,0,0.18)",
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: colors.heroStroke,
    },
    listCard: {
      backgroundColor: colors.surface,
      borderRadius: radius.card,
      borderWidth: 1,
      borderColor: colors.separator,
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
    enterRow: { alignItems: "center", paddingVertical: space.x2 },
    link: { color: colors.accent, fontSize: font.body },
    hint: { fontSize: font.caption, color: colors.textMuted, lineHeight: 18, textAlign: "center" },
    version: { color: colors.textDim, fontSize: font.caption, fontFamily: font.mono, textAlign: "center" },
  });
}
