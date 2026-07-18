"use strict";

/**
 * Returns null outside macOS without resolving the native package. This keeps
 * Windows and Linux builds free of a macOS-only binary and its dependencies.
 */
function startMacOSAuthSession(
  authorizationUrl,
  callbackScheme,
  requestId,
  {
    platform = process.platform,
    loadBinding = () => require("@illusions/as-web-authentication"),
  } = {},
) {
  if (platform !== "darwin") return null;
  return loadBinding().start(authorizationUrl, callbackScheme, requestId);
}

function cancelMacOSAuthSession(
  requestId,
  {
    platform = process.platform,
    loadBinding = () => require("@illusions/as-web-authentication"),
  } = {},
) {
  if (platform !== "darwin") return;
  loadBinding().cancel(requestId);
}

function cancelAllMacOSAuthSessionsForShutdown({
  platform = process.platform,
  loadBinding = () => require("@illusions/as-web-authentication"),
} = {}) {
  if (platform !== "darwin") return;
  loadBinding().cancelAllForShutdown();
}

module.exports = {
  startMacOSAuthSession,
  cancelMacOSAuthSession,
  cancelAllMacOSAuthSessionsForShutdown,
};
