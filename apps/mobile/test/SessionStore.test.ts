import { describe, expect, it } from "vitest";
import { SessionStore } from "../src/data/SessionStore";

function frame(type: string, extra: Record<string, unknown> = {}): unknown {
  return { type, ...extra };
}

describe("SessionStore", () => {
  it("tracks session registry add/remove", () => {
    const s = new SessionStore();
    s.applyFrame(frame("session/registry", { action: "added", sessionId: "s1", title: "deploy", workspace: "D:\\app" }) as never);
    expect(s.getSessions()).toHaveLength(1);
    expect(s.getSessions()[0]).toMatchObject({ id: "s1", title: "deploy" });

    s.applyFrame(frame("session/registry", { action: "removed", sessionId: "s1" }) as never);
    expect(s.getSessions()).toHaveLength(0);
  });

  it("assembles streaming deltas into a message", () => {
    const s = new SessionStore();
    s.applyFrame(frame("session/event", { sessionId: "s1", event: "turn/start", turn: { id: "t1" } }) as never);
    s.applyFrame(frame("session/event", { sessionId: "s1", event: "message/delta", message: { id: "m1", role: "assistant", delta: "你好" } }) as never);
    s.applyFrame(frame("session/event", { sessionId: "s1", event: "message/delta", message: { id: "m1", role: "assistant", delta: "，世界" } }) as never);
    s.applyFrame(frame("session/event", { sessionId: "s1", event: "message/complete", message: { id: "m1", role: "assistant", content: "你好，世界", done: true } }) as never);

    const t = s.getTranscript("s1");
    expect(t).toHaveLength(1);
    expect(t[0]).toMatchObject({ id: "m1", role: "assistant", content: "你好，世界" });
    expect(s.getSessions()[0]?.lastMessage).toBe("你好，世界");
  });

  it("marks interrupted streaming messages", () => {
    const s = new SessionStore();
    s.applyFrame(frame("session/event", { sessionId: "s1", event: "message/delta", message: { id: "m1", delta: "写到一半" } }) as never);
    s.applyFrame(frame("session/event", { sessionId: "s1", event: "interrupted" }) as never);
    s.applyFrame(frame("session/event", { sessionId: "s1", event: "turn/complete", turn: { id: "t1" } }) as never);
    expect(s.getTranscript("s1")[0]).toMatchObject({ content: "写到一半", interrupted: true });
  });

  it("inserts a gap marker when a turn starts over an unfinished message", () => {
    const s = new SessionStore();
    s.applyFrame(frame("session/event", { sessionId: "s1", event: "message/delta", message: { id: "m1", delta: "未完成" } }) as never);
    s.applyFrame(frame("session/event", { sessionId: "s1", event: "turn/start", turn: { id: "t2" } }) as never);
    const t = s.getTranscript("s1");
    expect(t).toHaveLength(1);
    expect(t[0]).toMatchObject({ gap: true, role: "assistant" });
    expect(t[0]?.content).toContain("间隙");
  });

  it("inserts a gap marker on an explicit gap event", () => {
    const s = new SessionStore();
    s.applyFrame(frame("session/event", { sessionId: "s1", event: "gap" }) as never);
    expect(s.getTranscript("s1")[0]).toMatchObject({ gap: true });
  });

  it("folds DSH Desktop object events (user/message, assistant/chunk, assistant/message)", () => {
    const s = new SessionStore();
    s.applyFrame(frame("session/event", {
      sessionId: "s1",
      event: { type: "user/message", seq: 1, time: Date.now(), data: { content: [{ type: "text", text: "远程发送的消息" }] } },
    }) as never);
    s.applyFrame(frame("session/event", {
      sessionId: "s1",
      event: { type: "assistant/chunk", seq: 2, time: Date.now(), data: { chunk: { type: "text-delta", text: "你好" } } },
    }) as never);
    s.applyFrame(frame("session/event", {
      sessionId: "s1",
      event: { type: "assistant/chunk", seq: 3, time: Date.now(), data: { chunk: { type: "text-delta", text: "，世界" } } },
    }) as never);
    s.applyFrame(frame("session/event", {
      sessionId: "s1",
      event: { type: "assistant/message", seq: 4, time: Date.now(), data: { message: { content: [{ type: "text", text: "你好，世界" }] } } },
    }) as never);

    const t = s.getTranscript("s1");
    expect(t.map((m) => `${m.role}:${m.content}`)).toEqual([
      "user:远程发送的消息",
      "assistant:你好，世界",
    ]);
    expect(s.getSessions()[0]?.lastMessage).toBe("你好，世界");
  });

  it("folds image content blocks into transcript images (user/message and assistant/message)", () => {
    const s = new SessionStore();
    s.applyFrame(frame("session/event", {
      sessionId: "s1",
      event: { type: "user/message", seq: 1, time: Date.now(), data: { content: [{ type: "text", text: "看这张图" }, { type: "image", mediaType: "image/png", attachmentId: "att_1" }] } },
    }) as never);
    s.applyFrame(frame("session/event", {
      sessionId: "s1",
      event: { type: "assistant/message", seq: 2, time: Date.now(), data: { message: { content: [{ type: "image", mediaType: "image/jpeg", attachmentId: "att_2" }] } } },
    }) as never);

    const t = s.getTranscript("s1");
    expect(t).toHaveLength(2);
    expect(t[0]).toMatchObject({
      role: "user",
      content: "看这张图",
      images: [{ attachmentId: "att_1", mediaType: "image/png" }],
    });
    expect(t[1]).toMatchObject({
      role: "assistant",
      content: "",
      images: [{ attachmentId: "att_2", mediaType: "image/jpeg" }],
    });
    expect(s.getSessions()[0]?.lastMessage).toBe("[图片]");
  });

  it("finalizes a live DSH Desktop chunk when turn/end arrives", () => {
    const s = new SessionStore();
    s.applyFrame(frame("session/event", {
      sessionId: "s1",
      event: { type: "assistant/chunk", seq: 1, time: Date.now(), data: { chunk: { type: "text-delta", text: "流式内容" } } },
    }) as never);
    s.applyFrame(frame("session/event", {
      sessionId: "s1",
      event: { type: "turn/end", seq: 2, time: Date.now(), data: {} },
    }) as never);
    expect(s.getTranscript("s1")).toHaveLength(1);
    expect(s.getTranscript("s1")[0]).toMatchObject({ role: "assistant", content: "流式内容" });
  });

  it("applies DSH Desktop key/value projection frames", () => {
    const s = new SessionStore();
    s.applyFrame(frame("session/projection", { sessionId: "s1", key: "title", value: "新版标题" }) as never);
    s.applyFrame(frame("session/projection", { sessionId: "s1", key: "goal", value: { status: "active", objective: "远程目标" } }) as never);
    s.applyFrame(frame("session/projection", { sessionId: "s1", key: "contextPressure", value: { percent: 88 } }) as never);
    const summary = s.getSessions()[0];
    expect(summary).toMatchObject({ title: "新版标题", goalStatus: "active", goalObjective: "远程目标", contextPercent: 88 });
  });

  it("derives projection fields into the summary", () => {
    const s = new SessionStore();
    s.applyFrame(frame("session/projection", {
      sessionId: "s1",
      title: "deploy",
      goal: { status: "active" },
      tokenUsage: { total: 12000 },
      contextPressure: { percent: 42 },
    }) as never);
    const sum = s.getSessions()[0];
    expect(sum).toMatchObject({ title: "deploy", goalStatus: "active", tokenUsageTotal: 12000, contextPercent: 42 });
  });

  it("keeps pending server-requests and resolves them", () => {
    const s = new SessionStore();
    s.applyFrame(frame("server/request", { rpcId: "r1", kind: "approval", payload: { prompt: "ok?" } }) as never);
    expect(s.getPendingRequests()).toHaveLength(1);
    expect(s.getPendingRequest("r1")?.kind).toBe("approval");
    s.resolvePending("r1");
    expect(s.getPendingRequests()).toHaveLength(0);
  });

  it("tracks real DSH approval/requested frames as pending approvals", () => {
    const s = new SessionStore();
    s.applyFrame(frame("approval/requested", {
      rpcId: "rpc-approve-1",
      sessionId: "s1",
      approvalId: "approval-1",
      toolName: "run_code",
      reason: "allow command",
    }) as never);
    const p = s.getPendingRequest("rpc-approve-1");
    expect(p?.kind).toBe("approval");
    expect(p?.payload).toMatchObject({ approvalId: "approval-1", sessionId: "s1", prompt: "allow command", command: "run_code" });
  });

  it("tracks real DSH question/requested frames as pending questions", () => {
    const s = new SessionStore();
    s.applyFrame(frame("question/requested", {
      rpcId: "rpc-q-1",
      sessionId: "s1",
      questions: [{ id: "q1", question: "部署？", options: [{ label: "yes" }, { label: "no" }] }],
    }) as never);
    const p = s.getPendingRequest("rpc-q-1");
    expect(p?.kind).toBe("question");
    expect(p?.payload).toMatchObject({ sessionId: "s1", question: "部署？" });
    expect(Array.isArray((p?.payload as { questions?: unknown[] })?.questions)).toBe(true);
  });

  it("resolves real DSH approval/question resolved frames by rpcId", () => {
    const s = new SessionStore();
    s.applyFrame(frame("approval/requested", { rpcId: "r1", sessionId: "s1", approvalId: "a1" }) as never);
    s.applyFrame(frame("question/requested", { rpcId: "r2", sessionId: "s1", questions: [{ id: "q1" }] }) as never);
    expect(s.getPendingRequests()).toHaveLength(2);
    s.applyFrame(frame("approval/resolved", { rpcId: "r1", sessionId: "s1", approvalId: "a1", outcome: "allowed-once" }) as never);
    s.applyFrame(frame("question/resolved", { rpcId: "r2", sessionId: "s1", questionRpcId: "r2", outcome: "answered" }) as never);
    expect(s.getPendingRequests()).toHaveLength(0);
  });

  it("ignores unknown frames without crashing", () => {
    const s = new SessionStore();
    for (const bad of [null, 42, "x", {}, { type: "brand/new" }, { type: "unknown" }]) {
      expect(() => s.applyFrame(bad as never)).not.toThrow();
    }
  });

  it("sorts sessions by recency", () => {
    const s = new SessionStore();
    s.applyFrame(frame("session/registry", { action: "added", sessionId: "old" }) as never);
    s.applyFrame(frame("session/registry", { action: "added", sessionId: "new" }) as never);
    expect(s.getSessions().map((x) => x.id)).toEqual(["new", "old"]);
  });

  it("exposes live streaming message before completion", () => {
    const s = new SessionStore();
    s.applyFrame(frame("session/event", { sessionId: "s1", event: "message/delta", message: { id: "m1", role: "assistant", delta: "正在" } }) as never);
    s.applyFrame(frame("session/event", { sessionId: "s1", event: "message/delta", message: { id: "m1", role: "assistant", delta: "思考" } }) as never);
    expect(s.getLiveMessage("s1")).toMatchObject({ id: "m1", role: "assistant", content: "正在思考" });
    s.applyFrame(frame("session/event", { sessionId: "s1", event: "message/complete", message: { id: "m1", role: "assistant", content: "正在思考", done: true } }) as never);
    expect(s.getLiveMessage("s1")).toBeUndefined();
  });

  it("records lastActiveAt timestamps for recency display", () => {
    const s = new SessionStore();
    const before = Date.now();
    s.applyFrame(frame("session/registry", { action: "added", sessionId: "s1", title: "t" }) as never);
    const sum = s.getSessions()[0];
    expect(sum?.lastActiveAt).toBeGreaterThanOrEqual(before);
    expect(sum?.lastActiveAt).toBeLessThanOrEqual(Date.now());
  });

  it("applySessionList replaces the list while keeping derived fields", () => {
    const s = new SessionStore();
    s.applyFrame(frame("session/projection", { sessionId: "s1", goal: { status: "active" }, tokenUsage: { total: 100 } }) as never);
    s.applySessionList([
      { id: "s1", title: "deploy", workspace: "D:/app" },
      { id: "s2", title: "debug", workspace: "D:/app" },
    ] as never);
    const list = s.getSessions();
    expect(list.map((x) => x.id)).toEqual(["s2", "s1"]); // 按 updatedAt 倒序
    expect(list.find((x) => x.id === "s1")).toMatchObject({ title: "deploy", goalStatus: "active", tokenUsageTotal: 100 });
  });

  it("applySessionList understands real DSH rc.7 session.list items (sessionId/projections/cwd)", () => {
    const s = new SessionStore();
    s.applySessionList([
      {
        sessionId: "s1",
        updatedAt: 1787000000000,
        running: false,
        blank: false,
        cwd: "D:\\app",
        projections: { asOfSeq: 1, values: { title: "deploy checklist", goal: { status: "active" } } },
      },
      {
        sessionId: "s2",
        updatedAt: 1787000001000,
        running: true,
        blank: false,
        cwd: "D:\\app",
        projections: { asOfSeq: 2, values: { title: "debug e2e" } },
      },
    ] as never);
    const list = s.getSessions();
    expect(list.map((x) => x.id)).toEqual(["s2", "s1"]);
    expect(list[1]).toMatchObject({ title: "deploy checklist", workspace: "D:\\app", goalStatus: "active" });
    expect(list[1]?.updatedAt).toBe(1787000000000);
  });

  it("applySessionList drops sessions missing from the list", () => {
    const s = new SessionStore();
    s.applySessionList([{ id: "s1", title: "t" }] as never);
    s.applySessionList([{ id: "s2", title: "t2" }] as never);
    expect(s.getSessions().map((x) => x.id)).toEqual(["s2"]);
  });

  it("applyHistory folds native session.history entries into transcript", () => {
    const s = new SessionStore();
    s.applyHistory([
      { event: { type: "turn/start", seq: 0, time: 0, data: {} } },
      { event: { type: "user/message", seq: 1, time: 0, data: { content: [{ type: "text", text: "你好" }] } } },
      { event: { type: "assistant/chunk", seq: 2, time: 0, data: { chunk: { type: "text-delta", text: "你" } } } },
      { event: { type: "assistant/chunk", seq: 3, time: 0, data: { chunk: { type: "text-delta", text: "好" } } } },
      { event: { type: "assistant/message", seq: 4, time: 0, data: { message: { content: [{ type: "text", text: "你好" }] } } } },
      { event: { type: "turn/end", seq: 5, time: 0, data: { reason: { kind: "done" } } } },
    ], "s1");
    const t = s.getTranscript("s1");
    expect(t.map((m) => `${m.role}:${m.content}`)).toEqual(["user:你好", "assistant:你好"]);
    expect(s.getSessions()[0]?.lastMessage).toBe("你好");
  });

  it("threads event time into transcript ts for date grouping", () => {
    const s = new SessionStore();
    const t0 = 1787000000000;
    const t1 = t0 + 60_000;
    s.applyHistory([
      { event: { type: "user/message", seq: 1, time: t0, data: { content: [{ type: "text", text: "你好" }] } } },
      { event: { type: "assistant/chunk", seq: 2, time: t1, data: { chunk: { type: "text-delta", text: "世" } } } },
      { event: { type: "assistant/message", seq: 3, time: t1, data: { message: { content: [{ type: "text", text: "世界" }] } } } },
      { event: { type: "tool/call", seq: 4, time: t1, data: { callId: "c1", name: "bash" } } },
    ], "s1");
    const t = s.getTranscript("s1");
    expect(t[0]?.ts).toBe(t0);
    expect(t[1]?.ts).toBe(t1);
    expect(t[2]?.ts).toBe(t1);
  });

  it("applyHistory folds tool call/result events", () => {
    const s = new SessionStore();
    s.applyHistory([
      { event: { type: "tool/call", seq: 0, time: 0, data: { callId: "c1", name: "bash", arguments: "ls" } } },
      { event: { type: "tool/result", seq: 1, time: 0, data: { message: { content: [{ type: "text", text: "README.md" }] } } } },
    ], "s1");
    const t = s.getTranscript("s1");
    expect(t).toHaveLength(2);
    expect(t[0]).toMatchObject({ role: "tool", id: "c1" });
    expect(t[0]?.content).toContain("bash");
    expect(t[1]?.content).toContain("README.md");
  });

  it("applySessionList parses permissions projection", () => {
    const s = new SessionStore();
    s.applySessionList([
      {
        sessionId: "s1",
        updatedAt: 1,
        projections: {
          asOfSeq: 1,
          values: {
            title: "t",
            permissions: {
              options: [{ value: "read-only", name: "read-only" }, { value: "workspace-write", name: "workspace-write" }],
              currentValue: "workspace-write",
            },
          },
        },
      },
    ] as never);
    const sum = s.getSessions()[0];
    expect(sum?.permissionOptions).toEqual(["read-only", "workspace-write"]);
    expect(sum?.permissionCurrent).toBe("workspace-write");
  });

  it("applyProjection updates permissions", () => {
    const s = new SessionStore();
    s.applyFrame(frame("session/projection", {
      sessionId: "s1",
      key: "permissions",
      value: { options: [{ value: "danger-full-access", name: "danger-full-access" }], currentValue: "danger-full-access" },
    }) as never);
    const sum = s.getSessions()[0];
    expect(sum?.permissionOptions).toEqual(["danger-full-access"]);
    expect(sum?.permissionCurrent).toBe("danger-full-access");
  });

  it("folds imageLimits projection into session summary", () => {
    const s = new SessionStore();
    s.applyFrame(frame("session/projection", {
      sessionId: "s1",
      key: "imageLimits",
      value: {
        maxImageBytes: 5_000_000,
        maxImagesPerMessage: 4,
        maxMessageImageBytes: 8_000_000,
        maxImagePixels: 20_000_000,
        mediaTypes: ["image/png", "image/jpeg", "image/webp", "image/gif"],
      },
    }) as never);
    expect(s.getSessions()[0]?.imageLimits).toMatchObject({
      maxImageBytes: 5_000_000,
      maxImagesPerMessage: 4,
      mediaTypes: ["image/png", "image/jpeg", "image/webp", "image/gif"],
    });

    s.applySessionList([{
      sessionId: "s1",
      updatedAt: 1,
      projections: {
        asOfSeq: 1,
        values: {
          imageLimits: {
            maxImageBytes: 1_000_000,
            maxImagesPerMessage: 1,
            maxMessageImageBytes: 1_000_000,
            maxImagePixels: 10_000_000,
            mediaTypes: ["image/png"],
          },
        },
      },
    }] as never);
    expect(s.getSessions()[0]?.imageLimits).toMatchObject({ maxImageBytes: 1_000_000, mediaTypes: ["image/png"] });
  });

  it("folds session/queue and session/jobs frames", () => {
    const s = new SessionStore();
    s.applyFrame(frame("session/queue", {
      sessionId: "s1",
      items: [
        { id: "q1", placement: "queued", message: { id: "m1", role: "user", content: [{ type: "text", text: "排队消息" }] } },
        { id: "q2", placement: "steering", message: { id: "m2", role: "user", content: [{ type: "text", text: "插队消息" }] } },
      ],
    }) as never);
    s.applyFrame(frame("session/jobs", {
      sessionId: "s1",
      jobs: [{ id: "j1", kind: "workflow", label: "发布", status: "running", startedAt: 1 }],
    }) as never);
    expect(s.getQueueItems("s1")).toHaveLength(2);
    expect(s.getQueueItems("s1")[0]).toMatchObject({ id: "q1", placement: "queued", text: "排队消息" });
    expect(s.getJobs("s1")).toHaveLength(1);
    expect(s.getJobs("s1")[0]).toMatchObject({ id: "j1", status: "running", label: "发布" });
  });

  it("folds host/session-status and host/session-removed frames", () => {
    const s = new SessionStore();
    s.applyFrame(frame("session/registry", { action: "added", sessionId: "s1", title: "t" }) as never);
    s.applyFrame(frame("host/session-status", { sessionId: "s1", running: true }) as never);
    expect(s.getSessions()[0]?.running).toBe(true);
    s.applyFrame(frame("host/session-removed", { sessionId: "s1" }) as never);
    expect(s.getSessions()).toHaveLength(0);
  });

  it("keeps server updatedAt separate from monotonic sort key (H1)", () => {
    const s = new SessionStore();
    s.applySessionList([
      { sessionId: "old", updatedAt: 1787000000000 },
      { sessionId: "new", updatedAt: 1787000001000 },
    ] as never);
    expect(s.getSessions().map((x) => x.id)).toEqual(["new", "old"]);

    // 实时事件落在“旧”会话上：排序键推进，服务器毫秒时间不参与排序。
    s.applyFrame(frame("session/event", {
      sessionId: "old",
      event: { type: "assistant/chunk", seq: 10, time: Date.now(), data: { chunk: { type: "text-delta", text: "hi" } } },
    }) as never);
    const list = s.getSessions();
    expect(list.map((x) => x.id)).toEqual(["old", "new"]);
    expect(list[0]?.serverUpdatedAt).toBe(1787000000000);
    expect(list[1]?.serverUpdatedAt).toBe(1787000001000);
  });

  it("registers realtime seq so replayed history cannot duplicate it (H2)", () => {
    const s = new SessionStore();
    s.applyFrame(frame("session/event", {
      sessionId: "s1",
      event: { type: "user/message", seq: 1, time: 1, data: { content: [{ type: "text", text: "你好" }] } },
    }) as never);
    s.applyHistory([
      { event: { type: "user/message", seq: 1, time: 1, data: { content: [{ type: "text", text: "你好" }] } } },
      { event: { type: "user/message", seq: 2, time: 2, data: { content: [{ type: "text", text: "世界" }] } } },
    ], "s1");
    expect(s.getTranscript("s1").map((m) => m.content)).toEqual(["你好", "世界"]);
  });

  it("folds reasoning-delta chunks into a collapsed thinking block (M9)", () => {
    const s = new SessionStore();
    s.applyHistory([
      { event: { type: "assistant/chunk", seq: 1, time: 1, data: { chunk: { type: "block-start", blockType: "reasoning" } } } },
      { event: { type: "assistant/chunk", seq: 2, time: 2, data: { chunk: { type: "reasoning-delta", text: "We need execute" } } } },
      { event: { type: "assistant/chunk", seq: 3, time: 3, data: { chunk: { type: "text-delta", text: "你好" } } } },
      { event: { type: "assistant/message", seq: 4, time: 4, data: { message: { content: [{ type: "text", text: "你好" }] } } } },
    ], "s1");
    const t = s.getTranscript("s1");
    expect(t).toHaveLength(1);
    expect(t[0]).toMatchObject({ role: "assistant", content: "你好", thinking: "We need execute" });
  });
});
