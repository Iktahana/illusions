"use client";

import contract from "./usage-event-contract.json";

export type TelemetryFailureReason =
  | "invalid_input"
  | "unavailable"
  | "network"
  | "timeout"
  | "permission_denied"
  | "not_found"
  | "conflict"
  | "io_error"
  | "invalid_pattern"
  | "unknown";

/** Legacy reasons remain accepted so existing Aptabase reports keep their semantics. */
export type TelemetryReason = TelemetryFailureReason | "cancelled" | "invalid_project" | "locked";

export type TelemetryResult = "completed" | "failed" | "cancelled" | "blocked";
export type TelemetryCountBucket = "0" | "1" | "2_5" | "6_10" | "11_plus";
export type SessionDurationBucket = "lt_1m" | "1_5m" | "5_15m" | "15_60m" | "gte_60m";
export type TelemetryTargetKind = "file" | "untitled" | "handle" | "unknown";

type Surface =
  | "wizard"
  | "welcome"
  | "menu"
  | "settings"
  | "sidebar"
  | "explorer"
  | "system"
  | "startup"
  | "shortcut"
  | "callback"
  | "unknown";
type Mode = "project" | "standalone";
type FileType = "mdi" | "md" | "txt" | "unknown";
type OutputOperation = "export" | "copy";
type DocumentFormat =
  "html" | "pdf" | "epub" | "docx" | "txt" | "txt-ruby" | "narou" | "kakuyomu" | "aozora";
type Failure = { reason: TelemetryFailureReason };
type SearchBase = {
  scope: "current" | "project" | "folder";
  case_sensitive: "true" | "false";
  whole_word: "true" | "false";
  regex: "true" | "false";
  target: "all" | "body" | "ruby";
};
type UpdateBase = { trigger: "automatic" | "manual"; channel: "stable" | "beta" };
type FeedbackBase = { category: "bug" | "feature" | "ai_inappropriate" | "other" };

