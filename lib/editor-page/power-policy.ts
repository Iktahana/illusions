/**
 * Power optimization policy (#1448, unit 2 of 4).
 *
 * Pure decision functions mapping window-activity signals and user
 * settings to "what should be paused / throttled". This module has NO
 * side effects: it never touches watchers, timers, or the editor.
 * Consumers read a decision and act on it themselves, so the policy
 * (why) and the mechanism (how) stay independently testable — the
 * lesson from the rolled-back PR #1427 / regression #1445, where both
 * lived in one tangled module chain.
 *
 * 電源最適化ポリシー（純粋関数のみ・副作用なし）。
 * window activity 信号と設定から「何を停止/抑制すべきか」の判断だけを返す。
 *
 * Wiring status:
 * - `shouldPauseFileWatchers` — wired in #1594
 *   (lib/tab-manager/use-file-watch-integration.ts).
 * - `getAutoSaveIntervalMs` — wired in #1466
 *   (lib/tab-manager/use-auto-save.ts).
 * - `shouldEnablePosHighlight` — wired in #1466
 *   (lib/editor-page/use-pos-highlight-activation.ts).
 */

import { AUTO_SAVE_INTERVAL } from "../tab-manager/types";
import type { WindowActivityState } from "./window-activity";

// ---------------------------------------------------------------------------
// Types & constants
// ---------------------------------------------------------------------------

/** Settings that influence power-policy decisions. */
export interface PowerPolicySettings {
  /**
   * Power-save mode (user setting, or auto-enabled on battery via
   * use-power-saving.ts).
   * 省電力モード（ユーザー設定、またはバッテリー駆動時の自動 ON）。
   */
  powerSaveMode: boolean;
}

/**
 * Auto-save interval while the window is in the background and power-aware
 * throttling (power-save mode) is enabled. Foreground uses AUTO_SAVE_INTERVAL.
 *
 * バックグラウンド時（省電力モード有効）の自動保存間隔。
 */
export const BACKGROUND_AUTO_SAVE_INTERVAL_MS = 20_000;

// ---------------------------------------------------------------------------
// Decisions
// ---------------------------------------------------------------------------

/** True when the window is effectively in the background. */
function isBackground(activity: WindowActivityState): boolean {
  return !activity.isWindowFocused || !activity.isDocumentVisible;
}

/**
 * Whether file watchers should be paused to save CPU.
 *
 * Pausing is safe because the FileWatcher implementations perform an
 * mtime / content-hash catch-up comparison on resume and only fire the
 * external-change flow when the disk content genuinely changed
 * (see lib/services/file-watcher.ts). A focus round-trip with no disk
 * change therefore never triggers a reload (#1445 guard).
 *
 * バックグラウンド時に file watcher を停止すべきかどうか。
 * 再開時は watcher 側の mtime / content-hash 照合により、実際に変化が
 * あった場合のみ外部変更フローが走る（#1445 ガード）。
 */
/**
 * Known tradeoff (#1448 Codex review): file watchers live in the MAIN window
 * renderer; the split-editor popout is a separate BrowserWindow that only
 * syncs buffer text over IPC and owns no watchers. Blurring the main window
 * while working in a popout therefore DEFERS external-change detection until
 * the main window regains focus — changes are not lost (the resume catch-up
 * and conflict flow pick them up), only detected later. Wiring popout focus
 * into this policy is part of the #1466 follow-up.
 */
export function shouldPauseFileWatchers(activity: WindowActivityState): boolean {
  return isBackground(activity);
}

/**
 * Auto-save interval decision: throttle to 20s only when the window is in
 * the background AND power-save mode is enabled; otherwise the normal 5s.
 *
 * 自動保存間隔の判断。省電力モード有効かつバックグラウンド時のみ 20 秒に
 * 間引き、それ以外は通常の 5 秒。
 */
export function getAutoSaveIntervalMs(
  activity: WindowActivityState,
  settings: PowerPolicySettings,
): number {
  if (settings.powerSaveMode && isBackground(activity)) {
    return BACKGROUND_AUTO_SAVE_INTERVAL_MS;
  }
  return AUTO_SAVE_INTERVAL;
}

/**
 * Whether part-of-speech highlighting should run.
 *
 * Focus-dependent (#1466, restoring the PR #1427 CPU-saving requirement):
 * the expensive morphological highlighting is suspended while the window
 * is backgrounded or power-save mode is on, and resumes when the user
 * setting allows it. This is safe with respect to #1445 because the sole
 * consumer (use-pos-highlight-activation.ts) subscribes to the
 * framework-free window-activity service — no React re-render on focus
 * switches — and applies the decision via `updatePosHighlightSettings`,
 * which dispatches a meta-only transaction: decorations toggle, the
 * document, selection, and scroll are never touched.
 *
 * The user setting itself is never mutated; this returns an EFFECTIVE
 * value, so regaining focus restores exactly the user's choice.
 *
 * 品詞ハイライトを有効にすべきかどうか（#1466）。バックグラウンド中
 * または省電力モード中は重い形態素ハイライトを一時停止し、フォーカス
 * 復帰時にユーザー設定どおりの状態へ戻す。判断の適用は meta 専用
 * transaction による装飾の付け外しのみで、本文・選択・スクロールには
 * 一切触れない（#1445 ガード）。ユーザー設定自体は変更しない。
 */
export function shouldEnablePosHighlight(
  activity: WindowActivityState,
  settings: PowerPolicySettings & { posHighlightEnabled: boolean },
): boolean {
  return settings.posHighlightEnabled && !settings.powerSaveMode && !isBackground(activity);
}
