/**
 * connectionErrors — 连接错误分类（纯函数）。
 * 把底层 Error / 协议错误码翻译成用户能看懂的中文标题与建议。
 */

export type ConnectionErrorKind =
  | "auth"
  | "pair"
  | "rate"
  | "timeout"
  | "refused"
  | "dns"
  | "tls"
  | "protocol"
  | "tunnel"
  | "unknown";

export interface ConnectionErrorInfo {
  kind: ConnectionErrorKind;
  title: string;
  hint: string;
}

function messageOf(err: unknown): string {
  if (err instanceof Error) return err.message;
  if (typeof err === "string") return err;
  try {
    return JSON.stringify(err);
  } catch {
    return String(err);
  }
}

function codeOf(err: unknown): string {
  if (err && typeof err === "object" && "code" in err) {
    const c = (err as { code?: unknown }).code;
    if (typeof c === "string") return c;
  }
  return "";
}

const RULES: Array<{ kind: ConnectionErrorKind; pattern: RegExp }> = [
  { kind: "auth", pattern: /unauthorized|E_AUTH|E_FORBIDDEN|401|forbidden|鉴权|安全码|token/i },
  { kind: "pair", pattern: /E_PAIR|配对|pair.?code|pairing/i },
  { kind: "rate", pattern: /E_RATE|rate.?limit|太频繁|锁定/i },
  { kind: "timeout", pattern: /timeout|timed out|超时|ETIMEDOUT|ESOCKETTIMEDOUT/i },
  { kind: "refused", pattern: /ECONNREFUSED|connection refused|refused|E_CONN_REFUSED|拒绝连接/i },
  { kind: "dns", pattern: /ENOTFOUND|EAI_AGAIN|getaddrinfo|DNS|域名|找不到主机/i },
  { kind: "tls", pattern: /certificate|TLS|SSL|wss|证书/i },
  { kind: "protocol", pattern: /compatible|protocol|协议|版本不/i },
  { kind: "tunnel", pattern: /trycloudflare|502|503|tunnel|隧道/i },
];

const INFO: Record<ConnectionErrorKind, Omit<ConnectionErrorInfo, "kind">> = {
  auth: {
    title: "安全码 / 凭证不对",
    hint: "电脑端可能重新生成了安全码。请回电脑端确认，或重新扫码。",
  },
  pair: {
    title: "配对码不对或已过期",
    hint: "6 位码是一次性的，也可能会过期。请回电脑端设置页重新获取，再试一次。",
  },
  rate: {
    title: "尝试太频繁，已暂时锁定",
    hint: "等 1 分钟再试，或回电脑端重新开启远程访问。",
  },
  timeout: {
    title: "连接超时",
    hint: "请确认电脑端已开启远程、地址填写正确；若走公网，检查代理/VPN 是否拦截。",
  },
  refused: {
    title: "电脑端拒绝了连接",
    hint: "请确认电脑端「手机远程」已开启，且地址/端口正确。",
  },
  dns: {
    title: "找不到这个地址",
    hint: "地址可能打错了；公网地址一般以 trycloudflare.com 结尾，请核对后重试。",
  },
  tls: {
    title: "安全连接（TLS）失败",
    hint: "请确认使用的是 wss:// 地址；若为自建中继，请检查证书配置。",
  },
  protocol: {
    title: "协议版本不兼容",
    hint: "手机 App 与电脑端插件版本不匹配，请升级到最新版后重试。",
  },
  tunnel: {
    title: "公网隧道已失效",
    hint: "电脑端可能已重启，公网地址会轮换。请回电脑端重新扫码。",
  },
  unknown: {
    title: "连接失败",
    hint: "请确认电脑端已开启远程、网络可达后重试。",
  },
};

/** 分类连接错误。匹配顺序为规则表顺序（更具体的放前面）。 */
export function classifyConnectionError(err: unknown): ConnectionErrorInfo {
  const code = codeOf(err);
  const msg = `${code} ${messageOf(err)}`;
  for (const rule of RULES) {
    if (rule.pattern.test(msg)) {
      return { kind: rule.kind, ...INFO[rule.kind] };
    }
  }
  return { kind: "unknown", ...INFO.unknown };
}