/** Event-specific renderer contract. Values are deliberately finite and content-free. */
export interface UsageEventPropsMap {
  app_launched: {
    platform: "aix" | "darwin" | "freebsd" | "linux" | "openbsd" | "sunos" | "win32";
  };
  app_heartbeat: Record<never, never>;
  app_closed: { duration_bucket: SessionDurationBucket };
  auth_login_started: {
    surface: "settings" | "welcome" | "menu" | "startup" | "callback" | "unknown";
  };
  auth_login_completed: UsageEventPropsMap["auth_login_started"];
  auth_login_failed: UsageEventPropsMap["auth_login_started"] & {
    stage: "start" | "callback" | "exchange" | "restore" | "refresh" | "logout" | "unknown";
    reason: TelemetryReason;
  };
  auth_session_restored: { surface: "startup"; strategy: "electron_tokens" | "web_cookie" };
  auth_session_restore_failed: { surface: "startup"; reason: TelemetryReason };
  auth_refresh_completed: { surface: "startup" };
  auth_refresh_failed: { surface: "startup"; reason: TelemetryReason };
  auth_logout_completed: { surface: "settings" | "menu" | "unknown" };
  auth_logout_failed: UsageEventPropsMap["auth_logout_completed"] & { reason: TelemetryReason };
  save_attempted: {
    trigger: "manual" | "save_as" | "auto" | "close_tab" | "window_close" | "save_all";
    mode: Mode;
    target_kind: TelemetryTargetKind;
  };
  save_completed: UsageEventPropsMap["save_attempted"];
  save_failed: UsageEventPropsMap["save_attempted"] & { reason: TelemetryReason };
  save_blocked: UsageEventPropsMap["save_failed"];
  save_all_completed: {
    dirty_count_bucket: TelemetryCountBucket;
    result: "all_saved" | "blocked" | "partial";
  };
  autosave_attempted: {
    target_kind: TelemetryTargetKind;
    activity: "foreground" | "background" | "unknown";
  };
  autosave_completed: UsageEventPropsMap["autosave_attempted"];
  autosave_failed: { target_kind: TelemetryTargetKind; reason: TelemetryReason };
  save_conflict_blocked: { trigger: UsageEventPropsMap["save_attempted"]["trigger"]; mode: Mode };
  project_create_started: { surface: Surface; mode: Mode };
  project_create_completed: UsageEventPropsMap["project_create_started"] & {
    initial_file_type: FileType;
  };
  project_create_failed: UsageEventPropsMap["project_create_started"] & { reason: TelemetryReason };
  project_open_started: {
    surface: Surface;
    source: "dialog" | "recent" | "system_open" | "auto_restore" | "open_as_project";
  };
  project_open_completed: UsageEventPropsMap["project_open_started"] & {
    restore_strategy: "fresh" | "recent" | "stored_handle" | "none";
  };
  project_open_failed: UsageEventPropsMap["project_open_started"] & { reason: TelemetryReason };
  project_recent_open_failed: { reason: TelemetryReason };
  project_auto_restore_completed: {
    restore_strategy: "fresh" | "recent" | "stored_handle" | "none";
  };
  project_auto_restore_failed: { reason: TelemetryReason };
  file_new_created: { surface: Surface; file_type: FileType; context: Mode };
  file_open_started: UsageEventPropsMap["project_open_started"];
  file_open_completed: UsageEventPropsMap["file_open_started"] & { file_type: FileType };
  file_open_failed: UsageEventPropsMap["file_open_started"] & { reason: TelemetryReason };
  project_file_open_completed: { surface: Surface; file_type: FileType; preview: "true" | "false" };
  project_file_open_failed: { surface: Surface; reason: TelemetryReason };
  project_file_created: {
    surface: Surface;
    file_type: FileType;
    collision: "none" | "confirmed" | "blocked";
  };
  project_folder_created: { surface: Surface };
  project_file_renamed: {
    surface: Surface;
    target_kind: "file" | "folder";
    result: "completed" | "blocked" | "failed";
  };
  project_file_deleted: {
    surface: Surface;
    target_kind: "file" | "folder";
    dirty_open_tabs_bucket: TelemetryCountBucket;
  };
  project_file_duplicated: UsageEventPropsMap["project_file_created"];
  document_output_attempted: { operation: OutputOperation; format: DocumentFormat };
  document_output_completed: UsageEventPropsMap["document_output_attempted"];
  document_output_failed: UsageEventPropsMap["document_output_attempted"] & Failure;
  document_output_cancelled: UsageEventPropsMap["document_output_attempted"];
  note_output_attempted: { operation: OutputOperation; format: "note" };
  note_output_completed: UsageEventPropsMap["note_output_attempted"];
  note_output_failed: UsageEventPropsMap["note_output_attempted"] & Failure;
  note_output_cancelled: UsageEventPropsMap["note_output_attempted"];
  print_attempted: Record<never, never>;
  print_completed: Record<never, never>;
  print_failed: Failure;
  print_cancelled: Record<never, never>;
  feature_view_opened: {
    view:
      | "files"
      | "explorer"
      | "search"
      | "dictionary"
      | "word_frequency"
      | "corrections"
      | "stats"
      | "history";
    surface: "activity_bar" | "shortcut" | "menu" | "cross_feature";
  };
  settings_category_opened: {
    category:
      | "account"
      | "ai_connection"
      | "typography"
      | "scroll"
      | "pos_highlight"
      | "linting"
      | "speech"
      | "export"
      | "keymap"
      | "terminal"
      | "power"
      | "dictionary"
      | "privacy"
      | "about";
  };
  settings_change_completed: {
    category: UsageEventPropsMap["settings_category_opened"]["category"];
    setting:
      | "theme"
      | "typography"
      | "scroll"
      | "pos_highlight"
      | "linting"
      | "speech"
      | "export"
      | "keymap"
      | "terminal"
      | "power"
      | "dictionary"
      | "beta_updates"
      | "error_reporting"
      | "account";
    action: "enabled" | "disabled" | "updated" | "reset";
  };
  search_completed: SearchBase & { result_count_bucket: TelemetryCountBucket };
  search_failed: SearchBase & Failure;
  search_replacement_completed: {
    scope: SearchBase["scope"];
    mode: "single" | "all" | "undo";
    replacement_count_bucket: TelemetryCountBucket;
  };
  search_replacement_failed: {
    scope: SearchBase["scope"];
    mode: "single" | "all" | "undo";
  } & Failure;
  proofreading_run_completed: {
    trigger: "first_auto" | "manual" | "settings_change";
    issue_count_bucket: TelemetryCountBucket;
  };
  proofreading_run_failed: {
    trigger: UsageEventPropsMap["proofreading_run_completed"]["trigger"];
  } & Failure;
  proofreading_issue_action_completed: {
    action: "navigate" | "apply_fix" | "ignore_one" | "ignore_all" | "add_dictionary";
  };
  ruleset_sync_completed: {
    trigger: "startup" | "manual" | "redownload";
    change_count_bucket: TelemetryCountBucket;
  };
  ruleset_sync_failed: {
    trigger: UsageEventPropsMap["ruleset_sync_completed"]["trigger"];
  } & Failure;
  dictionary_search_completed: {
    source: "panel" | "selection" | "correction";
    result_count_bucket: TelemetryCountBucket;
  };
  dictionary_entry_changed: { operation: "add" | "update" | "remove" | "import" | "clear" };
  dictionary_lookup_opened: { provider: "local" | "genji" | "unknown" };
  dictionary_download_completed: { trigger: "startup" | "manual" | "update" | "repair" };
  dictionary_download_failed: {
    trigger: UsageEventPropsMap["dictionary_download_completed"]["trigger"];
  } & Failure;
  history_action_completed: {
    action: "create_snapshot" | "restore" | "compare" | "bookmark_add" | "bookmark_remove";
  };
  history_action_failed: UsageEventPropsMap["history_action_completed"] & Failure;
  word_frequency_completed: {
    trigger: "initial" | "manual";
    cache_hit: "true" | "false";
    total_count_bucket: TelemetryCountBucket;
    unique_count_bucket: TelemetryCountBucket;
  };
  word_frequency_failed: {
    trigger: UsageEventPropsMap["word_frequency_completed"]["trigger"];
  } & Failure;
  editor_format_applied: { format: "ruby" | "tcy"; operation: "apply" | "remove" };
  editor_layout_changed: {
    action: "writing_mode" | "compact_mode" | "split";
    value: "horizontal" | "vertical" | "enabled" | "disabled" | "single" | "split";
  };
  speech_session_started: { voice_kind: "default" | "custom" };
  speech_session_finished: UsageEventPropsMap["speech_session_started"] & {
    outcome: "completed" | "stopped" | "error";
  };
  terminal_session_started: { context: Mode; shell_kind: "default" | "custom" };
  terminal_session_failed: UsageEventPropsMap["terminal_session_started"] & Failure;
  terminal_session_finished: UsageEventPropsMap["terminal_session_started"] & {
    outcome: "exit_zero" | "exit_nonzero" | "killed";
  };
  ai_connection_test_completed: Record<never, never>;
  ai_connection_test_failed: Failure;
  feedback_opened: FeedbackBase;
  feedback_submit_completed: FeedbackBase;
  feedback_submit_failed: FeedbackBase & Failure;
  app_update_available: UpdateBase;
  app_update_download_completed: UpdateBase;
  app_update_download_failed: UpdateBase & Failure;
  app_update_install_started: UpdateBase;
  app_update_install_blocked: UpdateBase & Failure;
  keymap_changed: { operation: "set" | "reset" | "reset_all" };
}

