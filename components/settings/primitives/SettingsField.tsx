"use client";

import type React from "react";
import clsx from "clsx";

export interface SettingsFieldProps {
  label: string;
  description?: string;
  /** Connect the label to the control for a11y. Required when `inline` is true and children are focusable. */
  htmlFor?: string;
  /** Render label and control side-by-side (e.g., toggles). */
  inline?: boolean;
  children: React.ReactNode;
}

/**
 * Standard layout primitive for a single labelled control.
 * - Block mode (default): label stacks above the control
 * - Inline mode: label left, control right (for toggles)
 */
export default function SettingsField({
  label,
  description,
  htmlFor,
  inline = false,
  children,
}: SettingsFieldProps): React.ReactElement {
  if (inline) {
    return (
      <div className="flex items-center justify-between gap-4">
        <div className="min-w-0">
          <label
            htmlFor={htmlFor}
            className="block text-sm font-medium text-foreground"
          >
            {label}
          </label>
          {description && (
            <p className="mt-0.5 text-xs text-foreground-tertiary">{description}</p>
          )}
        </div>
        <div className="flex-shrink-0">{children}</div>
      </div>
    );
  }

  return (
    <div>
      <label
        htmlFor={htmlFor}
        className={clsx("block text-sm font-medium text-foreground", description ? "mb-1" : "mb-2")}
      >
        {label}
      </label>
      {description && (
        <p className="mb-2 text-xs text-foreground-tertiary">{description}</p>
      )}
      {children}
    </div>
  );
}
