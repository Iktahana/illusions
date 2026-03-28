/**
 * Web-based cross-window sync for popout editors using BroadcastChannel.
 *
 * This is the web equivalent of Electron's IPC-based buffer sync
 * (`editor:buffer-sync-broadcast`, `editor:buffer-close-broadcast`).
 *
 * Protocol:
 *  1. Parent opens popout via `window.open()` and calls `respondWithContentOnReady()`.
 *  2. Popout mounts, creates a channel, and posts `{ type: "popout-ready" }`.
 *  3. Parent responds with `{ type: "buffer-content", content }`.
 *  4. Ongoing edits are exchanged via `{ type: "buffer-change" }`.
 *  5. On close, the popout posts `{ type: "buffer-close" }`.
 */

export const WEB_POPOUT_CHANNEL_NAME = "illusions:popout-sync";

export type WebPopoutMessage =
  | { type: "popout-ready"; bufferId: string }
  | { type: "buffer-content"; bufferId: string; content: string }
  | { type: "buffer-change"; bufferId: string; content: string }
  | { type: "buffer-close"; bufferId: string };

/**
 * Check if BroadcastChannel is available in this environment.
 */
export function isBroadcastChannelAvailable(): boolean {
  return typeof BroadcastChannel !== "undefined";
}

/**
 * After opening a web popout via `window.open()`, call this so the parent
 * responds with initial content when the popout signals readiness.
 *
 * Also sends a proactive push after a short delay for cases where the
 * popout mounts before this listener is set up.
 *
 * @returns cleanup function to remove the listener and close the channel.
 */
export function respondWithContentOnReady(
  bufferId: string,
  content: string,
): () => void {
  if (!isBroadcastChannelAvailable()) return () => {};

  const channel = new BroadcastChannel(WEB_POPOUT_CHANNEL_NAME);
  let closed = false;

  const handleMessage = (event: MessageEvent<WebPopoutMessage>): void => {
    if (
      event.data.type === "popout-ready" &&
      event.data.bufferId === bufferId
    ) {
      channel.postMessage({
        type: "buffer-content",
        bufferId,
        content,
      } satisfies WebPopoutMessage);
    }
  };

  channel.addEventListener("message", handleMessage);

  // Proactive push: the popout may have mounted before this listener was set up
  const proactiveTimer = setTimeout(() => {
    if (!closed) {
      channel.postMessage({
        type: "buffer-content",
        bufferId,
        content,
      } satisfies WebPopoutMessage);
    }
  }, 300);

  // Auto-cleanup after 30 seconds (popout should have loaded by then)
  const autoCleanupTimer = setTimeout(() => cleanup(), 30_000);

  function cleanup(): void {
    if (closed) return;
    closed = true;
    clearTimeout(proactiveTimer);
    clearTimeout(autoCleanupTimer);
    channel.removeEventListener("message", handleMessage);
    channel.close();
  }

  return cleanup;
}
