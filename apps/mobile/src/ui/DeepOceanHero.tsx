import { useMemo } from "react";
import { StyleSheet, Text, View } from "react-native";
import Svg, { Ellipse } from "react-native-svg";
import { useTheme } from "../theme-context";
import { font, space } from "../theme";
import { FlowingOcean } from "./FlowingOcean";
import { DotWhaleMark } from "./DotWhaleMark";

export type HeroVariant = "official" | "clarklevis" | "minimal";

export function DeepOceanHero({
  title,
  subtitle,
  variant = "official",
}: {
  title: string;
  subtitle?: string;
  variant?: HeroVariant;
}) {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const gridLines = Array.from({ length: 6 }, (_, i) => i);
  const showGrid = variant !== "minimal";
  return (
    <View style={styles.hero}>
      <FlowingOcean />

      {showGrid && (
        <View style={styles.grid} pointerEvents="none">
          {gridLines.map((i) => (
            <View key={`v${i}`} style={[styles.gridV, { left: `${(i + 1) * 14}%` }]} />
          ))}
          {gridLines.map((i) => (
            <View key={`h${i}`} style={[styles.gridH, { top: `${(i + 1) * 16}%` }]} />
          ))}
        </View>
      )}

      {variant === "clarklevis" && <RippleArcs />}

      <View style={styles.whale} pointerEvents="none">
        <DotWhaleMark size={variant === "minimal" ? 108 : 120} fill={colors.heroText} />
      </View>

      {variant === "official" && (
        <View style={styles.pill} pointerEvents="none">
          <Text style={styles.pillText}>DEEPSEEK HARNESS · REMOTE</Text>
        </View>
      )}

      <Text style={styles.title}>{title}</Text>
      {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
    </View>
  );
}

const rippleStyle = {
  position: "absolute" as const,
  left: 0,
  right: 0,
  bottom: 6,
  height: 72,
};

function RippleArcs() {
  const { colors } = useTheme();
  const stroke = colors.heroGrid;
  return (
    <Svg style={rippleStyle} viewBox="0 0 100 32" preserveAspectRatio="xMidYMid slice" pointerEvents="none">
      <Ellipse cx="50" cy="30" rx="46" ry="9" stroke={stroke} strokeWidth="0.7" fill="none" opacity="0.9" />
      <Ellipse cx="50" cy="30" rx="34" ry="6.4" stroke={stroke} strokeWidth="0.7" fill="none" opacity="0.7" />
      <Ellipse cx="50" cy="30" rx="22" ry="4.2" stroke={stroke} strokeWidth="0.7" fill="none" opacity="0.5" />
    </Svg>
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
      minHeight: 220,
      justifyContent: "center",
    },
    grid: { ...StyleSheet.absoluteFill },
    gridV: { position: "absolute", top: 0, bottom: 0, width: 1, backgroundColor: colors.heroGrid },
    gridH: { position: "absolute", left: 0, right: 0, height: 1, backgroundColor: colors.heroGrid },
    whale: { opacity: 0.95, marginBottom: space.x3 },
    pill: {
      marginBottom: space.x3,
      paddingHorizontal: 10,
      paddingTop: 5,
      paddingBottom: 4,
      borderRadius: 8,
      backgroundColor: "rgba(0,0,0,0.25)",
      borderWidth: 1,
      borderColor: "rgba(255,255,255,0.18)",
    },
    pillText: {
      color: colors.heroText,
      fontSize: 9,
      fontFamily: font.monoMedium,
      letterSpacing: 1.4,
      opacity: 0.9,
    },
    title: { color: colors.heroText, fontFamily: font.displayBold, fontSize: font.title, textAlign: "center" },
    subtitle: { color: colors.heroTextDim, fontSize: font.caption, textAlign: "center", marginTop: space.x1 },
  });
}
