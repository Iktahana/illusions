"use client";

import { useState, useCallback, useEffect, useRef } from "react";
import { FolderPlus, Check, Loader2, AlertCircle, ChevronDown } from "lucide-react";
import { getProjectService, validateProjectName } from "@/lib/project-service";

import type { ProjectMode, SupportedFileExtension } from "@/lib/project-types";

interface CreateProjectWizardProps {
  isOpen: boolean;
  onClose: () => void;
  onProjectCreated: (project: ProjectMode) => void;
}

/** Wizard step identifiers */
type WizardStep = "name-format" | "creating";

/** File format option definition */
interface FormatOption {
  extension: SupportedFileExtension;
  label: string;
  description: string;
  recommended?: boolean;
}

const FORMAT_OPTIONS: FormatOption[] = [
  {
    extension: ".mdi",
    label: "MDI形式（推奨）",
    description: "日本語小説向け。ルビ、縦中横が使えます。",
    recommended: true,
  },
  {
    extension: ".md",
    label: "Markdown形式",
    description: "標準的なMarkdown。技術文書やブログに。",
  },
  {
    extension: ".txt",
    label: "プレーンテキスト",
    description: "シンプルなテキスト。下書きやメモに。",
  },
];

/** Step labels for the step indicator */
const STEP_LABELS = ["設定", "作成"] as const;

/**
 * CreateProjectWizard - multi-step wizard for creating new projects.
 * 新規プロジェクトを作成するためのマルチステップウィザード。
 */
