import type { LintIssue, Severity } from "@/lib/linting";
import type { PreviousDayStats } from "@/lib/editor-page/use-previous-day-stats";

export type Tab = "corrections" | "stats" | "history";

/** Returns true when the value is a supported inspector tab. */
export const isValidTab = (value: string | null): value is Tab =>
  value === "corrections" || value === "stats" || value === "history";

const MDI_EXTENSION = ".mdi";

/** Returns ".mdi" when present (case-insensitive), otherwise an empty string. */
export function getMdiExtension(name: string): string {
  if (name.toLowerCase().endsWith(MDI_EXTENSION)) {
    return name.slice(name.length - MDI_EXTENSION.length);
  }
  return "";
}

/** Returns the base filename without the .mdi extension. */
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
  /** 可視本文文字数（空白・改行・記法を除く） */
  charCount?: number;
  selectedCharCount?: number;
  paragraphCount?: number;
  /** 原稿用紙マス数（20×20、禁則処理あり） */
  manuscriptCellCount?: number;
  /** 原稿用紙換算枚数（切り上げ） */
  manuscriptPages?: number;
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
  onOpenPosHighlightSettings?: () => void;
  onHistoryRestore?: (content: string) => void;
  activeFileName?: string;
  activeFilePath?: string;
  currentContent?: string;
  onCompareInEditor?: (data: {
    snapshotContent: string;
    currentContent: string;
    label: string;
  }) => void;
  lintIssues?: LintIssue[];
  onNavigateToIssue?: (issue: LintIssue) => void;
  onApplyFix?: (issue: LintIssue) => void;
  onIgnoreCorrection?: (issue: LintIssue, ignoreAll: boolean) => void;
  onRefreshLinting?: () => void;
  isLinting?: boolean;
  activeLintIssueIndex?: number | null;
  onOpenLintingSettings?: () => void;
  correctionMode?: import("@/lib/linting/correction-config").CorrectionModeId;
  onCorrectionModeChange?: (
    modeId: import("@/lib/linting/correction-config").CorrectionModeId,
  ) => void;
  /** Monotonically increasing trigger to switch to the corrections tab from outside */
  switchToCorrectionsTrigger?: number;
  /** Previous day's stats for comparison display */
  previousDayStats?: PreviousDayStats | null;
}
