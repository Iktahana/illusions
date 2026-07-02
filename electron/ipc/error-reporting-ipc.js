const { ipcMain } = require("electron");
const { ERROR_REPORTING_CHANNELS } = require("../lib/ipc-channels");

const VALID_SOURCES = new Set(["error-boundary", "window-error", "unhandledrejection"]);

function isValidPayload(payload) {
  return (
    typeof payload === "object" &&
    payload !== null &&
    VALID_SOURCES.has(payload.source) &&
    (payload.message === undefined || typeof payload.message === "string") &&
    (payload.name === undefined || typeof payload.name === "string") &&
    (payload.stack === undefined || typeof payload.stack === "string") &&
    (payload.sectionName === undefined || typeof payload.sectionName === "string")
  );
}

function createCaptureRendererErrorHandler({ captureRendererError }) {
  return async (_event, payload) => {
    if (!isValidPayload(payload)) return;
    try {
      await captureRendererError(payload);
    } catch (error) {
      console.warn("[Error Reporting IPC] captureRendererError failed:", error);
    }
  };
}

function registerErrorReportingHandlers(options) {
  ipcMain.handle(
    ERROR_REPORTING_CHANNELS.invoke.captureRendererError,
    createCaptureRendererErrorHandler(options),
  );
}

module.exports = {
  createCaptureRendererErrorHandler,
  registerErrorReportingHandlers,
  isValidPayload,
};
