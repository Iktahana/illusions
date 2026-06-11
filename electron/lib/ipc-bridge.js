/**
 * IPC bridge helpers for the preload script (#1434).
 *
 * Collapses the hand-written `ipcRenderer.invoke` / listener-wrapper
 * boilerplate in electron/preload.js into declarative one-liners while
 * preserving the exact runtime behavior:
 * - invoke channels: forward arguments to `ipcRenderer.invoke(channel, ...)`
 *   (optionally reshaped by `mapArgs`, e.g. `(term, limit) => ({ term, limit })`)
 * - event channels: subscribe via `ipcRenderer.on` and return an unsubscribe
 *   function that removes ONLY this wrapper's handler (never removeAllListeners)
 *
 * Channel names come from electron/lib/ipc-channels.js, which is shared with
 * the main-process handler registration so the contract cannot drift.
 *
 * Security note: this module only changes how preload wrappers are *written*.
 * It does not expose ipcRenderer itself, does not add channels, and all
 * main-process validation in electron/ipc/*.js is unchanged.
 */

const { ipcRenderer } = require("electron");

/**
 * Build the bridge helpers bound to a specific ipcRenderer.
 * The indirection exists so unit tests can inject a fake renderer;
 * production code uses the default-bound exports below.
 * @param {Pick<import("electron").IpcRenderer, "invoke" | "send" | "on" | "removeListener">} renderer
 */
function createIpcBridge(renderer) {
  /**
   * invokeChannel(channel, { arity }) -> (...args) => invoke(channel, ...args.slice(0, arity))
   * invokeChannel(channel, mapArgs)   -> (...args) => invoke(channel, mapArgs(...args))
   *
   * Least authority (Codex review, #1434): the legacy hand-written wrappers
   * had FIXED arity and silently dropped unexpected extra renderer arguments.
   * The declarative form preserves that property — every invoke channel must
   * declare its arity (or a mapArgs reshaper, which fixes the payload shape
   * by construction); extra arguments never cross the IPC boundary.
   *
   * @param {string} channel
   * @param {((...args: unknown[]) => unknown) | { arity: number }} shape
   *   reshaper function, or the exact number of forwarded arguments
   * @returns {(...args: unknown[]) => Promise<unknown>}
   */
  function invokeChannel(channel, shape) {
    if (typeof shape === "function") {
      return (...args) => renderer.invoke(channel, shape(...args));
    }
    const arity = shape?.arity ?? 0;
    return (...args) => renderer.invoke(channel, ...args.slice(0, arity));
  }

  /**
   * sendChannel(channel, { arity }) -> (...args) => send(channel, ...args.slice(0, arity))
   * sendChannel(channel, mapArgs)   -> (...args) => send(channel, mapArgs(...args))
   *
   * Fire-and-forget variant of invokeChannel for ipcRenderer.send ↔ ipcMain.on
   * channels. Same least-authority arity rules apply: extra renderer
   * arguments never cross the IPC boundary.
   * @param {string} channel
   * @param {((...args: unknown[]) => unknown) | { arity: number }} shape
   * @returns {(...args: unknown[]) => void}
   */
  function sendChannel(channel, shape) {
    if (typeof shape === "function") {
      return (...args) => renderer.send(channel, shape(...args));
    }
    const arity = shape?.arity ?? 0;
    return (...args) => renderer.send(channel, ...args.slice(0, arity));
  }

  /**
   * eventChannel(channel[, { arity }]) -> (callback) => unsubscribe
   * The callback receives the first `arity` IPC payload arguments (the
   * `_event` is always stripped), matching the existing hand-written
   * wrappers:
   * - arity 0: `() => callback()` (signal-only menu/lifecycle events)
   * - arity 1 (default): `(_event, payload) => callback(payload)`
   * - arity 2: `(_event, a, b) => callback(a, b)` (e.g. menu-format)
   * The returned unsubscribe removes only this subscription.
   * @param {string} channel
   * @param {{ arity: number }} [shape]
   * @returns {(callback: (...payload: unknown[]) => void) => () => void}
   */
  function eventChannel(channel, shape) {
    const arity = shape?.arity ?? 1;
    return (callback) => {
      const handler = (_event, ...payload) => {
        // Exactly `arity` args, padded with undefined — identical to the
        // legacy `(_event, a, b) => callback(a, b)` destructuring wrappers.
        payload.length = arity;
        callback(...payload);
      };
      renderer.on(channel, handler);
      return () => renderer.removeListener(channel, handler);
    };
  }

  return { invokeChannel, sendChannel, eventChannel };
}

const { invokeChannel, sendChannel, eventChannel } = createIpcBridge(ipcRenderer);

module.exports = { createIpcBridge, invokeChannel, sendChannel, eventChannel };
