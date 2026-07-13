"use strict";

function startSecurityScopedAccess(electronApp, bookmark) {
  if (
    !bookmark ||
    !electronApp ||
    typeof electronApp.startAccessingSecurityScopedResource !== "function"
  ) {
    return undefined;
  }
  try {
    const stopAccessing = electronApp.startAccessingSecurityScopedResource(bookmark);
    return typeof stopAccessing === "function" ? stopAccessing : undefined;
  } catch (error) {
    console.warn("[VFS IPC] Failed to start security-scoped access:", error);
    return undefined;
  }
}

function stopSecurityScopedAccess(rootEntry) {
  const stopAccessing = rootEntry?.stopAccessing;
  if (typeof stopAccessing !== "function") return;
  try {
    stopAccessing();
  } catch (error) {
    console.warn("[VFS IPC] Failed to stop security-scoped access:", error);
  } finally {
    rootEntry.stopAccessing = undefined;
  }
}

module.exports = {
  startSecurityScopedAccess,
  stopSecurityScopedAccess,
};
