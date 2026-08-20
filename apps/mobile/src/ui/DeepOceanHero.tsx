import { useMemo } from "react";
import { StyleSheet, Text, View } from "react-native";
import { useTheme } from "../theme-context";
import { font, space } from "../theme";
import { WhaleMark } from "./WhaleMark";
import { FlowingOcean } from "./FlowingOcean";

export function DeepOceanHero({ title, subtitle }: { title: string; subtitle?: string }) {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const gridLines = Array.from({ length: 6 }, (_, i) => i);
  return (
    <View style={styles.hero}>
      <FlowingOcean />
      <View style={styles.grid} pointerEvents="none">
        {gridLines.map((i) => (
          <View key={`v${i}`} style={[styles.gridV, { left: `${(i + 1) * 14}%` }]} />
        ))}
        {gridLines.map((i) => (
          <View key={`h${i}`} style={[styles.gridH, { top: `${(i + 1) * 16}%` }]} />
        ))}
      </View>
      <View style={styles.whale} pointerEvents="none">
        <WhaleMark size={120} fill={colors.heroText} />
      </View>
      <Text style={styles.title}>{title}</Text>
      {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
    </View>
  );
}

function createStyles(colors: ReturnType<typeof useTheme>["colors"]) {
  return StyleSheet.create({
    hero: {
      backgroundColor: colors.heroBg,
      borderRadius: 20,
      padding: space.x6,
      alignItems: "center",
      overflow: "hidden",
      minHeight: 240,
      justifyContent: "center",
      borderWidth: 1,
      borderColor: "rgba(86,134,254,0.25)",
    },
    grid: { ...StyleSheet.absoluteFill },
    gridV: { position: "absolute", top: 0, bottom: 0, width: 1, backgroundColor: colors.heroGrid },
    gridH: { position: "absolute", left: 0, right: 0, height: 1, backgroundColor: colors.heroGrid },
    whale: { opacity: 0.9, marginBottom: space.x3 },
    title: { color: colors.heroText, fontFamily: font.displayBold, fontSize: font.title, textAlign: "center" },
    subtitle: { color: colors.heroTextDim, fontSize: font.caption, textAlign: "center", marginTop: space.x1 },
  });
}
