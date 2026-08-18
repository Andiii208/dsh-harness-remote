import { useRouter } from "expo-router";
import { CameraView, useCameraPermissions } from "expo-camera";
import { useEffect, useMemo, useState } from "react";
import { Platform, Pressable, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { parsePairPayload, parseRemotePairPayload } from "@dsh-remote/protocol";
import { useConnection } from "../src/transport/ConnectionProvider";
import { toRelayWsUrl } from "../src/transport/relayMode";
import { hostStore } from "../src/discovery/hostStoreAdapter";
import { tokenStore } from "../src/data/secureStoreAdapter";
import { font, radius, space, type ThemeColors } from "../src/theme";
import { Button } from "../src/ui/Button";
import { useTheme } from "../src/theme-context";
import { haptic } from "../src/ui/haptics";

export default function ScanScreen() {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { connect } = useConnection();
  const [permission, requestPermission] = useCameraPermissions();
  const [scanning, setScanning] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    if (permission && !permission.granted && permission.canAskAgain) {
      void requestPermission();
    }
  }, [permission, requestPermission]);

  const onScanned = async (data: string) => {
    if (!scanning) return;
    setScanning(false);

    // R4：远程连接二维码（dshremote://remote?addr=...&code=...）优先。
    const remote = parseRemotePairPayload(data);
    if (remote) {
      void haptic("success");
      setError("");
      void (async () => {
        await connect(toRelayWsUrl(remote.addr), 0, undefined, remote.code);
        router.replace("/sessions");
      })();
      return;
    }

    // P2：同一 Wi-Fi 的配对二维码（dshremote://pair?host&port&token）。
    const payload = parsePairPayload(data);
    if (!payload) {
      setError("无法识别的二维码——需要 dshremote://remote 或 dshremote://pair 格式");
      setTimeout(() => setScanning(true), 1500);
      return;
    }
    void haptic("success");
    if (payload.token) await tokenStore.set(payload.token);
    await hostStore.add(payload.host, payload.port, undefined, payload.token);
    setError("");
    await connect(payload.host, payload.port, payload.token);
    router.replace("/sessions");
  };

  if (Platform.OS === "web") {
    return (
      <View style={[styles.screen, { paddingTop: insets.top + space.x5 }]}>
        <View style={styles.card}>
          <Text style={styles.webTitle}>相机不可用</Text>
          <Text style={styles.hint}>Web 预览不支持相机扫码——请在真机上使用。</Text>
          <Button label="返回" onPress={() => router.back()} full />
        </View>
      </View>
    );
  }

  return (
    <View style={[styles.screen, { paddingTop: insets.top + space.x3 }]}>
      <CameraView
        style={styles.camera}
        facing="back"
        barcodeScannerSettings={{ barcodeTypes: ["qr"] }}
        onBarcodeScanned={({ data }) => void onScanned(data)}
      >
        <View style={styles.frame}>
          <View style={[styles.corner, styles.cornerTL]} />
          <View style={[styles.corner, styles.cornerTR]} />
          <View style={[styles.corner, styles.cornerBL]} />
          <View style={[styles.corner, styles.cornerBR]} />
        </View>
        <View style={styles.overlay}>
          <Text style={styles.overlayTitle}>扫描连接二维码</Text>
          <Text style={styles.overlayHint}>对准电脑上 dsh-remote 显示的二维码</Text>
          {error.length > 0 && <Text style={styles.error}>{error}</Text>}
          {!permission?.granted && (
            <Button label="授权相机权限" onPress={() => void requestPermission()} full />
          )}
          <Pressable style={styles.cancel} onPress={() => router.back()} hitSlop={12}>
            <Text style={styles.cancelText}>取消</Text>
          </Pressable>
        </View>
      </CameraView>
    </View>
  );
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    screen: { flex: 1, backgroundColor: colors.bg },
    camera: { flex: 1 },
    frame: { flex: 1, alignItems: "center", justifyContent: "center" },
    corner: {
      position: "absolute",
      width: 44,
      height: 44,
      borderColor: colors.accent,
      borderWidth: 3,
    },
    cornerTL: { top: "38%", left: "22%", borderRightWidth: 0, borderBottomWidth: 0, borderTopLeftRadius: 8 },
    cornerTR: { top: "38%", right: "22%", borderLeftWidth: 0, borderBottomWidth: 0, borderTopRightRadius: 8 },
    cornerBL: { bottom: "38%", left: "22%", borderRightWidth: 0, borderTopWidth: 0, borderBottomLeftRadius: 8 },
    cornerBR: { bottom: "38%", right: "22%", borderLeftWidth: 0, borderTopWidth: 0, borderBottomRightRadius: 8 },
    overlay: { padding: space.x5, paddingBottom: space.x7, gap: space.x3, backgroundColor: "rgba(10,12,16,0.55)" },
    overlayTitle: { color: colors.text, fontSize: font.body + 1, fontWeight: "600", textAlign: "center" },
    overlayHint: { color: colors.textMuted, fontSize: font.caption, textAlign: "center" },
    error: { color: colors.danger, fontSize: font.caption, textAlign: "center" },
    cancel: { alignItems: "center", paddingVertical: space.x3 },
    cancelText: { color: colors.textMuted, fontSize: font.body, fontWeight: "600" },
    card: {
      backgroundColor: colors.surface,
      borderRadius: radius.card,
      padding: space.x5,
      gap: space.x3,
      margin: space.x5,
    },
    webTitle: { color: colors.text, fontSize: font.body + 1, fontWeight: "600", textAlign: "center" },
    hint: { color: colors.textMuted, fontSize: font.caption, lineHeight: 18 },
  });
}
