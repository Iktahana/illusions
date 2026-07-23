"use client";

import {
  isOutputCompleted,
  type OutputOperation,
  type OutputResult,
} from "./document-output-events";
import { trackUsageEvent } from "./usage-events";

/**
 * Records successful MDI-to-note output only. The event intentionally has a
 * fixed format value: no source text, title, paths, clipboard data, or error
 * details can cross this boundary.
 */
export function trackNoteOutputResult(operation: OutputOperation, result: OutputResult): void {
  if (!isOutputCompleted(result)) return;

  trackUsageEvent("note_output_completed", { operation, format: "note" });
}
