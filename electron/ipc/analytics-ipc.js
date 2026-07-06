// Usage analytics (Aptabase) IPC handlers
// renderer はイベント名 + ホワイトリスト化した引数のみを渡し、送信可否（同意フラグ）の
// 判断と実際の送信は必ず main process 側で行う。

const { ipcMain } = require("electron");
const { ANALYTICS_CHANNELS } = require("../lib/ipc-channels");
const usageEventContract = require("../../lib/analytics/usage-event-contract.json");

function isWhitelistedProps(eventName, props) {
  const eventContract = usageEventContract.events[eventName];
  if (!eventContract) return false;
  if (props === undefined) return true;
  if (typeof props !== "object" || props === null) return false;
  return Object.entries(props).every(([key, value]) => {
    const allowedValues = eventContract[key];
    if (!Array.isArray(allowedValues)) return false;
    if (typeof value === "number")
      return Number.isFinite(value) && allowedValues.includes("__number");
    if (typeof value !== "string") return false;
    return allowedValues.includes(value);
  });
}

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
    if (!isWhitelistedProps(eventName, props)) return;
    if (!hasAppKey()) return;

    try {
      const appState = await getStorageManager().loadAppState();
      if (appState?.usageAnalyticsConsent === false) return;

      await trackEvent(eventName, props);
    } catch (error) {
      console.warn("[Analytics IPC] trackEvent failed:", error);
    }
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
