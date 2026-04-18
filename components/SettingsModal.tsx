"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { X } from "lucide-react";
import clsx from "clsx";

import { isElectronRenderer } from "@/lib/utils/runtime-env";
import { SettingsNav } from "./settings/primitives";
import { buildSettingsNavConfig } from "./settings/nav-config";
import { buildSettingsTabRegistry } from "./settings/tab-registry";
import {
  resolveLegacyCategory,
  type SettingsCategory,
} from "./settings/settings-category";

export type { SettingsCategory } from "./settings/settings-category";

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  /** Open modal on a specific tab. Legacy category values are normalized. */
  initialCategory?: SettingsCategory;
}

export default function SettingsModal({ isOpen, onClose, initialCategory }: SettingsModalProps) {
  const isElectron = isElectronRenderer();

  const navGroups = useMemo(() => buildSettingsNavConfig(), []);
  const tabRegistry = useMemo(
    () => buildSettingsTabRegistry({ isElectron }),
    [isElectron],
  );

  const [activeCategory, setActiveCategory] = useState<SettingsCategory>(() =>
    resolveLegacyCategory(initialCategory, { isElectron }),
  );
  const modalRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (isOpen && initialCategory) {
      setActiveCategory(resolveLegacyCategory(initialCategory, { isElectron }));
    }
  }, [isOpen, initialCategory, isElectron]);

  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = "hidden";
      return () => {
        document.body.style.overflow = "";
      };
    }
  }, [isOpen]);

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

  const entry = tabRegistry[activeCategory] ?? tabRegistry.account;
  const ActiveTab = entry?.component;
  const isWide = entry?.wide ?? false;

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
          isWide ? "max-w-6xl" : "max-w-4xl",
        )}
      >
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

        <div className="flex-1 flex overflow-hidden">
          <SettingsNav
            groups={navGroups}
            active={activeCategory}
            onSelect={setActiveCategory}
            aria-label="設定カテゴリ"
          />

          <div
            className={clsx("flex-1 p-6", isWide ? "overflow-hidden" : "overflow-y-auto")}
          >
            {ActiveTab ? <ActiveTab /> : null}
          </div>
        </div>
      </div>
    </div>
  );
}
