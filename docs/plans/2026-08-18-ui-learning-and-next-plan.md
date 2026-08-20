# Harness Remote 学习与 UI 复刻计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 学习成熟 Harness 移动端项目（重点 Clarklevis1995/dsh-mobile 的 SwiftUI 前端），把可复用的视觉语言与交互细节落入 dsh-harness-remote 的 Expo/React Native 前端，并补齐新功能的端到端截图证据。

**Architecture:** 保持现有 Expo RN + TypeScript 技术栈不变，不引入 SwiftUI/Kotlin。借鉴 Clarklevis1995/dsh-mobile 的三栏映射思路（工作区/对话+轨迹/设置）与视觉语言（深海蓝、网格、点阵鲸鱼、玻璃拟态降级），在当前 `theme.ts` token 体系上做增量升级，不做全量重写。

**Tech Stack:** React Native + Expo 57, TypeScript, @shopify/flash-list, @dsh-remote/protocol, mock-harness, Playwright（Web 预览截图）。

## 调研摘要（学习笔记）

### Clarklevis1995/dsh-mobile（SwiftUI iOS 客户端）
- 仓库：https://github.com/Clarklevis1995/dsh-mobile
- 架构：SwiftUI + `URLSessionWebSocketTask`，单一 WS 连接 `ws://<host>:3080/ws/mobile`，连 `dsh-plugin-mobile-gateway`。
- 状态：单一 `AppStore`（ObservableObject）做全局状态，Views 只读 `@Published` 并调用意图方法；`GatewayClient` 只管收发帧，`handle(_ frame:)` 统一分派。
- 数据：`JSONValue` 动态 JSON 枚举承载弱类型字段；`GatewayWireDecoder` 对缺 `kind` 的事件帧做特征补全；未知事件类型兜底保留 `type` 向前兼容。
- 历史/实时解耦：历史按 `beforeSeq` 分页（4MB/页预算、20s 超时、循环游标检测），实时尾部独立 `merge`，按 seq 去重排序；渲染时增量展开可见区，长历史不卡顿。
- 智能吸底：用户停留在底部才跟随新内容，用户上滑浏览历史后停止抢夺滚动位置。
- 视觉：浅/深双模式；深色首页用深海蓝、水波纹、网格、点阵鲸鱼还原 DeepSeek Harness 官网氛围；iOS 26+ 使用 Liquid Glass，低版本降级为 `ultraThinMaterial` + 描边 + 阴影。
- 三栏映射：工作区首页 / 对话+轨迹（常驻、左右滑动、独立滚动位置）/ 设置。
- 轨迹视图：Duration、Turns、Calls、Input、Model、Tools 时间线，点开看参数/结果/Schema/耗时。
- 会话控制：当前会话模型/思考等级/权限；部署级默认值（Agent 预设、默认模型、权限）。
- 安全配对：扫码或手动 `ws://`，长期凭据系统安全存储，公网必须 `wss://`。

### 其他生态项目
- sorsama/deepseek-harness-mobile：Kotlin + Jetpack Compose Android 伴侣，LAN 直连。
- dsh-pocket：扫码同屏，局域网 + 公网。
- dataelement/dsh-desktop、ningbainb/deepseek-harness-desktop：桌面壳，含移动端远程入口。
- 共性结论：瘦客户端 + 网关插件 + WS 事件流是主流路线；历史/实时解耦、事件归一化、弱类型兜底是共同技术重点。

### 落到本项目（dsh-harness-remote）的增量
1. **智能吸底**：我们已有 `showJump`/`scrollToEnd`，但自动滚底会打断用户浏览历史。改为「仅当用户接近底部才自动吸底」。
2. **深海蓝连接页 hero**：深色模式用深海蓝 + 网格 + 点阵鲸鱼还原官网氛围；浅色保持简洁。
3. **玻璃拟态降级**：不新增依赖，用 `rgba` 半透明背景 + 1px 边框模拟卡片材质。
4. **图片大图**：点击缩略图看大图（复用已拉取的 base64）。
5. **端到端证据**：mock-harness 补 `skill.list` / `session.attachment` / 图片事件 fixtures，Playwright 截图证明三条链路。

## Global Constraints

