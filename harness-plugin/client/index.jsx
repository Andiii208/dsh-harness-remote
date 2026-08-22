// dsh-harness-remote 设置页「手机远程」
// 宿主插件（harness-plugin）通过 loopback RPC 提供状态；本组件只做展示与启停。
//
// 设计：沿用 DSH 官方设计系统 CSS 变量（--dsw-alias-*），
// 公网模式（cloudflared quick tunnel）为主路径，局域网直连为次级。

import { createElement as h, useEffect, useState } from 'react';

import { REMOTE_RPC_CHANNEL, REMOTE_RPC_ENDPOINTS } from './api.js';

const name = 'dsh-harness-remote';
const inject = ['slots', 'connection', 'locale'];

const styles = {
  card: {
    background: 'var(--dsw-alias-bg-layer-1,#fff)',
    border: '1px solid var(--dsw-alias-border-l2,#e5e7eb)',
    borderRadius: 12,
    padding: '16px 20px',
    maxWidth: 480,
  },
  block: {
    borderTop: '1px solid var(--dsw-alias-border-l2,#e5e7eb)',
    marginTop: 16,
    paddingTop: 16,
  },
  muted: {
    color: 'var(--dsw-alias-label-tertiary,#8b93a1)',
    fontSize: 12,
    lineHeight: 1.5,
  },
  code: {
    fontFamily: 'ui-monospace,Menlo,monospace',
    fontSize: 12,
    wordBreak: 'break-all',
    margin: '6px 0 10px',
    color: 'var(--dsw-alias-label-primary,inherit)',
  },
  primary: {
    font: 'inherit',
    cursor: 'pointer',
    border: 'none',
    background: 'var(--dsw-alias-button-primary-fill, var(--dsw-alias-brand-primary,#4f6ef7))',
    color: '#fff',
    height: 38,
    padding: '0 18px',
    borderRadius: 999,
    fontSize: 13,
    fontWeight: 500,
    width: '100%',
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 8,
  },
  btn: {
    font: 'inherit',
    cursor: 'pointer',
    border: '1px solid var(--dsw-alias-button-ghost-active-border, var(--dsw-alias-border-l2,#d1d5db))',
    background: 'var(--dsw-alias-bg-layer-1,#fff)',
    color: 'var(--dsw-alias-label-primary,inherit)',
    height: 38,
    padding: '0 18px',
    borderRadius: 999,
    fontSize: 13,
    width: '100%',
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
  },
  qrWrap: {
    background: '#fff',
    padding: 14,
    borderRadius: 16,
    display: 'inline-block',
    margin: '10px 0 12px',
    boxShadow: '0 4px 18px rgba(0,0,0,0.10)',
  },
  qr: {
    width: 216,
    height: 216,
    display: 'block',
  },
  codeRow: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
    background: 'var(--dsw-alias-bg-layer-2,#f5f6f8)',
    borderRadius: 10,
    padding: '9px 12px',
    marginBottom: 8,
  },
  codeText: {
    fontFamily: 'ui-monospace,Menlo,monospace',
    fontSize: 13,
    wordBreak: 'break-all',
    color: 'var(--dsw-alias-label-primary,inherit)',
    flex: 1,
  },
  copyBtn: {
    font: 'inherit',
    cursor: 'pointer',
    border: '1px solid var(--dsw-alias-border-l2,#d1d5db)',
    background: 'transparent',
    color: 'var(--dsw-alias-label-secondary,#6b7280)',
    height: 26,
    padding: '0 10px',
    borderRadius: 999,
    fontSize: 11,
    flexShrink: 0,
  },
  warn: {
    color: 'var(--dsw-alias-state-warn-primary,#b45309)',
    fontSize: 12,
    lineHeight: 1.5,
  },
  error: {
    color: 'var(--dsw-alias-state-error-primary,#dc2626)',
    fontSize: 12,
    lineHeight: 1.5,
  },
  success: {
    color: 'var(--dsw-alias-state-success-primary,#16a34a)',
    fontSize: 12,
    lineHeight: 1.5,
  },
};

