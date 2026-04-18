"use client";

import type React from "react";
import clsx from "clsx";

export interface SettingsToggleProps {
  /** DOM id — connect to SettingsField.htmlFor so the label activates this switch. */
  id?: string;
  checked: boolean;
  onChange: (next: boolean) => void;
  disabled?: boolean;
  /**
   * Accessible name when used outside of SettingsField.
   * When wrapped in a SettingsField, omit this prop to prevent screen-reader double-reads.
   */
  "aria-label"?: string;
}

/**
 * Unified toggle switch. Replaces the inline toggle implementations that were
 * copy-pasted across settings tabs (e.g., TypographySettingsTab).
 */
export default function SettingsToggle({
  id,
  checked,
  onChange,
  disabled = false,
  "aria-label": ariaLabel,
}: SettingsToggleProps): React.ReactElement {
  return (
    <button
      type="button"
      id={id}
      role="switch"
      aria-checked={checked}
      aria-label={ariaLabel}
      disabled={disabled}
      onClick={() => {
        if (!disabled) onChange(!checked);
      }}
      className={clsx(
        "relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-1",
        checked ? "bg-accent" : "bg-border-secondary",
        disabled && "cursor-not-allowed opacity-50",
      )}
    >
      <span
        className={clsx(
          "inline-block h-4 w-4 transform rounded-full bg-background transition-transform",
          checked ? "translate-x-6" : "translate-x-1",
        )}
      />
    </button>
  );
}
