// Shared main-process analytics boundary. All callers, including the updater,
// pass only contract-approved finite values; consent is checked for every send.
const usageEventContract = require("../src/lib/analytics/usage-event-contract.json");

function isWhitelistedProps(eventName, props) {
  const eventContract = usageEventContract.events[eventName];
  if (!eventContract) return false;
  const requiredKeys = Object.keys(eventContract);
  if (props === undefined) return requiredKeys.length === 0;
  if (typeof props !== "object" || props === null || Array.isArray(props)) return false;
  if (Object.keys(props).length !== requiredKeys.length) return false;
  return Object.entries(props).every(([key, value]) => {
    const allowedValues = eventContract[key];
    if (!Array.isArray(allowedValues)) return false;
    if (typeof value === "number")
      return Number.isFinite(value) && allowedValues.includes("__number");
    return typeof value === "string" && allowedValues.includes(value);
  });
}

function classifyMainTelemetryFailure(error) {
  const code = typeof error?.code === "string" ? error.code.toUpperCase() : "";
  const status = typeof error?.status === "number" ? error.status : undefined;
  if (code === "ENOENT" || status === 404) return "not_found";
  if (["EACCES", "EPERM"].includes(code) || status === 401 || status === 403)
    return "permission_denied";
  if (code === "ETIMEDOUT" || error?.name === "TimeoutError") return "timeout";
  if (["ENETUNREACH", "ECONNREFUSED", "ECONNRESET"].includes(code) || status >= 502)
    return "network";
  if (code === "EEXIST" || status === 409) return "conflict";
  if (code === "EIO") return "io_error";
  if (code === "EINVAL" || status === 400 || status === 422) return "invalid_input";
  return "unknown";
}

async function sendUsageEvent(eventName, props, dependencies = {}) {
  if (!isWhitelistedProps(eventName, props)) return false;
  const hasAppKey = dependencies.hasAppKey ?? (() => Boolean(process.env.APTABASE_APP_KEY));
  if (!hasAppKey()) return false;
  try {
    const getStorageManager =
      dependencies.getStorageManager ?? (() => require("./ipc/storage-ipc").getStorageManager());
    const appState = await getStorageManager().loadAppState();
    if (appState?.usageAnalyticsConsent === false) return false;
    const trackEvent = dependencies.trackEvent ?? require("@aptabase/electron/main").trackEvent;
    await trackEvent(eventName, props);
    return true;
  } catch (error) {
    console.warn("[Analytics] trackEvent failed:", error);
    return false;
  }
}

module.exports = { classifyMainTelemetryFailure, isWhitelistedProps, sendUsageEvent };
