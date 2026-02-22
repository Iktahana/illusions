import type { LintIssue, Severity } from "@/lib/linting";

export type Tab = "ai" | "corrections" | "stats" | "history";

export const isValidTab = (value: string | null): value is Tab =>
  value === "ai" || value === "corrections" || value === "stats" || value === "history";

const MDI_EXTENSION = ".mdi";

export function getMdiExtension(name: string): string {
  if (name.toLowerCase().endsWith(MDI_EXTENSION)) {
    return name.slice(name.length - MDI_EXTENSION.length);
  }
  return "";
}

export function getBaseName(name: string): string {
  const extension = getMdiExtension(name);
  return extension ? name.slice(0, -extension.length) : name;
}

/** Severity filter options for the corrections panel */
export type SeverityFilter = "all" | Severity;

/** Extended issue with original text from the document */
export interface EnrichedLintIssue extends LintIssue {
  originalText?: string;
}

export interface InspectorProps {
  className?: string;
  compactMode?: boolean;
  charCount?: number;
  selectedCharCount?: number;
  paragraphCount?: number;
  fileName?: string;
  isDirty?: boolean;
  isSaving?: boolean;
  lastSavedTime?: number | null;
  onSaveFile?: () => void;
  onFileNameChange?: (newName: string) => void;
  sentenceCount?: number;
  charTypeAnalysis?: {
    kanji: number;
    hiragana: number;
    katakana: number;
    other: number;
    total: number;
  };
  charUsageRates?: {
    kanjiRate: number;
    hiraganaRate: number;
    katakanaRate: number;
  };
  readabilityAnalysis?: {
    score: number;
    level: string;
    avgSentenceLength: number;
    avgPunctuationSpacing: number;
  };
  posHighlightEnabled?: boolean;
  onPosHighlightEnabledChange?: (enabled: boolean) => void;
  posHighlightColors?: Record<string, string>;
  onOpenPosHighlightSettings?: () => void;
  onHistoryRestore?: (content: string) => void;
  activeFileName?: string;
  currentContent?: string;
  onCompareInEditor?: (data: { snapshotContent: string; currentContent: string; label: string }) => void;
  lintIssues?: LintIssue[];
  onNavigateToIssue?: (issue: LintIssue) => void;
  onApplyFix?: (issue: LintIssue) => void;
  onIgnoreCorrection?: (issue: LintIssue, ignoreAll: boolean) => void;
  onRefreshLinting?: () => void;
  isLinting?: boolean;
  activeLintIssueIndex?: number | null;
  onOpenLintingSettings?: () => void;
  onApplyLintPreset?: (presetId: string) => void;
  activeLintPresetId?: string;
  /** Monotonically increasing trigger to switch to the corrections tab from outside */
  switchToCorrectionsTrigger?: number;
}
