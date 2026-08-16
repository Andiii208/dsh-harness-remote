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
}

export interface ConnectionPipeline {
  loop: ConnectionLoop;
  store: SessionStore;
  classifier: NotificationClassifier;
  start(): void;
  stop(): void;
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
      void pump();
      loop.start();
    },
    stop() {
      loop.stop();
    },
  };
}
