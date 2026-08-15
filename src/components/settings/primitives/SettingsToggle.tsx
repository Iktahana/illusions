"use client";

import type React from "react";
import { Toggle } from "@/shared/ui/primitives";

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
    <Toggle
      id={id}
      checked={checked}
      onChange={onChange}
      disabled={disabled}
      aria-label={ariaLabel}
    />
  );
}
