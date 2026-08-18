// dsh-harness-remote 设置页 RPC 契约（client 与 host 共享）。
// 与 harness-plugin/src/web-rpc.ts 保持一致。
export const REMOTE_RPC_CHANNEL = '/dsh-harness-remote';

export const REMOTE_RPC_ENDPOINTS = Object.freeze({
  status: 'status',
  start: 'start',
  stop: 'stop',
});
