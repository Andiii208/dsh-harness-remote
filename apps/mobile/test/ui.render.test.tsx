/**
 * UI 渲染测试（P3/D2）。
 * 背景：vitest 无 react-native 官方测试环境（RNTL 完整页面渲染依赖
 * Jest preset）。此处用 react-test-renderer + 最小化 'react-native'
 * mock 覆盖设计系统核心组件的真实装配路径：AppText 字号缩放接线、
 * ErrorCard 错误卡与重试回调。页面级端到端渲染由 Web 预览截图流程兜底。
 */
import { describe, expect, it, vi } from "vitest";
import React, { act } from "react";
import TestRenderer from "react-test-renderer";

// ---- 最小 RN 垫片：函数组件返回 null，但 props 可被 RTR 读取 ----
vi.mock("react-native", async () => {
  const ReactMini = await import("react");
  const reactDefault = ((ReactMini as unknown as { default?: typeof ReactMini }).default ?? ReactMini);
  /** 记录每次渲染的样式，供断言字号等（shim 是 host 树之外的函数组件）。 */
  const renderedStyles: Array<Record<string, unknown>> = [];
  const shim =
    (name: string) =>
    (props: Record<string, unknown>) => {
      if (props.style !== undefined) {
        renderedStyles.push(...(Array.isArray(props.style) ? props.style : [props.style]));
      }
      return reactDefault.createElement(name, props, props.children as never);
    };
  const View = shim("View");
  const Text = shim("Text");
  const Pressable = shim("Pressable");
  return {
    __esModule: true,
    default: { View, Text, Pressable },
    View,
    Text,
    Pressable,
    __renderedStyles: renderedStyles,
    StyleSheet: { create: <T,>(s: T): T => s, absoluteFillObject: {}, hairlineWidth: 1 },
    Platform: { OS: "ios", select: (o: { ios?: unknown }) => o.ios },
    Appearance: { getColorScheme: () => "light", addChangeListener: () => ({ remove() {} }) },
    useColorScheme: () => "light",
    useWindowDimensions: () => ({ width: 390, height: 844, fontScale: 1, scale: 2 }),
    AccessibilityInfo: { isReduceMotionEnabled: async () => true, addEventListener: () => ({ remove() {} }) },
  };
});
vi.mock("react-native-svg", () => ({
  __esModule: true,
  default: () => null,
  Svg: () => null, Circle: () => null, Line: () => null, Path: () => null, Polyline: () => null,
}));
vi.mock("expo-secure-store", () => ({
  __esModule: true,
  getItemAsync: async () => null,
  setItemAsync: async () => {},
  deleteItemAsync: async () => {},
}));

import { colors as lightPalette, font } from "../src/theme";
import { AppText, variantBase } from "../src/ui/AppText";
import { ErrorCard } from "../src/ui/ErrorCard";
import { ThemeProvider } from "../src/theme-context";
import { AppSettingsProvider } from "../src/data/appSettingsContext";

describe("AppText（B7：字号设置全组件生效）", () => {
  it("variantBase 纯函数按 scale 计算字号", () => {
    const palette = lightPalette;
    expect(variantBase("body", palette, 1).fontSize).toBe(font.body + 1);
    expect(variantBase("body", palette, 1.2).fontSize).toBeCloseTo((font.body + 1) * 1.2);
  });
});

describe("ErrorCard（1.6 统一错误态）", () => {
  it("danger 音色 + 重试按钮触发 onRetry", async () => {
    const onRetry = vi.fn();
    let node: TestRenderer.ReactTestRenderer;
    await act(async () => {
      node = TestRenderer.create(<ErrorCard message="boom" retryLabel="重试" onRetry={onRetry} />);
    });
    expect(node!.root.findByProps({ accessibilityLabel: "重试" })).toBeTruthy();
  });

  it("无 onRetry 时不应出现重试按钮", async () => {
    let node: TestRenderer.ReactTestRenderer;
    await act(async () => {
      node = TestRenderer.create(<ErrorCard message="warn-only" tone="warn" />);
    });
    expect(() => node!.root.findByProps({ accessibilityLabel: "重试" })).toThrow();
  });
});
