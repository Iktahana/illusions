// Usage analytics (Aptabase) IPC handlers
// renderer はイベント名 + ホワイトリスト化した引数のみを渡し、送信可否（同意フラグ）の
// 判断と実際の送信は必ず main process 側で行う。

const { ipcMain } = require("electron");
const { ANALYTICS_CHANNELS } = require("../lib/ipc-channels");
const { isWhitelistedProps, sendUsageEvent } = require("../analytics");

/**
 * @typedef {Object} AnalyticsHandlerDependencies
 * @property {() => { loadAppState: () => Promise<Record<string, unknown>> }} [getStorageManager]
 * @property {(eventName: string, props?: Record<string, string | number>) => Promise<void>} [trackEvent]
 * @property {() => boolean} [hasAppKey]
 */

/**
 * @param {AnalyticsHandlerDependencies} [dependencies]
 */
function createAnalyticsTrackEventHandler(
  {
    getStorageManager = () => require("./storage-ipc").getStorageManager(),
    trackEvent = (eventName, props) =>
      require("@aptabase/electron/main").trackEvent(eventName, props),
    hasAppKey = () => Boolean(false),
  } = /** @type {AnalyticsHandlerDependencies} */ ({}),
) {
  return async (_event, eventName, props) => {
    if (typeof eventName !== "string" || !eventName) return;
    await sendUsageEvent(eventName, props, { getStorageManager, trackEvent, hasAppKey });
  };
}

function registerAnalyticsHandlers(options) {
  ipcMain.handle(ANALYTICS_CHANNELS.invoke.trackEvent, createAnalyticsTrackEventHandler(options));
}

module.exports = {
  registerAnalyticsHandlers,
  createAnalyticsTrackEventHandler,
  isWhitelistedProps,
};
