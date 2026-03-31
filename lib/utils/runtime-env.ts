// 実行環境判定のヘルパー

export type RuntimeEnvironment = "browser" | "electron-renderer" | "unknown";

export type OSPlatform = "mac" | "windows" | "linux";

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

/**
 * OS プラットフォームを判定する (userAgentData 優先、UA フォールバック)
 */
export function detectOSPlatform(): OSPlatform | null {
  if (typeof navigator === "undefined") return null;
  const nav = navigator as Navigator & {
    userAgentData?: { platform?: string };
  };
  if (nav.userAgentData?.platform) {
    const p = nav.userAgentData.platform.toLowerCase();
    if (p === "macos") return "mac";
    if (p === "windows") return "windows";
    if (p === "linux") return "linux";
  }
  // Prefer navigator.platform for reliable OS detection
  const platform = (navigator.platform || "").toLowerCase();
  if (platform.startsWith("mac")) return "mac";
  if (platform.startsWith("win")) return "windows";
  if (platform.includes("linux")) return "linux";

  // Fallback: parse userAgent, excluding iOS devices from macOS detection
  const ua = navigator.userAgent.toLowerCase();
  const isIOS = /iphone|ipad|ipod/.test(ua);
  if (!isIOS && ua.includes("macintosh")) return "mac";
  if (ua.includes("windows")) return "windows";
  if (ua.includes("linux")) return "linux";
  return null;
}

/**
 * macOS で動作しているか判定する
 */
export function isMacOS(): boolean {
  return detectOSPlatform() === "mac";
}
