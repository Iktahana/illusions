"use client";

import contract from "./usage-event-contract.json";

export type UsageEventName =
  | "app_launched"
  | "app_heartbeat"
  | "app_closed"
  | "auth_login_started"
  | "auth_login_completed"
  | "auth_login_failed"
  | "auth_session_restored"
  | "auth_session_restore_failed"
  | "auth_refresh_completed"
  | "auth_refresh_failed"
  | "auth_logout_completed"
  | "auth_logout_failed"
  | "save_attempted"
  | "save_completed"
  | "save_failed"
  | "save_blocked"
  | "save_all_completed"
  | "autosave_attempted"
  | "autosave_failed"
  | "save_conflict_blocked"
  | "project_create_started"
  | "project_create_completed"
  | "project_create_failed"
  | "project_open_started"
  | "project_open_completed"
  | "project_open_failed"
  | "project_recent_open_failed"
  | "project_auto_restore_completed"
  | "project_auto_restore_failed"
  | "file_new_created"
  | "file_open_started"
  | "file_open_completed"
  | "file_open_failed"
  | "project_file_open_completed"
  | "project_file_open_failed"
  | "project_file_created"
  | "project_folder_created"
  | "project_file_renamed"
  | "project_file_deleted"
  | "project_file_duplicated";

export type TelemetryReason =
  | "cancelled"
  | "conflict"
  | "invalid_project"
  | "io_error"
  | "locked"
  | "not_found"
  | "permission_denied"
  | "unknown";

export type TelemetryCountBucket = "0" | "1" | "2_5" | "6_10" | "11_plus";
export type SessionDurationBucket = "lt_1m" | "1_5m" | "5_15m" | "15_60m" | "gte_60m";
export type TelemetryTargetKind = "file" | "untitled" | "handle" | "unknown";

export type UsageEventProps = Record<string, string | number | undefined>;

type UsageEventContract = {
  events: Record<string, Record<string, string[]>>;
};

const usageEventContract = contract as UsageEventContract;

export function isUsageEventName(eventName: string): eventName is UsageEventName {
  return Object.hasOwn(usageEventContract.events, eventName);
}

export function trackUsageEvent(eventName: UsageEventName, props: UsageEventProps = {}): void {
  if (typeof window === "undefined") return;
  const analytics = window.electronAPI?.analytics;
  if (!analytics) return;

  const sanitizedProps: Record<string, string | number> = {};
  for (const [key, value] of Object.entries(props)) {
    if (value !== undefined) sanitizedProps[key] = value;
  }

  try {
    void analytics.trackEvent(eventName, sanitizedProps).catch(() => undefined);
  } catch {
    // Analytics must never affect product behavior.
  }
}

export function bucketTelemetryCount(count: number): TelemetryCountBucket {
  if (count <= 0) return "0";
  if (count === 1) return "1";
  if (count <= 5) return "2_5";
  if (count <= 10) return "6_10";
  return "11_plus";
}

export function bucketSessionDuration(ms: number): SessionDurationBucket {
  const minutes = ms / 60_000;
  if (minutes < 1) return "lt_1m";
  if (minutes < 5) return "1_5m";
  if (minutes < 15) return "5_15m";
  if (minutes < 60) return "15_60m";
  return "gte_60m";
}

export function normalizeTelemetryFileType(
  fileType: string | null | undefined,
): "mdi" | "md" | "txt" | "unknown" {
  const normalized = fileType?.replace(/^\./, "").toLowerCase();
  if (normalized === "mdi" || normalized === "md" || normalized === "txt") return normalized;
  return "unknown";
}

export function classifyTelemetryError(error: unknown): TelemetryReason {
  if (!error || typeof error !== "object") return "unknown";

  const record = error as { code?: unknown; name?: unknown; status?: unknown };
  const code = typeof record.code === "string" ? record.code : "";
  const name = typeof record.name === "string" ? record.name : "";
  const status = typeof record.status === "number" ? record.status : undefined;

  if (code === "ENOENT" || status === 404) return "not_found";
  if (
    code === "EACCES" ||
    code === "EPERM" ||
    name === "NotAllowedError" ||
    status === 401 ||
    status === 403
  ) {
    return "permission_denied";
  }
  if (name === "AbortError") return "cancelled";
  if (code === "INVALID_PROJECT") return "invalid_project";
  if (code === "EIO") return "io_error";
  return "unknown";
}

export function classifySaveOutcome(outcome: { status: string; error?: unknown }): TelemetryReason {
  switch (outcome.status) {
    case "cancelled":
      return "cancelled";
    case "conflicted":
      return "conflict";
    case "locked":
      return "locked";
    case "failed":
      return classifyTelemetryError(outcome.error);
    default:
      return "unknown";
  }
}

export function getTelemetryTargetKind(
  descriptor: { path?: string | null; handle?: unknown } | null | undefined,
): TelemetryTargetKind {
  if (!descriptor) return "untitled";
  if (descriptor.path) return "file";
  if (descriptor.handle) return "handle";
  return "unknown";
}
