// 実行環境判定のヘルパー

export type RuntimeEnvironment = "browser" | "electron-renderer" | "unknown";

/**
 * ブラウザ相当の環境で動いているか判定する
 */
export function isBrowser(): boolean {
  return typeof window !== "undefined" && typeof document !== "undefined";
}

/**
 * Electron のレンダラプロセスで動いているか判定する
 * preload が `window.electronAPI` を公開している前提
 */
export function isElectronRenderer(): boolean {
  return (
    isBrowser() &&
    typeof window.electronAPI !== "undefined" &&
    window.electronAPI.isElectron === true
  );
}

/**
 * 現在の実行環境を判別可能な union として返す
 */
export function getRuntimeEnvironment(): RuntimeEnvironment {
  if (isElectronRenderer()) {
    return "electron-renderer";
  }
  if (isBrowser()) {
    return "browser";
  }
  return "unknown";
}
