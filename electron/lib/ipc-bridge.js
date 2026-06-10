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
 * @param {Pick<import("electron").IpcRenderer, "invoke" | "on" | "removeListener">} renderer
 */
function createIpcBridge(renderer) {
  /**
   * invokeChannel(channel) -> (...args) => Promise
   * invokeChannel(channel, mapArgs) -> (...args) => invoke(channel, mapArgs(...args))
   * @param {string} channel
   * @param {(...args: unknown[]) => unknown} [mapArgs] reshape caller args into a single payload
   * @returns {(...args: unknown[]) => Promise<unknown>}
   */
  function invokeChannel(channel, mapArgs) {
    if (mapArgs) {
      return (...args) => renderer.invoke(channel, mapArgs(...args));
    }
    return (...args) => renderer.invoke(channel, ...args);
  }

  /**
   * eventChannel(channel) -> (callback) => unsubscribe
   * The callback receives the first IPC payload argument (the `_event` is
   * stripped), matching the existing hand-written wrappers. The returned
   * unsubscribe removes only this subscription.
   * @param {string} channel
   * @returns {(callback: (payload: unknown) => void) => () => void}
   */
  function eventChannel(channel) {
    return (callback) => {
      const handler = (_event, payload) => callback(payload);
      renderer.on(channel, handler);
      return () => renderer.removeListener(channel, handler);
    };
  }

  return { invokeChannel, eventChannel };
}

const { invokeChannel, eventChannel } = createIpcBridge(ipcRenderer);

module.exports = { createIpcBridge, invokeChannel, eventChannel };
