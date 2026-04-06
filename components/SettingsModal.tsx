"use client";

import { useState, useEffect, useRef } from "react";
import {
  X,
  Settings,
  Columns2,
  Highlighter,
  SpellCheck,
  BatteryMedium,
  AudioLines,
  Keyboard,
  Terminal,
  UserCircle,
  BookOpen,
} from "lucide-react";
import clsx from "clsx";

import { isElectronRenderer } from "@/lib/utils/runtime-env";
import AboutSection from "./settings/AboutSection";
import TypographySettingsTab from "./settings/TypographySettingsTab";
import VerticalSettingsTab from "./settings/VerticalSettingsTab";
import PosHighlightSettingsTab from "./settings/PosHighlightSettingsTab";
import LintingSettingsTab from "./settings/LintingSettingsTab";
import SpeechSettingsTab from "./settings/SpeechSettingsTab";
import KeymapSettingsTab from "./settings/KeymapSettingsTab";
import PowerSettingsTab from "./settings/PowerSettingsTab";
import TerminalSettingsTab from "./settings/TerminalSettingsTab";
import AccountSettingsTab from "./settings/AccountSettingsTab";
import DictSettingsTab from "./settings/DictSettingsTab";

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  /** Open modal on a specific tab */
  initialCategory?: SettingsCategory;
}

export type SettingsCategory =
  | "account"
  | "editor"
  | "vertical"
  | "pos-highlight"
  | "linting"
  | "speech"
  | "keymap"
  | "terminal"
  | "power"
  | "dictionary"
  | "about";

