/**
 * Window activity signal source (#1448, unit 1 of 4).
 *
 * Framework-free observer of window focus and document visibility.
 * Exposes a subscribe API instead of React state on purpose: the
 * rolled-back PR #1427 drove these signals through React state
 * (`useWindowActivityState`), which re-rendered the whole page on every
 * focus switch and kicked off the side-effect chain that caused the
 * editing-loss regression #1445. Consumers that need the signals inside
 * effects (e.g. the file-watcher pause wiring) subscribe directly and
 * never touch React state.
 *
 * ウィンドウフォーカス / ドキュメント可視性のフレームワーク非依存な信号源。
 * React state を介さず subscribe 形式で公開する（#1427 の全画面再レンダー
 * 起点の副作用チェーン = #1445 回帰の再発防止）。
 *
 * DOM リスナーは最初の購読時に登録し、最後の購読解除で取り外す
 * （リスナーリーク防止）。SSR 環境では購読は no-op となる。
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Snapshot of the window's activity signals. */
export interface WindowActivityState {
  /** Whether the window currently has OS-level focus. */
  readonly isWindowFocused: boolean;
  /** Whether the document is visible (not minimized / hidden tab). */
  readonly isDocumentVisible: boolean;
}

/** Listener invoked whenever the activity state changes. */
export type WindowActivityListener = (state: WindowActivityState) => void;

// ---------------------------------------------------------------------------
// Internal state
// ---------------------------------------------------------------------------

const listeners = new Set<WindowActivityListener>();
let attached = false;
let state: WindowActivityState = { isWindowFocused: true, isDocumentVisible: true };

/** Read the live DOM state. Falls back to "active" when no DOM exists (SSR). */
function readDomState(): WindowActivityState {
  if (typeof document === "undefined") {
    return { isWindowFocused: true, isDocumentVisible: true };
  }
  return {
    isWindowFocused: typeof document.hasFocus === "function" ? document.hasFocus() : true,
    isDocumentVisible: document.visibilityState !== "hidden",
  };
}

function update(next: WindowActivityState): void {
  if (
    next.isWindowFocused === state.isWindowFocused &&
    next.isDocumentVisible === state.isDocumentVisible
  ) {
    return;
  }
  state = next;
  // Copy before iterating so listeners may unsubscribe during notification.
  for (const listener of [...listeners]) {
    listener(state);
  }
}

function handleFocus(): void {
  update({ ...state, isWindowFocused: true });
}

function handleBlur(): void {
  update({ ...state, isWindowFocused: false });
}

function handleVisibilityChange(): void {
  update({ ...state, isDocumentVisible: document.visibilityState !== "hidden" });
}

function attach(): void {
  state = readDomState();
  window.addEventListener("focus", handleFocus);
  window.addEventListener("blur", handleBlur);
  document.addEventListener("visibilitychange", handleVisibilityChange);
  attached = true;
}

function detach(): void {
  window.removeEventListener("focus", handleFocus);
  window.removeEventListener("blur", handleBlur);
  document.removeEventListener("visibilitychange", handleVisibilityChange);
  attached = false;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Return the current activity state without subscribing.
 * Reads the DOM directly when no subscribers are attached.
 *
 * 購読せずに現在の状態を取得する。購読者がいない間は DOM を直接読む。
 */
export function getWindowActivitySnapshot(): WindowActivityState {
  return attached ? state : readDomState();
}

/**
 * Subscribe to activity changes. Returns an unsubscribe function.
 *
 * - The listener is called only when the state actually changes
 *   (no duplicate notifications for repeated identical events).
 * - DOM listeners are attached lazily on the first subscriber and
 *   removed when the last subscriber unsubscribes (no leaks).
 * - The returned unsubscribe is idempotent.
 * - In SSR (no `window`/`document`) this is a no-op.
 *
 * アクティビティ変化を購読する。解除関数を返す（冪等）。
 * 最初の購読で DOM リスナーを登録し、最後の解除で取り外す。
 */
export function subscribeWindowActivity(listener: WindowActivityListener): () => void {
  if (typeof window === "undefined" || typeof document === "undefined") {
    return () => {};
  }
  if (!attached) {
    attach();
  }
  listeners.add(listener);

  let active = true;
  return () => {
    if (!active) return;
    active = false;
    listeners.delete(listener);
    if (listeners.size === 0 && attached) {
      detach();
    }
  };
}
