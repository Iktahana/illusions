import type { ExistingRubySelection, RubyApplicationSegment } from "@/lib/editor-interaction";

export interface RubyDialogRequest {
  selectedText: string;
  existingRuby: ExistingRubySelection | null;
}

export type RubyDialogResult =
  | { action: "apply"; segments: readonly RubyApplicationSegment[] }
  | { action: "remove" }
  | null;

export function serializeRubyReading(reading: string | readonly string[]): string {
  return Array.isArray(reading) ? reading.join(".") : String(reading);
}

export function normalizeRubyReading(reading: string | readonly string[]): string | readonly string[] {
  if (Array.isArray(reading)) return reading;
  const raw = String(reading).trim();
  if (!raw) return "";
  const parts = raw
    .split(".")
    .map((part: string) => part.trim())
    .filter(Boolean);
  return parts.length > 1 ? parts : raw;
}