- 只允许改：`apps/mobile/app`、`apps/mobile/src`、`apps/mobile/test`、`mock-harness/fixtures`、`mock-harness/src`（仅新增 skill.list/session.attachment 回放分支，不碰测试）、`.shots`、`PROGRESS.md`、`BLOCKED.md`、`docs/plans`。
- 不新增任何 npm 依赖；不碰 `apps/mobile/package.json`、`pnpm-lock.yaml`。
- 不碰判卷标准、CI、验收脚本；不碰 `packages/protocol`、`relay`、`harness-plugin`、`tools/capture`。
- 测试数不得低于基线：capture 24 / protocol 127 / mobile 145 / mock-harness 29 / relay 39 / harness-plugin 53；skipped=0。
- `git diff` 中不得出现 `.skip` / `todo` / `it.todo`。
- 所有 UI 文案中文；保持现有 i18n 键值不破坏。
- 工作区有会话前已存在的 modified 文件（`harness-plugin/*`、`apps/mobile/src/data/goals.ts`、`app/_layout.tsx`、`app/sessions.tsx`、`app/settings.tsx`、`ui/StatusChip.tsx`、`ui/anim.ts`、`ui/chat/GoalCard.tsx`、`test/goals.test.ts`、`.gitignore` 等），除非任务明确要求，否则**不要**编辑这些文件；它们不属于本计划。

---

## Task 0: 新会话启动与基线核对

**Files:**
- Read: `PROGRESS.md`、`BLOCKED.md`、本文件
- Read: `apps/mobile/src/data/imageMessage.ts`、`apps/mobile/src/data/SessionStore.ts`、`apps/mobile/src/ui/chat/MessageBubble.tsx`、`apps/mobile/app/chat/[sessionId].tsx`

**Interfaces:**
- 基线数字：mobile 145 / protocol 127 / harness-plugin 53 / relay 39 / mock-harness 29 / capture 24。

- [ ] **Step 1:** 运行 `pnpm -r build`，确认 `BUILD_EXIT=0`。
- [ ] **Step 2:** 运行 `pnpm -r test`，核对各包测试数等于上述基线，`skipped=0`。
- [ ] **Step 3:** 若基线不符，在 `BLOCKED.md` 最上方记录差异并停止，只做不受影响的任务；核对无误后在 `PROGRESS.md` 顶部追加一行开工回执。

---

## Task 1: 图片点击查看大图

**Files:**
- Modify: `apps/mobile/src/ui/chat/MessageBubble.tsx`
- Modify: `apps/mobile/app/chat/[sessionId].tsx`（透传 `sessionId` 已有，无需改；若 TS 报错再调）

**Interfaces:**
- Consumes: `MessageBubble` 已有的 `imageData: Record<string, { mediaType: string; data: string }>`、`m.images?: TranscriptImage[]`。
- Produces: 新增 `const [zoomImage, setZoomImage] = useState<{ uri: string } | null>(null)` 与 Modal 渲染。

- [ ] **Step 1:** 在 `MessageBubble` 状态区新增：
```tsx
const [zoomImage, setZoomImage] = useState<{ uri: string } | null>(null);
```
- [ ] **Step 2:** 给缩略图 `Image` 包一层 `Pressable`，点击时若有 `loaded` 则：
```tsx
<Pressable
  key={img.attachmentId}
  onPress={() => {
    const loaded = imageData[img.attachmentId];
    if (loaded) setZoomImage({ uri: `data:${loaded.mediaType};base64,${loaded.data}` });
  }}
  accessibilityRole="button"
  accessibilityLabel="查看大图"
>
  {loaded ? (
    <Image source={{ uri: `data:${loaded.mediaType};base64,${loaded.data}` }} style={styles.imageThumb} resizeMode="cover" />
  ) : (
    <View style={[styles.imageThumb, styles.imageThumbLoading]}>
      <Text style={styles.imageThumbLoadingText}>…</Text>
    </View>
  )}
</Pressable>
```
- [ ] **Step 3:** 在 `MessageBubble` 返回的 JSX 中，长按菜单 Modal 之后新增大图 Modal：
```tsx
<Modal visible={zoomImage !== null} transparent animationType="fade" onRequestClose={() => setZoomImage(null)}>
  <Pressable style={styles.zoomBackdrop} onPress={() => setZoomImage(null)} accessibilityRole="button" accessibilityLabel="关闭大图">
    {zoomImage && (
      <Image source={{ uri: zoomImage.uri }} style={styles.zoomImage} resizeMode="contain" />
    )}
    <Text style={styles.zoomHint}>轻触关闭</Text>
  </Pressable>
</Modal>
```
- [ ] **Step 4:** 在 `createStyles` 增加：
```tsx
zoomBackdrop: {
  flex: 1,
  backgroundColor: "rgba(0,0,0,0.86)",
  alignItems: "center",
  justifyContent: "center",
  padding: 20,
},
zoomImage: {
  width: "100%",
  height: "80%",
},
zoomHint: {
  color: "#FFFFFF",
  fontSize: font.caption,
  marginTop: 12,
  opacity: 0.7,
},
```
- [ ] **Step 5:** 运行 `pnpm --filter @dsh-remote/mobile build` 与 `pnpm --filter @dsh-remote/mobile test`，预期全绿、145 不降。
- [ ] **Step 6:** 提交（如用户已给出 git 处理策略）：
```bash
git add apps/mobile/src/ui/chat/MessageBubble.tsx
git commit -m "feat(mobile): tap image thumbnail to view fullscreen"
```

