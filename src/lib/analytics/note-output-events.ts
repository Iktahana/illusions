"use client";

import {
  isOutputCompleted,
  type OutputOperation,
  type OutputResult,
} from "./document-output-events";
import { classifyTelemetryFailure, trackUsageEvent } from "./usage-events";

export function trackNoteOutputAttempt(operation: OutputOperation): void {
  trackUsageEvent("note_output_attempted", { operation, format: "note" });
}

/**
 * Records successful MDI-to-note output only. The event intentionally has a
 * fixed format value: no source text, title, paths, clipboard data, or error
 * details can cross this boundary.
 */
export function trackNoteOutputResult(operation: OutputOperation, result: OutputResult): void {
  if (isOutputCompleted(result)) {
    trackUsageEvent("note_output_completed", { operation, format: "note" });
  } else if (result === null || result === undefined) {
    trackUsageEvent("note_output_cancelled", { operation, format: "note" });
  } else {
    trackUsageEvent("note_output_failed", { operation, format: "note", reason: "unknown" });
  }
}

export function trackNoteOutputFailure(operation: OutputOperation, error: unknown): void {
  trackUsageEvent("note_output_failed", {
    operation,
    format: "note",
    reason: classifyTelemetryFailure(error),
  });
}
