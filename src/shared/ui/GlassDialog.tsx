"use client";

import { useEffect, useRef, type ReactNode, type MouseEvent } from "react";

interface GlassDialogProps {
  isOpen: boolean;
  onBackdropClick?: () => void;
  ariaLabel?: string;
  /**
   * Layout classes for the dialog panel (width, padding, etc.).
   * Defaults to "mx-4 w-full max-w-md p-6".
   * Glass effect classes (blur, border, shadow, rounded) are always applied.
   */
  panelClassName?: string;
  children: ReactNode;
}

const GLASS_CLASSES =
  "rounded-xl bg-background-elevated border border-border shadow-2xl animate-scale-in";

const DEFAULT_PANEL = "mx-4 w-full max-w-md p-6";

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

/**
 * Reusable frosted-glass modal dialog.
 * Provides a blurred backdrop overlay and a glassmorphism panel.
 * Pressing Escape closes the dialog (when onBackdropClick is provided).
 * Implements a focus trap, initial focus, and background inert per #1881.
 */
export default function GlassDialog({
  isOpen,
  onBackdropClick,
  ariaLabel,
  panelClassName,
  children,
}: GlassDialogProps) {
  const dialogRef = useRef<HTMLDivElement>(null);
  /** Element that had focus before the dialog opened — restored on close. */
  const returnFocusRef = useRef<HTMLElement | null>(null);

  // Capture return-focus target and move focus into dialog on open;
  // restore focus to that target on close.
  useEffect(() => {
    if (isOpen) {
      returnFocusRef.current = document.activeElement as HTMLElement | null;

      // Move initial focus to the first focusable element in the panel
      const frame = requestAnimationFrame(() => {
        if (dialogRef.current) {
          const first = getFocusableElements(dialogRef.current)[0];
          if (first) {
            first.focus();
          } else {
            dialogRef.current.focus();
          }
        }
      });

      return () => cancelAnimationFrame(frame);
    } else {
      // Restore focus when dialog closes
      if (returnFocusRef.current && typeof returnFocusRef.current.focus === "function") {
        returnFocusRef.current.focus();
        returnFocusRef.current = null;
      }
    }
  }, [isOpen]);

  // Focus trap: Tab / Shift+Tab cycle inside the dialog.
  // Escape closes the dialog.
  useEffect(() => {
    if (!isOpen) return;

    function handleKeyDown(e: KeyboardEvent): void {
      if (e.key === "Escape") {
        if (onBackdropClick) onBackdropClick();
        return;
      }

      if (e.key !== "Tab") return;
      if (!dialogRef.current) return;

      const focusable = getFocusableElements(dialogRef.current);
      if (focusable.length === 0) return;

      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      const active = document.activeElement;

      if (e.shiftKey) {
        if (active === first || !dialogRef.current.contains(active)) {
          e.preventDefault();
          last.focus();
        }
      } else {
        if (active === last || !dialogRef.current.contains(active)) {
          e.preventDefault();
          first.focus();
        }
      }
    }

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, onBackdropClick]);

  // Mark background siblings as inert while the dialog is open so that
  // pointer events and AT cannot reach them.
  useEffect(() => {
    if (!isOpen) return;

    const overlay = document.querySelector<HTMLElement>("[data-glass-dialog-overlay]");
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

  function handleBackdropClick(e: MouseEvent<HTMLDivElement>): void {
    if (e.target === e.currentTarget && onBackdropClick) {
      onBackdropClick();
    }
  }

  return (
    <div
      data-glass-dialog-overlay=""
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-md"
      onClick={handleBackdropClick}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-label={ariaLabel}
        tabIndex={-1}
        className={`${GLASS_CLASSES} ${panelClassName ?? DEFAULT_PANEL}`}
      >
        {children}
      </div>
    </div>
  );
}
