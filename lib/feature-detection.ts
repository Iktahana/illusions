/**
 * Browser feature detection for Illusions.
 * Checks for File System Access API support and other capabilities.
 *
 * ブラウザの機能検出。File System Access API 等のサポート状況を確認する。
 */

import { isElectronRenderer } from "./runtime-env";

/**
 * Check if File System Access API's showDirectoryPicker is supported.
 * showDirectoryPicker がサポートされているか確認する。
 */
export function isDirectoryPickerSupported(): boolean {
  return typeof window !== "undefined" && "showDirectoryPicker" in window;
}

/**
 * Check if File System Access API's showOpenFilePicker is supported.
 * showOpenFilePicker がサポートされているか確認する。
 */
export function isFilePickerSupported(): boolean {
  return typeof window !== "undefined" && "showOpenFilePicker" in window;
}

/**
 * Check if the full File System Access API is supported (for project mode).
 * プロジェクトモードに必要な File System Access API が完全にサポートされているか確認する。
 */
export function isFSASupported(): boolean {
  return isDirectoryPickerSupported() && isFilePickerSupported();
}

/**
 * Available feature flags for the current environment.
 * 現在の環境で利用可能な機能フラグ。
 */
export interface AvailableFeatures {
  /** Can create/open projects (requires directory picker) / プロジェクトモードが利用可能 */
  projectMode: boolean;
  /** Can open single files (requires file picker) / スタンドアロンモードが利用可能 */
  standaloneMode: boolean;
  /** Can download files as fallback / ダウンロードフォールバックが利用可能 */
  downloadFallback: boolean;
  /** Running in Electron (full filesystem access) / Electron環境で動作中 */
  isElectron: boolean;
}

/**
 * Detect available features for the current environment.
 * Returns a snapshot of which capabilities are available.
 *
 * 現在の環境で利用可能な機能を検出する。
 *
 * - Electron: All features are available (full filesystem access via IPC)
 * - Chrome/Edge: Project mode and standalone mode via File System Access API
 * - Firefox/Safari: Standalone mode limited, no project mode
 */
export function getAvailableFeatures(): AvailableFeatures {
  if (isElectronRenderer()) {
    return {
      projectMode: true,
      standaloneMode: true,
      downloadFallback: true,
      isElectron: true,
    };
  }

  return {
    projectMode: isDirectoryPickerSupported(),
    standaloneMode: isFilePickerSupported(),
    downloadFallback: typeof window !== "undefined",
    isElectron: false,
  };
}

/**
 * Get a user-friendly message about unsupported features.
 * Returns null if all features are supported.
 *
 * サポートされていない機能についてユーザーに表示するメッセージを返す。
 * すべての機能がサポートされている場合は null を返す。
 */
export function getUnsupportedFeatureMessage(): string | null {
  const features = getAvailableFeatures();

  if (features.isElectron || features.projectMode) {
    return null; // All features supported
  }

  if (features.standaloneMode) {
    return "このブラウザではプロジェクトモードをご利用いただけません。プロジェクトモードをご利用になるには、Chrome、Edge、またはデスクトップアプリをお使いください。";
  }

  return "このブラウザではファイルの直接編集がサポートされていません。Chrome、Edge、またはデスクトップアプリをお使いください。";
}

/**
 * Check if the minimum required features are available for basic operation.
 * 基本操作に必要な最低限の機能が利用可能か確認する。
 */
export function hasMinimumRequiredFeatures(): boolean {
  const features = getAvailableFeatures();
  return features.standaloneMode || features.isElectron;
}
