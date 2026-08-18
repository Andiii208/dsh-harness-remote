/**
 * ConnectionPipeline — 把 ConnectionLoop + SessionStore + NotificationClassifier
 * 装配为一条可测试的数据管道（纯逻辑，无 React 依赖）。
 * ConnectionProvider 只是它的薄封装。
 */

import {
  ConnectionLoop,
  type Auth,
  type ConnectionState,
  type Endpoint,
  type Transport,
} from "@dsh-remote/protocol";
import { SessionStore } from "../data/SessionStore";
import { NotificationClassifier, type NotificationEvent } from "../notify/classifier";

export interface ConnectionPipelineOptions {
  endpoint: Endpoint;
  transport: Transport;
  /** 配对 token（M2）→ LanTransport auth。 */
  auth?: Auth;
  onStateChange?: (s: ConnectionState) => void;
  onError?: (err: unknown) => void;
  onNotification?: (n: NotificationEvent) => void;
  /** 连续连接失败达到该次数后放弃（默认 8；移动端不再无限重试）。 */
  maxAttempts?: number;
  onGiveUp?: (lastError: unknown) => void;
}

export interface ConnectionPipeline {
  loop: ConnectionLoop;
  store: SessionStore;
  classifier: NotificationClassifier;
  start(): void;
  /** 停止并等待 loop 退出（新连接前 await，避免新旧 WS 重叠）。 */
  stop(): Promise<void>;
}

export function createConnectionPipeline(opts: ConnectionPipelineOptions): ConnectionPipeline {
  const store = new SessionStore();
  const classifier = new NotificationClassifier();
  const loop = new ConnectionLoop({
    endpoint: opts.endpoint,
    transport: opts.transport,
    auth: opts.auth,
    onStateChange: opts.onStateChange,
    onError: opts.onError,
    maxAttempts: opts.maxAttempts,
    onGiveUp: opts.onGiveUp,
  });

  const pump = async (): Promise<void> => {
    for await (const frame of loop.events) {
      store.applyFrame(frame);
      const ev = classifier.classify(frame);
      if (ev) opts.onNotification?.(ev);
    }
  };

  return {
    loop,
    store,
    classifier,
    start() {
      void pump().catch((err) => opts.onError?.(err));
      loop.start();
    },
    stop() {
      return loop.stop();
    },
  };
}