export default function CreateProjectWizard({
  isOpen,
  onClose,
  onProjectCreated,
}: CreateProjectWizardProps) {
  const [step, setStep] = useState<WizardStep>("name-format");
  const [projectName, setProjectName] = useState("");
  const [selectedExtension, setSelectedExtension] =
    useState<SupportedFileExtension>(".mdi");
  const [isCreating, setIsCreating] = useState(false);
  const [creationSuccess, setCreationSuccess] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [showOtherFormats, setShowOtherFormats] = useState(false);

  // Ref to track if component is still mounted during async operations
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  /** Reset wizard state when it opens */
  useEffect(() => {
    if (isOpen) {
      setStep("name-format");
      setProjectName("");
      setSelectedExtension(".mdi");
      setIsCreating(false);
      setCreationSuccess(false);
      setErrorMessage(null);
      setShowOtherFormats(false);
    }
  }, [isOpen]);

  /** Handle project creation */
  const handleCreate = useCallback(async () => {
    setStep("creating");
    setIsCreating(true);
    setErrorMessage(null);
    setCreationSuccess(false);

    try {
      const projectService = getProjectService();
      const project = await projectService.createProject(
        projectName,
        selectedExtension
      );

      if (!mountedRef.current) return;

      setCreationSuccess(true);
      setIsCreating(false);

      // Brief delay to show success message before closing
      setTimeout(() => {
        if (mountedRef.current) {
          onProjectCreated(project);
        }
      }, 800);
    } catch (error: unknown) {
      if (!mountedRef.current) return;

      setIsCreating(false);

      // Handle user cancellation of directory picker
      if (error instanceof DOMException && error.name === "AbortError") {
        setErrorMessage("ディレクトリの選択がキャンセルされました。");
      } else if (error instanceof Error) {
        setErrorMessage(error.message);
      } else {
        setErrorMessage("プロジェクトの作成中にエラーが発生しました。");
      }
    }
  }, [projectName, selectedExtension, onProjectCreated]);

  /** Handle retry after error */
  const handleRetry = useCallback(() => {
    void handleCreate();
  }, [handleCreate]);

  /** Handle cancel from error state - go back to step 1 */
  const handleErrorCancel = useCallback(() => {
    setStep("name-format");
    setErrorMessage(null);
    setIsCreating(false);
    setCreationSuccess(false);
  }, []);

  /** Handle background click */
  const handleBackgroundClick = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      // Only allow closing on step 1 (name-format)
      if (e.target === e.currentTarget && step === "name-format") {
        onClose();
      }
    },
    [step, onClose]
  );

  /** Handle keyboard input for name field */
  const handleNameKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (e.key === "Enter" && projectName.trim() !== "") {
        void handleCreate();
      }
    },
    [projectName, handleCreate]
  );

  if (!isOpen) return null;

  const currentStepIndex = step === "name-format" ? 0 : 1;
  const nameValidation = projectName ? validateProjectName(projectName) : { valid: false };
  const isNameValid = nameValidation.valid;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
      role="dialog"
      aria-modal="true"
      aria-label="新規プロジェクト作成"
      onClick={handleBackgroundClick}
    >
      <div className="mx-4 w-full max-w-lg rounded-xl bg-background-elevated p-6 shadow-xl border border-border">
        {/* Step indicator */}
        <div className="mb-6 flex items-center justify-center gap-3">
          {STEP_LABELS.map((label, index) => (
            <div key={label} className="flex items-center gap-3">
              <div className="flex items-center gap-2">
                <div
                  className={`flex h-7 w-7 items-center justify-center rounded-full text-xs font-medium transition-colors ${
                    index < currentStepIndex
                      ? "bg-accent text-accent-foreground"
                      : index === currentStepIndex
                        ? "bg-accent text-accent-foreground"
                        : "bg-hover text-foreground-secondary"
                  }`}
                >
                  {index < currentStepIndex ? (
                    <Check className="h-3.5 w-3.5" />
                  ) : (
                    index + 1
                  )}
                </div>
                <span
                  className={`text-sm ${
                    index === currentStepIndex
                      ? "font-medium text-foreground"
                      : "text-foreground-secondary"
                  }`}
                >
                  {label}
                </span>
              </div>
              {index < STEP_LABELS.length - 1 && (
                <div className="h-px w-8 bg-border" />
              )}
            </div>
          ))}
        </div>

        {/* Step 1: Name & Format */}
        {step === "name-format" && (
          <div>
            <div className="mb-1 flex items-center gap-2">
              <FolderPlus className="h-5 w-5 text-accent" />
              <h2 className="text-lg font-semibold text-foreground">
                新規プロジェクト
              </h2>
            </div>
            <p className="mb-5 text-sm text-foreground-secondary">
              プロジェクト名とファイル形式を設定してください。
            </p>

            {/* Project name input */}
            <div className="mb-5">
              <label
                htmlFor="project-name"
                className="mb-1.5 block text-sm font-medium text-foreground"
              >
                プロジェクト名
              </label>
              <input
                id="project-name"
                type="text"
                value={projectName}
                onChange={(e) => setProjectName(e.target.value)}
                onKeyDown={handleNameKeyDown}
                placeholder="例: 春の物語"
                className={`w-full rounded-lg border bg-background-elevated px-3 py-2 text-sm text-foreground placeholder:text-foreground-secondary/50 focus:outline-none focus:ring-1 transition-colors ${
                  projectName && !isNameValid
                    ? "border-red-500 focus:border-red-500 focus:ring-red-500"
                    : "border-border focus:border-accent focus:ring-accent"
                }`}
                autoFocus
              />
              {projectName && !isNameValid && nameValidation.error && (
                <p className="mt-1 text-xs text-red-500">
                  {nameValidation.error}
                </p>
              )}
            </div>

            {/* File format selection: MDI prominent, others collapsible */}
            <div className="mb-6">
              <label className="mb-2 block text-sm font-medium text-foreground">
                ファイル形式を選択
              </label>
              <div className="space-y-2">
                {/* MDI format - always visible */}
                <label
                  className={`flex cursor-pointer items-start gap-3 rounded-lg border p-3 transition-colors ${
                    selectedExtension === ".mdi"
                      ? "border-accent bg-accent/5"
                      : "border-border hover:bg-hover"
                  }`}
                >
                  <input
                    type="radio"
                    name="file-format"
                    value=".mdi"
                    checked={selectedExtension === ".mdi"}
                    onChange={() => setSelectedExtension(".mdi")}
                    className="mt-0.5 accent-accent"
                  />
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium text-foreground">
                        MDI形式（推奨）
                      </span>
                      <code className="rounded bg-hover px-1.5 py-0.5 text-xs text-foreground-secondary">
                        .mdi
                      </code>
                    </div>
                    <p className="mt-0.5 text-xs text-foreground-secondary">
                      日本語小説向け。ルビ、縦中横が使えます。
                    </p>
                  </div>
                </label>

                {/* Collapsible section for other formats */}
                <button
                  type="button"
                  onClick={() => setShowOtherFormats(!showOtherFormats)}
                  className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm text-foreground-secondary hover:bg-hover transition-colors"
                >
                  <ChevronDown
                    className={`h-4 w-4 transition-transform ${showOtherFormats ? "rotate-180" : ""}`}
                  />
                  その他の形式
                </button>

                {showOtherFormats &&
                  FORMAT_OPTIONS.filter((opt) => !opt.recommended).map(
                    (option) => (
                      <label
                        key={option.extension}
                        className={`flex cursor-pointer items-start gap-3 rounded-lg border p-3 transition-colors ${
                          selectedExtension === option.extension
                            ? "border-accent bg-accent/5"
                            : "border-border hover:bg-hover"
                        }`}
                      >
                        <input
                          type="radio"
                          name="file-format"
                          value={option.extension}
                          checked={selectedExtension === option.extension}
                          onChange={() =>
                            setSelectedExtension(option.extension)
                          }
                          className="mt-0.5 accent-accent"
                        />
                        <div className="flex-1">
                          <div className="flex items-center gap-2">
                            <span className="text-sm font-medium text-foreground">
                              {option.label}
                            </span>
                            <code className="rounded bg-hover px-1.5 py-0.5 text-xs text-foreground-secondary">
                              {option.extension}
                            </code>
                          </div>
                          <p className="mt-0.5 text-xs text-foreground-secondary">
                            {option.description}
                          </p>
                        </div>
                      </label>
                    )
                  )}
              </div>
            </div>

            {/* Action buttons */}
            <div className="flex justify-end gap-3">
              <button
                type="button"
                onClick={onClose}
                className="rounded-lg px-4 py-2 text-sm font-medium text-foreground-secondary hover:bg-hover transition-colors"
              >
                キャンセル
              </button>
              <button
                type="button"
                onClick={() => void handleCreate()}
                disabled={!isNameValid}
                className="rounded-lg bg-accent px-4 py-2 text-sm font-medium text-accent-foreground hover:bg-accent-hover transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                次へ
              </button>
            </div>
          </div>
        )}

        {/* Step 2: Creating */}
        {step === "creating" && (
          <div className="flex flex-col items-center py-4">
            {/* Creating in progress */}
            {isCreating && (
              <div className="flex flex-col items-center gap-4">
                <Loader2 className="h-10 w-10 animate-spin text-accent" />
                <p className="text-sm text-foreground-secondary">
                  プロジェクトを作成しています...
                </p>
              </div>
            )}

            {/* Success */}
            {creationSuccess && !isCreating && (
              <div className="flex flex-col items-center gap-4">
                <div className="flex h-12 w-12 items-center justify-center rounded-full bg-accent/10">
                  <Check className="h-6 w-6 text-accent" />
                </div>
                <p className="text-sm font-medium text-foreground">
                  プロジェクト「{projectName}」を作成しました
                </p>
              </div>
            )}

            {/* Error */}
            {errorMessage && !isCreating && !creationSuccess && (
              <div className="flex w-full flex-col items-center gap-4">
                <div className="flex h-12 w-12 items-center justify-center rounded-full bg-red-500/10">
                  <AlertCircle className="h-6 w-6 text-red-500" />
                </div>
                <p className="text-center text-sm text-foreground-secondary">
                  {errorMessage}
                </p>
                <div className="flex gap-3">
                  <button
                    type="button"
                    onClick={handleErrorCancel}
                    className="rounded-lg px-4 py-2 text-sm font-medium text-foreground-secondary hover:bg-hover transition-colors"
                  >
                    キャンセル
                  </button>
                  <button
                    type="button"
                    onClick={handleRetry}
                    className="rounded-lg bg-accent px-4 py-2 text-sm font-medium text-accent-foreground hover:bg-accent-hover transition-colors"
                  >
                    再試行
                  </button>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