function RemoteSettingsTab({ rpcCall }) {
  const [status, setStatus] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  const call = async (endpoint, payload) => {
    const res = await rpcCall(endpoint, payload);
    if (!res?.ok) throw new Error(res?.error?.message ?? 'RPC failed');
    return res.value;
  };

  const load = async () => {
    try {
      const s = await call(REMOTE_RPC_ENDPOINTS.status, {});
      setStatus(s);
      setError(null);
    } catch {
      // 首次未开启时 status 也可能失败，忽略瞬时错误
    }
  };

  useEffect(() => {
    load();
    const t = setInterval(load, 3000);
    return () => clearInterval(t);
  }, []);

  const start = async (mode) => {
    setBusy(true);
    setError(null);
    try {
      // 把 DSH Web 的 origin 传给插件，解决 DSH_WEB_URL 环境变量未设置时探测失败的问题
      const dshBaseUrl = window.location.origin;
      const s = await call(REMOTE_RPC_ENDPOINTS.start, { mode, dshBaseUrl });
      setStatus(s);
    } catch (err) {
      setError(err?.message ?? '开启失败');
    } finally {
      setBusy(false);
    }
  };

  const stop = async () => {
    setBusy(true);
    setError(null);
    try {
      const s = await call(REMOTE_RPC_ENDPOINTS.stop, {});
      setStatus(s);
    } catch (err) {
      setError(err?.message ?? '停止失败');
    } finally {
      setBusy(false);
    }
  };

  const running = status?.running === true;
  const starting = status?.starting === true;

  const copyText = async (text) => {
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      /* 剪贴板不可用时静默（设置页 iframe 可能限制） */
    }
  };

  const codeRow = (label, value, mono = true) =>
    h('div', { style: styles.codeRow },
      h('div', { style: { ...styles.codeText, fontFamily: mono ? undefined : 'inherit' } }, `${label}${value ? '' : '：——'}`),
      value
        ? h('button', { style: styles.copyBtn, onClick: () => void copyText(value) }, '复制')
        : null,
    );

  return h(
    'div',
    { style: styles.card },
    h('div', { style: { fontSize: 14, fontWeight: 600, color: 'var(--dsw-alias-label-primary,inherit)' } }, '手机远程'),
    h('div', { style: styles.muted }, '手机上安装 dsh-harness-remote App，扫下面的码就能远程查看会话、发消息、审批。'),

    running
      ? h(
          'div',
          null,
          h('div', { style: styles.block },
            h('div', { style: { fontSize: 13, fontWeight: 500, color: 'var(--dsw-alias-label-primary,inherit)' } },
              status.mode === 'lan' ? '局域网模式' : '公网模式（任何网络可连）'),
            status.qrDataUrl
              ? h('div', { style: styles.qrWrap },
                  h('img', { src: status.qrDataUrl, alt: '手机连接二维码', style: styles.qr }))
              : null,
            h('div', { style: { fontSize: 12, color: 'var(--dsw-alias-label-secondary,#6b7280)', marginBottom: 8 } },
              '手机 App 扫码连接，或在「远程连接」里手动输入：'),
            codeRow('地址', status.host ?? ''),
            codeRow('6 位码', status.code ?? ''),
          ),
          h('div', { style: styles.block },
            status.dshDetected
              ? h('div', { style: styles.success }, `DSH 已桥接：${status.dshUrl}`)
              : h('div', { style: styles.warn }, '未检测到 DSH API——手机能连上但看不到会话（请确认 dsh web 正在运行）'),
            status.pairedDeviceId
              ? h('div', { style: styles.success }, `已配对设备：${status.pairedDeviceId}`)
              : h('div', { style: styles.muted }, '等待手机扫码配对…'),
          ),
          h('div', { style: styles.block },
            h('button', { style: styles.btn, onClick: stop, disabled: busy }, busy ? '停止中…' : '停止远程'),
          ),
        )
      : h(
          'div',
          null,
          h('div', { style: styles.block },
            h('button', { style: styles.primary, onClick: () => start('tunnel'), disabled: busy || starting },
              starting ? '开启中…' : '开启公网访问'),
            h('button', { style: styles.btn, onClick: () => start('lan'), disabled: busy || starting },
              '仅局域网'),
            h('div', { style: { ...styles.muted, marginTop: 8 } },
              '公网模式通过 cloudflared 免费隧道工作：无需账号、无需服务器、无需公网 IP，任何网络扫码即连；地址每次重启自动换新。'),
            h('div', { style: { ...styles.muted, marginTop: 6 } },
              '首次开启需下载 cloudflared（约 20–50MB），之后秒开；若长时间卡住，请检查代理/VPN（Clash TUN 等）后重试。'),
          ),
        ),

    error ? h('div', { style: { ...styles.error, marginTop: 8 } }, `❌ ${error}`) : null,

    h('div', { style: { ...styles.block, textAlign: 'center' } },
      h('a', { href: 'https://github.com/Andiii208/dsh-harness-remote/releases', target: '_blank', rel: 'noreferrer', style: { fontSize: 12, color: 'var(--dsw-alias-label-secondary,#6b7280)', textDecoration: 'none' } },
        '📱 下载手机 App（GitHub Releases）'),
    ),
  );
}

export function apply(ctx) {
  const rpcCall = (endpoint, payload, signal) =>
    ctx.connection.rpc.call(REMOTE_RPC_CHANNEL, endpoint, payload, signal);

  // 设置一级入口（与 通用设置/模型/插件 同级，order 1 = 通用之后、最外层）
  ctx.slots.inject('settings.section', () =>
    ctx.slots.register(
      {
        name: 'settings.section',
        id: 'dsh-harness-remote',
        order: 1,
        label: () => '手机远程',
        inject: () => ({ rpcCall }),
      },
      RemoteSettingsTab,
    ),
  );
}

export { name, inject };
