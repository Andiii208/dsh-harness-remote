import { useRouter } from "expo-router";
import { CameraView, useCameraPermissions } from "expo-camera";
import { useEffect, useState } from "react";
import { Platform, Pressable, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { parsePairPayload } from "@dsh-remote/protocol";
import { useConnection } from "../src/transport/ConnectionProvider";
import { hostStore } from "../src/discovery/hostStoreAdapter";
import { tokenStore } from "../src/data/secureStoreAdapter";
import { colors, font, radius, space, stroke } from "../src/theme";
import { SectionLabel } from "../src/ui/SectionLabel";
import { Button } from "../src/ui/Button";

export default function ScanScreen() {
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
    const payload = parsePairPayload(data);
    if (!payload) {
      setError("无法识别的配对码——需要 dshremote://pair 格式");
      setScanning(false);
      setTimeout(() => setScanning(true), 1500);
      return;
    }
    setScanning(false);
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
          <SectionLabel>Camera unavailable</SectionLabel>
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
          <Text style={styles.overlayTitle}>对准电脑上的配对二维码</Text>
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

const styles = StyleSheet.create({
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
  overlayTitle: { color: colors.text, fontSize: font.body, fontWeight: "600", textAlign: "center" },
  error: { color: colors.danger, fontSize: font.caption, textAlign: "center" },
  cancel: { alignItems: "center", paddingVertical: space.x3 },
  cancelText: { color: colors.textMuted, fontSize: font.body, fontWeight: "600" },
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.card,
    borderWidth: stroke.hairline,
    borderColor: colors.border,
    padding: space.x5,
    gap: space.x3,
    margin: space.x5,
  },
  hint: { color: colors.textMuted, fontSize: font.caption, lineHeight: 18 },
});
