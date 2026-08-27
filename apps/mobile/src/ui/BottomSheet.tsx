/**
 * BottomSheet — 统一底部弹层（审计 B4：backdrop/menuPanel 样式此前被
 * sessions/chat/MessageBubble/TrajectoryView 各复制一份，且固定
 * paddingBottom: 28 不避手势条）。收口为单一组件：
 * - fade Modal + 点按遮罩关闭（onRequestClose 同步）；
 * - paddingBottom 用 insets.bottom 兜底全面屏安全区；
 * - 内容由调用方渲染，保留各自菜单项样式。
 */

import { Modal, Pressable, StyleSheet, View, type ViewStyle } from "react-native";
import type { ReactNode } from "react";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTheme } from "../theme-context";
import { radius } from "../theme";

export function BottomSheet({
  visible,
  onClose,
  closeLabel = "关闭菜单",
  children,
}: {
  visible: boolean;
  onClose: () => void;
  /** 无障碍关闭按钮标签。 */
  closeLabel?: string;
  children: ReactNode;
}) {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={[styles.backdrop]}>
        <Pressable
          style={StyleSheet.absoluteFill}
          onPress={onClose}
          accessibilityRole="button"
          accessibilityLabel={closeLabel}
        />
        <View style={[styles.panel, { backgroundColor: colors.surface, paddingBottom: Math.max(insets.bottom, 16) }]}>
          {children}
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.5)",
    justifyContent: "flex-end",
  },
  panel: {
    borderTopLeftRadius: radius.sheet,
    borderTopRightRadius: radius.sheet,
    paddingHorizontal: 16,
    paddingTop: 16,
    gap: 8,
  },
});
