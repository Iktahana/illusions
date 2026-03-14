"use client";

import type { ReactNode, MouseEvent } from "react";

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

/**
 * Reusable frosted-glass modal dialog.
 * Provides a blurred backdrop overlay and a glassmorphism panel.
 */
export default function GlassDialog({
  isOpen,
  onBackdropClick,
  ariaLabel,
  panelClassName,
  children,
}: GlassDialogProps) {
  if (!isOpen) return null;

  function handleBackdropClick(e: MouseEvent<HTMLDivElement>): void {
    if (e.target === e.currentTarget && onBackdropClick) {
      onBackdropClick();
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-md"
      role="dialog"
      aria-modal="true"
      aria-label={ariaLabel}
      onClick={handleBackdropClick}
    >
      <div className={`${GLASS_CLASSES} ${panelClassName ?? DEFAULT_PANEL}`}>
        {children}
      </div>
    </div>
  );
}