export type UsageEventName = keyof UsageEventPropsMap;
export type UsageEventProps = UsageEventPropsMap[UsageEventName];
type EventsWithoutProps = {
  [K in UsageEventName]: keyof UsageEventPropsMap[K] extends never ? K : never;
}[UsageEventName];
type Assert<T extends true> = T;
type SameKeys<A, B> = [Exclude<keyof A, keyof B>, Exclude<keyof B, keyof A>] extends [never, never]
  ? true
  : false;
export type UsageEventContractIsSynchronized = Assert<
  SameKeys<UsageEventPropsMap, typeof contract.events>
>;

type UsageEventContract = { events: Record<string, Record<string, string[]>> };
const usageEventContract = contract as UsageEventContract;

export function isUsageEventName(eventName: string): eventName is UsageEventName {
  return Object.hasOwn(usageEventContract.events, eventName);
}

export function trackUsageEvent<K extends UsageEventName>(
  eventName: K,
  ...args: K extends EventsWithoutProps
    ? [props?: UsageEventPropsMap[K]]
    : [props: UsageEventPropsMap[K]]
): void {
  const props = args[0];
  if (typeof window === "undefined") return;
  const analytics = window.electronAPI?.analytics;
  if (!analytics) return;

  const sanitizedProps: Record<string, string | number> = {};
  for (const [key, value] of Object.entries(props ?? {})) {
    if (typeof value === "string" || (typeof value === "number" && Number.isFinite(value))) {
      sanitizedProps[key] = value;
    }
  }

  try {
    void analytics
      .trackEvent(eventName, Object.keys(sanitizedProps).length > 0 ? sanitizedProps : undefined)
      .catch(() => undefined);
  } catch {
    // Analytics must never affect product behavior.
  }
}