---

## Task 2: mock-harness 补新功能 fixtures

**Files:**
- Read: `mock-harness/fixtures/` 下现有 JSON 与 `mock-harness/src/fixture-loader.ts`（或等价加载器），确认 unary 回放与 WS 帧回放的格式。
- Create: `mock-harness/fixtures/skill-list.json`（或并入现有会话 fixture）
- Create: `mock-harness/fixtures/session-attachment.json`
- Modify: `mock-harness/fixtures/` 中会话事件 fixture（新增 image block 事件帧）
- Modify（仅当 fixture 机制无法覆盖时）: `mock-harness/src/` 中 unary 回放分发，新增两个分支。

**Interfaces:**
- `skill.list` 请求 `{sessionId}`，响应 `{ok:true, result:{skills:[{name,description,whenToUse,modelInvocable}]}}`。
- `session.attachment` 请求 `{sessionId,attachmentId}`，响应 `{ok:true, result:{attachment:{attachmentId,mediaType,bytes,width,height,name?}, data}}`。
- 事件帧沿用真实 DSH 形状：`{type:"session/event", sessionId, event:{type:"user/message", seq, time, data:{content:[{type:"text",text:"看这张图"},{type:"image",mediaType:"image/png",attachmentId:"att_1"}]}}}`。

- [ ] **Step 1:** 读现有 fixtures，记录 unary 匹配方式（按 method 名还是 URL）与 WS 事件回放方式，写入 `PROGRESS.md` 一行。
- [ ] **Step 2:** 新增 skill fixture，内容示例：
```json
{
  "method": "skill.list",
  "request": { "sessionId": "s1" },
  "response": {
    "ok": true,
    "result": {
      "skills": [
        { "name": "pdf", "description": "读取 PDF", "whenToUse": "处理 PDF 文档", "modelInvocable": true },
        { "name": "xlsx", "description": "读取 Excel", "modelInvocable": false }
      ]
    }
  }
}
```
- [ ] **Step 3:** 新增 attachment fixture，`data` 用 1x1 PNG 的 base64（可复用 `apps/mobile/test` 中任意测试用短 base64，或 `aGVsbG8=` 仅用于回放显示）：
```json
{
  "method": "session.attachment",
  "request": { "sessionId": "s1", "attachmentId": "att_1" },
  "response": {
    "ok": true,
    "result": {
      "attachment": { "attachmentId": "att_1", "mediaType": "image/png", "bytes": 6, "width": 1, "height": 1, "name": "pixel.png" },
      "data": "aGVsbG8="
    }
  }
}
```
- [ ] **Step 4:** 在会话事件 fixture 中插入 image block 事件（放在既有 `user/message` 附近）：
```json
{
  "type": "session/event",
  "sessionId": "s1",
  "event": {
    "type": "user/message",
    "seq": 100,
    "time": 1787000000000,
    "data": {
      "content": [
        { "type": "text", "text": "看这张图" },
        { "type": "image", "mediaType": "image/png", "attachmentId": "att_1" }
      ]
    }
  }
}
```
- [ ] **Step 5:** 若 fixture 机制需要 src 支持，最小新增回放分支（保留旧行为，不修改任何测试文件）。
- [ ] **Step 6:** 运行 `pnpm --filter mock-harness build` 和 `pnpm --filter mock-harness test`，预期 29 不降。
- [ ] **Step 7:** 提交：
```bash
git add mock-harness/fixtures
git commit -m "feat(mock-harness): add skill.list, session.attachment and image event fixtures"
```

---

## Task 3: 聊天页智能吸底

**Files:**
- Modify: `apps/mobile/app/chat/[sessionId].tsx`

**Interfaces:**
- Consumes: 现有 `listRef: FlashListRef`、`showJump`、`onScroll`、`useEffect([data.length])`。
- Produces: 新增 `stickyToBottom` 布尔；`onScroll` 计算「距底部 < 60」时置 true，否则 false；自动滚底 effect 仅在 `stickyToBottom` 为 true 时执行；`jumpToBottom` 执行后置 true。

