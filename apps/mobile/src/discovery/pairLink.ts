/**
 * pairLink — 配对深链注册（dshremote://pair?host&port&token）。
 * 覆盖两种进入路径：App 已在前台收到 url 事件；App 由深链冷启动。
 */

import * as Linking from "expo-linking";
import { parsePairPayload, type PairPayload } from "@dsh-remote/protocol";

export type PairDeepLinkHandler = (payload: PairPayload) => void;

export function registerPairDeepLink(handler: PairDeepLinkHandler): () => void {
  const sub = Linking.addEventListener("url", ({ url }) => {
    const p = parsePairPayload(url);
    if (p) handler(p);
  });
  void Linking.getInitialURL().then((url) => {
    if (url) {
      const p = parsePairPayload(url);
      if (p) handler(p);
    }
  });
  return () => sub.remove();
}
