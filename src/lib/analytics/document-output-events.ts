"use client";

import type { ExportFormat } from "@/lib/export/types";
import { classifyTelemetryFailure, trackUsageEvent } from "./usage-events";

export type OutputOperation = "export" | "copy";
export type DocumentOutputOperation = OutputOperation;
export type DocumentOutputFormat = Exclude<ExportFormat, "note">;

export type OutputResult = string | { success: boolean } | null | undefined;

export function trackDocumentOutputAttempt(
  operation: DocumentOutputOperation,
  format: DocumentOutputFormat,
): void {
  trackUsageEvent("document_output_attempted", { operation, format });
}

/**
 * Reduce IPC output to its success state before analytics sees it. IPC return
 * values can contain file paths or errors, neither of which is telemetry.
 */
export function isOutputCompleted(result: OutputResult): boolean {
  return (
    typeof result === "string" ||
    (typeof result === "object" && result !== null && result.success === true)
  );
}

/**
 * Records only completed file exports and formatted clipboard copies.
 *
 * File paths and error objects may be present in the IPC result, so this
 * boundary deliberately reduces the result to a success boolean before
 * forwarding the fixed operation/format enums to analytics.
 */
export function trackDocumentOutputResult(
  operation: DocumentOutputOperation,
  format: DocumentOutputFormat,
  result: OutputResult,
): void {
  if (isOutputCompleted(result)) {
    trackUsageEvent("document_output_completed", { operation, format });
  } else if (result === null || result === undefined) {
    trackUsageEvent("document_output_cancelled", { operation, format });
  } else {
    trackUsageEvent("document_output_failed", { operation, format, reason: "unknown" });
  }
}

export function trackDocumentOutputFailure(
  operation: DocumentOutputOperation,
  format: DocumentOutputFormat,
  error: unknown,
): void {
  trackUsageEvent("document_output_failed", {
    operation,
    format,
    reason: classifyTelemetryFailure(error),
  });
}