- [ ] **Step 1:** 在 `showJump` 状态旁新增：
```tsx
const [stickyToBottom, setStickyToBottom] = useState(true);
```
- [ ] **Step 2:** 修改 `onScroll`，在现有 `showJump` 计算后追加：
```tsx
const nearBottom = distance < 60;
if (nearBottom !== stickyToBottom) setStickyToBottom(nearBottom);
```
- [ ] **Step 3:** 修改自动滚底 effect：
```tsx
useEffect(() => {
  if (data.length > 0 && stickyToBottom) {
    listRef.current?.scrollToEnd({ animated: data.length <= 4 });
  }
}, [data.length, stickyToBottom]);
```
- [ ] **Step 4:** 修改 `jumpToBottom`，滚底后强制恢复吸底：
```tsx
const jumpToBottom = () => {
  setStickyToBottom(true);
  listRef.current?.scrollToEnd({ animated: true });
  void haptic("light");
};
```
- [ ] **Step 5:** 运行 `pnpm --filter @dsh-remote/mobile build` 与 `pnpm --filter @dsh-remote/mobile test`，预期全绿、145 不降。
- [ ] **Step 6:** 提交：
```bash
git add "apps/mobile/app/chat/[sessionId].tsx"
git commit -m "feat(mobile): only auto-stick to bottom when user is near bottom"
```

---

## Task 4: 连接页 DeepSeek 官网风格 hero（深海蓝网格 + 点阵鲸鱼）

**Files:**
- Modify: `apps/mobile/src/theme.ts`
- Create: `apps/mobile/src/ui/DeepOceanHero.tsx`
- Modify: `apps/mobile/app/index.tsx`（仅 hero 区域，保留表单逻辑）

**Interfaces:**
- Produces: `DeepOceanHero` 组件 props `{ compact?: boolean }`；theme 新增 `heroBg: string; heroGrid: string; heroText: string; heroTextDim: string;` 四个 token（浅色/深色各给值）。

- [ ] **Step 1:** 在 `ThemeColors` 接口和 `light`/`dark` 常量中新增 token：
```ts
heroBg: "#0A1A3F",       // 深色：深海蓝；浅色同样深蓝（官网 hero 在浅色模式也常用深蓝）
heroGrid: "rgba(86,134,254,0.18)",
heroText: "#F2F6FF",
heroTextDim: "rgba(242,246,255,0.62)",
```
- [ ] **Step 2:** 创建 `src/ui/DeepOceanHero.tsx`：
```tsx
import { useMemo } from "react";
import { StyleSheet, Text, View } from "react-native";
import { useTheme } from "../theme-context";
import { font, space } from "../theme";
import { WhaleMark } from "./WhaleMark";

export function DeepOceanHero({ title, subtitle }: { title: string; subtitle?: string }) {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const gridLines = Array.from({ length: 6 }, (_, i) => i);
  return (
    <View style={styles.hero}>
      <View style={styles.grid} pointerEvents="none">
        {gridLines.map((i) => (
          <View key={`v${i}`} style={[styles.gridV, { left: `${(i + 1) * 14}%` }]} />
        ))}
        {gridLines.map((i) => (
          <View key={`h${i}`} style={[styles.gridH, { top: `${(i + 1) * 16}%` }]} />
        ))}
      </View>
      <View style={styles.whale} pointerEvents="none">
        <WhaleMark size={120} />
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
      minHeight: 220,
      justifyContent: "center",
    },
    grid: { ...StyleSheet.absoluteFillObject },
    gridV: { position: "absolute", top: 0, bottom: 0, width: 1, backgroundColor: colors.heroGrid },
    gridH: { position: "absolute", left: 0, right: 0, height: 1, backgroundColor: colors.heroGrid },
    whale: { opacity: 0.9, marginBottom: space.x3 },
    title: { color: colors.heroText, fontFamily: font.displayBold, fontSize: font.title, textAlign: "center" },
    subtitle: { color: colors.heroTextDim, fontSize: font.caption, textAlign: "center", marginTop: space.x1 },
  });
}
```
- [ ] **Step 3:** 在 `app/index.tsx` 的 hero 区域用 `<DeepOceanHero title="手机远程连接我的电脑" subtitle={...} />` 替换现有 hero 文案块（保留 `heroEntering` 动画包裹）。若 `WhaleMark` 不接受 `size` prop，用其现有 prop 或直接删除 `size` 行。
- [ ] **Step 4:** 运行 `pnpm --filter @dsh-remote/mobile build`，确保 `WhaleMark` prop 类型正确；如 `WhaleMark` 无 `size` prop，删除该行并重新构建。
- [ ] **Step 5:** 运行 `pnpm --filter @dsh-remote/mobile test`，预期 145 不降。
- [ ] **Step 6:** 提交：
```bash
git add apps/mobile/src/theme.ts apps/mobile/src/ui/DeepOceanHero.tsx apps/mobile/app/index.tsx
git commit -m "feat(mobile): deep-ocean hero on connect screen matching DSH website"
```