export default function SettingsModal({ isOpen, onClose, initialCategory }: SettingsModalProps) {
  const [activeCategory, setActiveCategory] = useState<SettingsCategory>(
    initialCategory ?? "editor",
  );
  const modalRef = useRef<HTMLDivElement>(null);

  // Sync initialCategory when modal opens
  useEffect(() => {
    if (isOpen && initialCategory) {
      setActiveCategory(initialCategory);
    }
  }, [isOpen, initialCategory]);

  // Body scroll lock
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = "hidden";
      return () => {
        document.body.style.overflow = "";
      };
    }
  }, [isOpen]);

  // Escape key handler
  useEffect(() => {
    function handleEscape(e: KeyboardEvent): void {
      if (e.key === "Escape" && isOpen) {
        onClose();
      }
    }
    document.addEventListener("keydown", handleEscape);
    return () => document.removeEventListener("keydown", handleEscape);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  function handleOverlayClick(e: React.MouseEvent<HTMLDivElement>): void {
    if (e.target === e.currentTarget) {
      onClose();
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 backdrop-blur-sm"
      onClick={handleOverlayClick}
    >
      <div
        ref={modalRef}
        className={clsx(
          "relative w-full h-[80vh] mx-4 rounded-xl bg-background-elevated shadow-xl border border-border flex flex-col transition-[max-width] duration-200",
          activeCategory === "pos-highlight" ? "max-w-6xl" : "max-w-4xl",
        )}
      >
        {/* Header */}
        <div className="flex-shrink-0 flex items-center justify-between px-6 py-4 border-b border-border">
          <h2 className="text-lg font-medium text-foreground">設定</h2>
          <button
            onClick={onClose}
            className="p-1 rounded hover:bg-hover text-foreground-secondary hover:text-foreground transition-colors"
            aria-label="閉じる"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* 2-column layout */}
        <div className="flex-1 flex overflow-hidden">
          {/* Left navigation */}
          <div className="w-48 flex-shrink-0 border-r border-border bg-background-secondary p-2">
            <nav className="space-y-1">
              <button
                onClick={() => setActiveCategory("account")}
                className={clsx(
                  "w-full text-left px-3 py-2 rounded-lg text-sm font-medium transition-colors flex items-center gap-1.5",
                  activeCategory === "account"
                    ? "bg-accent text-accent-foreground"
                    : "text-foreground-secondary hover:bg-hover hover:text-foreground",
                )}
              >
                <UserCircle className="w-4 h-4" />
                アカウント
              </button>
              <div className="my-2 border-t border-border" />
              <button
                onClick={() => setActiveCategory("editor")}
                className={clsx(
                  "w-full text-left px-3 py-2 rounded-lg text-sm font-medium transition-colors flex items-center gap-1.5",
                  activeCategory === "editor"
                    ? "bg-accent text-accent-foreground"
                    : "text-foreground-secondary hover:bg-hover hover:text-foreground",
                )}
              >
                <Settings className="w-4 h-4" />
                エディタ
              </button>
              <button
                onClick={() => setActiveCategory("vertical")}
                className={clsx(
                  "w-full text-left px-3 py-2 rounded-lg text-sm font-medium transition-colors flex items-center gap-1.5",
                  activeCategory === "vertical"
                    ? "bg-accent text-accent-foreground"
                    : "text-foreground-secondary hover:bg-hover hover:text-foreground",
                )}
              >
                <Columns2 className="w-4 h-4" />
                縦書き
              </button>
              <button
                onClick={() => setActiveCategory("pos-highlight")}
                className={clsx(
                  "w-full text-left px-3 py-2 rounded-lg text-sm font-medium transition-colors flex items-center gap-1.5",
                  activeCategory === "pos-highlight"
                    ? "bg-accent text-accent-foreground"
                    : "text-foreground-secondary hover:bg-hover hover:text-foreground",
                )}
              >
                <Highlighter className="w-4 h-4" />
                品詞ハイライト
              </button>
              <button
                onClick={() => setActiveCategory("linting")}
                className={clsx(
                  "w-full text-left px-3 py-2 rounded-lg text-sm font-medium transition-colors flex items-center gap-1.5",
                  activeCategory === "linting"
                    ? "bg-accent text-accent-foreground"
                    : "text-foreground-secondary hover:bg-hover hover:text-foreground",
                )}
              >
                <SpellCheck className="w-4 h-4" />
                校正
              </button>
              <button
                onClick={() => setActiveCategory("speech")}
                className={clsx(
                  "w-full text-left px-3 py-2 rounded-lg text-sm font-medium transition-colors flex items-center gap-1.5",
                  activeCategory === "speech"
                    ? "bg-accent text-accent-foreground"
                    : "text-foreground-secondary hover:bg-hover hover:text-foreground",
                )}
              >
                <AudioLines className="w-4 h-4" />
                音声入力/読み上げ
              </button>
              <button
                onClick={() => setActiveCategory("keymap")}
                className={clsx(
                  "w-full text-left px-3 py-2 rounded-lg text-sm font-medium transition-colors flex items-center gap-1.5",
                  activeCategory === "keymap"
                    ? "bg-accent text-accent-foreground"
                    : "text-foreground-secondary hover:bg-hover hover:text-foreground",
                )}
              >
                <Keyboard className="w-4 h-4" />
                キーマップ
              </button>
              {isElectronRenderer() && (
                <button
                  onClick={() => setActiveCategory("terminal")}
                  className={clsx(
                    "w-full text-left px-3 py-2 rounded-lg text-sm font-medium transition-colors flex items-center gap-1.5",
                    activeCategory === "terminal"
                      ? "bg-accent text-accent-foreground"
                      : "text-foreground-secondary hover:bg-hover hover:text-foreground",
                  )}
                >
                  <Terminal className="w-4 h-4" />
                  ターミナル
                </button>
              )}
              {isElectronRenderer() && (
                <button
                  onClick={() => setActiveCategory("power")}
                  className={clsx(
                    "w-full text-left px-3 py-2 rounded-lg text-sm font-medium transition-colors flex items-center gap-1.5",
                    activeCategory === "power"
                      ? "bg-accent text-accent-foreground"
                      : "text-foreground-secondary hover:bg-hover hover:text-foreground",
                  )}
                >
                  <BatteryMedium className="w-4 h-4" />
                  省電力
                </button>
              )}
              <button
                onClick={() => setActiveCategory("dictionary")}
                className={clsx(
                  "w-full text-left px-3 py-2 rounded-lg text-sm font-medium transition-colors flex items-center gap-1.5",
                  activeCategory === "dictionary"
                    ? "bg-accent text-accent-foreground"
                    : "text-foreground-secondary hover:bg-hover hover:text-foreground",
                )}
              >
                <BookOpen className="w-4 h-4" />
                辞典
              </button>
              <div className="my-2 border-t border-border" />
              <button
                onClick={() => setActiveCategory("about")}
                className={clsx(
                  "w-full text-left px-3 py-2 rounded-lg text-sm font-medium transition-colors",
                  activeCategory === "about"
                    ? "bg-accent text-accent-foreground"
                    : "text-foreground-secondary hover:bg-hover hover:text-foreground",
                )}
              >
                illusionsについて
              </button>
            </nav>
          </div>

          {/* Right content */}
          <div
            className={clsx(
              "flex-1 p-6",
              activeCategory === "pos-highlight" ? "overflow-hidden" : "overflow-y-auto",
            )}
          >
            {activeCategory === "account" && <AccountSettingsTab />}
            {activeCategory === "editor" && <TypographySettingsTab />}
            {activeCategory === "vertical" && <VerticalSettingsTab />}
            {activeCategory === "pos-highlight" && <PosHighlightSettingsTab />}
            {activeCategory === "linting" && <LintingSettingsTab />}
            {activeCategory === "speech" && <SpeechSettingsTab />}
            {activeCategory === "keymap" && <KeymapSettingsTab />}
            {activeCategory === "terminal" && <TerminalSettingsTab />}
            {activeCategory === "power" && <PowerSettingsTab />}
            {activeCategory === "dictionary" && <DictSettingsTab />}
            {activeCategory === "about" && <AboutSection />}
          </div>
        </div>
      </div>
    </div>
  );
}
