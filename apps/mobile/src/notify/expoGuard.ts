/**
 * expoGuard — 原生模块安全加载器。
 * Expo Go（SDK 53+）中 expo-notifications 等模块在 import 时即抛错
 * （需 development build），静态 import 会崩 App。这里改为运行时 require
 * + try/catch，加载失败时降级为 no-op，线上不崩。
 */

declare const require: (id: string) => unknown;

/** 运行时安全加载原生模块；失败返回 null（不抛错）。 */
export function loadModule(id: string): unknown {
  try {
    return require(id);
  } catch (err) {
    console.warn(`[native] module "${id}" unavailable — degraded to no-op (Expo Go 限制？)`, err);
    return null;
  }
}
