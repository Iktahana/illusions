"use client";

import type { ExportFormat } from "@/lib/export/types";
import { trackUsageEvent } from "./usage-events";

export type DocumentOutputOperation = "export" | "copy";

type DocumentOutputResult = string | { success: boolean } | null | undefined;

/**
 * Records only completed file exports and formatted clipboard copies.
 *
 * File paths and error objects may be present in the IPC result, so this
 * boundary deliberately reduces the result to a success boolean before
 * forwarding the fixed operation/format enums to analytics.
 */
export function trackDocumentOutputResult(
  operation: DocumentOutputOperation,
  format: ExportFormat,
  result: DocumentOutputResult,
): void {
  const completed =
    typeof result === "string" ||
    (typeof result === "object" && result !== null && result.success === true);

  if (!completed) return;

  trackUsageEvent("document_output_completed", { operation, format });
}