---

## Task 5: Web 预览 + Playwright 截图证据

**Files:**
- Create: `.shots/plan-ui-evidence.mjs`（或沿用仓库既有 `.shots/*.mjs` 风格）
- Output: `.shots/plan-skill-picker.png`、`.shots/plan-image-message.png`、`.shots/plan-image-zoom.png`、`.shots/plan-connect-hero.png`

**Interfaces:**
- Consumes: mock-harness fixtures（Task 2）、Expo Web 预览、Playwright。

- [ ] **Step 1:** 启动 mock-harness：
```bash
pnpm --filter mock-harness build
node mock-harness/dist/cli.js --port 3080
```
- [ ] **Step 2:** 启动 Expo Web：
```bash
pnpm --filter @dsh-remote/mobile web --port 8081
```
- [ ] **Step 3:** 用 Playwright 打开 `http://localhost:8081`，走「远程/LAN 连接 → 会话列表 → 进入 s1」流程，断言并截图：
  - 连接页 hero（深海蓝）→ `.shots/plan-connect-hero.png`
  - 技能按钮 → 点击 → 技能弹窗 → `.shots/plan-skill-picker.png`
  - 图片消息气泡（含缩略图）→ `.shots/plan-image-message.png`
  - 点击图片 → 大图 Modal → `.shots/plan-image-zoom.png`
- [ ] **Step 4:** 将截图文件名写入 `PROGRESS.md`。
- [ ] **Step 5:** 提交：
```bash
git add .shots/plan-ui-evidence.mjs
git commit -m "test(shots): web evidence for skill picker, image message and zoom"
```

---

## Task 6: git 工作区清单 + 全仓回归 + 文档

**Files:**
- Modify: `PROGRESS.md`、`BLOCKED.md`

- [ ] **Step 1:** 运行 `git status --short` 并生成分类清单：
  - 本计划新增/修改文件（`apps/mobile/src/ui/DeepOceanHero.tsx`、`MessageBubble.tsx`、`chat/[sessionId].tsx`、`theme.ts`、`index.tsx`、`mock-harness/fixtures/*`、`.shots/*`、`PROGRESS.md`、`BLOCKED.md`）。
  - 会话前已存在的 modified 文件（不提交）：`harness-plugin/*`、`apps/mobile/src/data/goals.ts`、`app/_layout.tsx`、`app/sessions.tsx`、`app/settings.tsx`、`ui/StatusChip.tsx`、`ui/anim.ts`、`ui/chat/GoalCard.tsx`、`test/goals.test.ts`、`.gitignore` 等。
- [ ] **Step 2:** 把清单写入 `PROGRESS.md`，标注「等待用户决定是否提交」。
- [ ] **Step 3:** 运行全仓回归：
```bash
pnpm -r build
pnpm -r test
```
预期：build 全绿；capture 24 / protocol 127 / mobile ≥145 / mock-harness 29 / relay 39 / harness-plugin 53；skipped=0。
- [ ] **Step 4:** 检查 `git diff` 无 `.skip` / `todo`：
```bash
git diff | Select-String -Pattern '(?i)\.skip|\btodo\b' -CaseSensitive:$false
```
预期无匹配。
- [ ] **Step 5:** `BLOCKED.md` 顶部写「本计划：无」或记录具体阻塞。
- [ ] **Step 6:** 不要自动 `git add` 会话前已存在的文件；只报告，等待用户指示。

---

## 后续窗口（本次不做，仅记录）

1. 对话/轨迹双视图：参考 Clarklevis 的 TrajectoryView，把 `SessionStore` 已折叠的 tool/call、tool/result、turn 事件渲染为时间线页，与对话页左右滑动切换。
2. 全局默认配置 UI：Agent 预设、默认模型、默认权限（我们协议层已有 `agentPreset.list/select`、`settings.describe/mutate`）。
3. Liquid Glass 真机效果：需要 Expo Blur/新依赖或系统材质，待真机与 EAS build 窗口。
4. 会话写操作 UI：`session.rename` / `session.fork` / `workspace.archiveSession` 的移动端入口。
5. 真机推送与 iOS 包：需要 EAS 登录 + Apple/FCM 凭据，不在本窗口。
