"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { X } from "lucide-react";
import clsx from "clsx";

import { isElectronRenderer } from "@/lib/utils/runtime-env";
import { SettingsNav } from "./settings/primitives";
import { buildSettingsNavConfig } from "./settings/nav-config";
import { buildSettingsTabRegistry } from "./settings/tab-registry";
import { resolveLegacyCategory, type SettingsCategory } from "./settings/settings-category";

export type { SettingsCategory } from "./settings/settings-category";

/** Focusable element selectors — intentionally conservative */
const FOCUSABLE_SELECTORS = [
  "a[href]",
  "button:not([disabled])",
  "input:not([disabled])",
  "select:not([disabled])",
  "textarea:not([disabled])",
  "[tabindex]:not([tabindex='-1'])",
].join(", ");

function getFocusableElements(container: HTMLElement): HTMLElement[] {
  return Array.from(container.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTORS)).filter(
    (el) => !el.closest("[inert]") && getComputedStyle(el).display !== "none",
  );
}

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  /** Open modal on a specific tab. Legacy category values are normalized. */
  initialCategory?: SettingsCategory;
}

export default function SettingsModal({ isOpen, onClose, initialCategory }: SettingsModalProps) {
  const isElectron = isElectronRenderer();

  const navGroups = useMemo(() => buildSettingsNavConfig(), []);
  const tabRegistry = useMemo(() => buildSettingsTabRegistry({ isElectron }), [isElectron]);

  const [activeCategory, setActiveCategory] = useState<SettingsCategory>(() =>
    resolveLegacyCategory(initialCategory, { isElectron }),
  );
  const modalRef = useRef<HTMLDivElement>(null);
  /** Element that had focus before the modal opened — restored on close. */
  const returnFocusRef = useRef<HTMLElement | null>(null);
  const headingId = "settings-modal-heading";

  useEffect(() => {
    if (isOpen && initialCategory) {
      setActiveCategory(resolveLegacyCategory(initialCategory, { isElectron }));
    }
  }, [isOpen, initialCategory, isElectron]);

  // Body scroll lock
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = "hidden";
      return () => {
        document.body.style.overflow = "";
      };
    }
  }, [isOpen]);

  // Capture return-focus target and move focus into modal on open;
  // restore focus to that target on close.
  useEffect(() => {
    if (isOpen) {
      returnFocusRef.current = document.activeElement as HTMLElement | null;

      // Move initial focus to the modal panel after render
      const frame = requestAnimationFrame(() => {
        if (modalRef.current) {
          const first = getFocusableElements(modalRef.current)[0];
          if (first) {
            first.focus();
          } else {
            modalRef.current.focus();
          }
        }
      });

      return () => cancelAnimationFrame(frame);
    } else {
      // Restore focus when modal closes
      if (returnFocusRef.current && typeof returnFocusRef.current.focus === "function") {
        returnFocusRef.current.focus();
        returnFocusRef.current = null;
      }
    }
  }, [isOpen]);

  // Focus trap: Tab / Shift+Tab cycle inside the modal.
  // Escape closes the modal.
  useEffect(() => {
    if (!isOpen) return;

    function handleKeyDown(e: KeyboardEvent): void {
      if (e.key === "Escape") {
        onClose();
        return;
      }

      if (e.key !== "Tab") return;
      if (!modalRef.current) return;

      const focusable = getFocusableElements(modalRef.current);
      if (focusable.length === 0) return;

      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      const active = document.activeElement;

      if (e.shiftKey) {
        if (active === first || !modalRef.current.contains(active)) {
          e.preventDefault();
          last.focus();
        }
      } else {
        if (active === last || !modalRef.current.contains(active)) {
          e.preventDefault();
          first.focus();
        }
      }
    }

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, onClose]);

  // Mark background siblings as inert while the modal is open so that
  // pointer events and AT cannot reach them.
  useEffect(() => {
    if (!isOpen) return;

    const overlay = document.querySelector<HTMLElement>("[data-settings-modal-overlay]");
    if (!overlay) return;

    const siblings: HTMLElement[] = [];
    let node = overlay.parentElement?.firstChild;
    while (node) {
      if (node !== overlay && node instanceof HTMLElement) {
        node.setAttribute("inert", "");
        siblings.push(node);
      }
      node = node.nextSibling;
    }

    return () => {
      for (const el of siblings) {
        el.removeAttribute("inert");
      }
    };
  }, [isOpen]);

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
      data-settings-modal-overlay=""
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 backdrop-blur-sm"
      onClick={handleOverlayClick}
    >
      <div
        ref={modalRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={headingId}
        tabIndex={-1}
        className={clsx(
          "relative w-full h-[80vh] mx-4 rounded-xl bg-background-elevated shadow-xl border border-border flex flex-col transition-[max-width] duration-200",
          isWide ? "max-w-6xl" : "max-w-4xl",
        )}
      >
        <div className="flex-shrink-0 flex items-center justify-between px-6 py-4 border-b border-border">
          <h2 id={headingId} className="text-lg font-medium text-foreground">
            設定
          </h2>
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

          <div className={clsx("flex-1 p-6", isWide ? "overflow-hidden" : "overflow-y-auto")}>
            {ActiveTab ? <ActiveTab /> : null}
          </div>
        </div>
      </div>
    </div>
  );
}