export function bucketTelemetryCount(count: number): TelemetryCountBucket {
  if (!Number.isFinite(count) || count <= 0) return "0";
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

export function normalizeTelemetryFileType(fileType: string | null | undefined): FileType {
  const normalized = fileType?.replace(/^\./, "").toLowerCase();
  return normalized === "mdi" || normalized === "md" || normalized === "txt"
    ? normalized
    : "unknown";
}

export function classifyTelemetryFailure(error: unknown): TelemetryFailureReason {
  if (!error || typeof error !== "object") return "unknown";
  const record = error as { code?: unknown; name?: unknown; status?: unknown; message?: unknown };
  const code = typeof record.code === "string" ? record.code.toUpperCase() : "";
  const name = typeof record.name === "string" ? record.name : "";
  const status = typeof record.status === "number" ? record.status : undefined;
  const message = typeof record.message === "string" ? record.message.toLowerCase() : "";
  if (code === "ENOENT" || status === 404) return "not_found";
  if (
    ["EACCES", "EPERM"].includes(code) ||
    name === "NotAllowedError" ||
    status === 401 ||
    status === 403
  )
    return "permission_denied";
  if (code === "ETIMEDOUT" || name === "TimeoutError" || message.includes("timeout"))
    return "timeout";
  if (
    ["ENETUNREACH", "ECONNREFUSED", "ECONNRESET"].includes(code) ||
    name === "NetworkError" ||
    status === 502 ||
    status === 503 ||
    status === 504
  )
    return "network";
  if (code === "EEXIST" || code === "CONFLICT" || status === 409) return "conflict";
  if (code === "EIO") return "io_error";
  if (name === "SyntaxError" || code === "INVALID_PATTERN") return "invalid_pattern";
  if (code === "EINVAL" || status === 400 || status === 422) return "invalid_input";
  if (code === "UNAVAILABLE" || name === "NotSupportedError") return "unavailable";
  return "unknown";
}

export function classifyTelemetryError(error: unknown): TelemetryReason {
  if (error && typeof error === "object") {
    const { code, name } = error as { code?: unknown; name?: unknown };
    if (name === "AbortError") return "cancelled";
    if (code === "INVALID_PROJECT") return "invalid_project";
    if (code === "LOCKED") return "locked";
  }
  return classifyTelemetryFailure(error);
}

export function classifySaveOutcome(outcome: { status: string; error?: unknown }): TelemetryReason {
  if (outcome.status === "cancelled") return "cancelled";
  if (outcome.status === "conflicted") return "conflict";
  if (outcome.status === "locked") return "locked";
  return outcome.status === "failed" ? classifyTelemetryError(outcome.error) : "unknown";
}

export function getTelemetryTargetKind(
  descriptor: { path?: string | null; handle?: unknown } | null | undefined,
): TelemetryTargetKind {
  if (!descriptor) return "untitled";
  if (descriptor.path) return "file";
  if (descriptor.handle) return "handle";
  return "unknown";
}
