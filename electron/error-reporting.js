const {
  sanitizeErrorText,
  scrubRendererErrorPayload,
  scrubSentryEvent,
} = require("../src/lib/error-reporting/scrub-error-event");
const { deriveReleaseEnvironment } = require("../src/lib/error-reporting/release-environment");

let sentryMain = null;
let captureException = null;
let dsnConfigured = false;
let getStorageManagerRef = () => null;

function sanitizeError(error) {
  const normalized = error instanceof Error ? error : new Error(String(error));
  const sanitized = new Error(sanitizeErrorText(normalized.message));
  sanitized.name = normalized.name;
  sanitized.stack = normalized.stack ? sanitizeErrorText(normalized.stack) : normalized.stack;
  return sanitized;
}

function initializeErrorReporting({ dsn, getStorageManager, getRelease, sentryMainModule }) {
  if (!dsn) return false;

  sentryMain = sentryMainModule || require("@sentry/electron/main");
  captureException = sentryMain.captureException;
  getStorageManagerRef = getStorageManager;

  const release = getRelease();
  sentryMain.init({
    dsn,
    release,
    environment: deriveReleaseEnvironment(release),
    defaultIntegrations: false,
    sendDefaultPii: false,
    tracesSampleRate: 0,
    maxBreadcrumbs: 0,
    beforeSend(event) {
      return scrubSentryEvent(event);
    },
  });

  dsnConfigured = true;
  return true;
}

async function hasConsent() {
  try {
    const appState = await getStorageManagerRef()?.loadAppState?.();
    return appState?.errorReportingConsent !== false;
  } catch (error) {
    console.warn("[Error Reporting] consent check failed:", error);
    return false;
  }
}

function isErrorReportingEnabled() {
  return dsnConfigured;
}

async function captureMainError(error, context = {}) {
  if (!dsnConfigured || !(await hasConsent()) || typeof captureException !== "function") return;

  try {
    sentryMain.withScope((scope) => {
      scope.setTag("process", "main");
      if (typeof context.source === "string") {
        scope.setTag("source", context.source);
      }
      captureException(sanitizeError(error));
    });
  } catch (captureError) {
    console.warn("[Error Reporting] captureMainError failed:", captureError);
  }
}

async function captureRendererError(payload) {
  if (!dsnConfigured || !(await hasConsent()) || typeof captureException !== "function") return;

  try {
    const scrubbed = scrubRendererErrorPayload(payload);
    const error = new Error(scrubbed.message || "Renderer error");
    if (scrubbed.name) error.name = scrubbed.name;
    if (scrubbed.stack) error.stack = scrubbed.stack;

    sentryMain.withScope((scope) => {
      scope.setTag("process", "renderer");
      scope.setTag("source", scrubbed.source);
      if (scrubbed.sectionName) {
        scope.setTag("section", scrubbed.sectionName);
      }
      captureException(error);
    });
  } catch (captureError) {
    console.warn("[Error Reporting] captureRendererError failed:", captureError);
  }
}

module.exports = {
  initializeErrorReporting,
  captureMainError,
  captureRendererError,
  isErrorReportingEnabled,
};
