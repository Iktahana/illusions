"use client";
import { forwardRef } from "react";
import type { ButtonHTMLAttributes } from "react";
import clsx from "clsx";
export interface ToggleProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, "onChange"> {
  checked: boolean;
  onChange: (checked: boolean) => void;
  indeterminate?: boolean;
}
export const Toggle = forwardRef<HTMLButtonElement, ToggleProps>(function Toggle(
  { checked, onChange, indeterminate, className, disabled, ...props },
  ref,
) {
  const state = indeterminate ? "mixed" : checked;
  return (
    <button
      ref={ref}
      type="button"
      role="switch"
      aria-checked={state}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={clsx(
        "relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)] focus-visible:ring-offset-1 focus-visible:ring-offset-background disabled:cursor-not-allowed disabled:opacity-50",
        indeterminate ? "bg-accent/50" : checked ? "bg-accent" : "bg-border-secondary",
        className,
      )}
      {...props}
    >
      <span
        className={clsx(
          "h-4 w-4 rounded-full bg-background transition-transform",
          indeterminate ? "translate-x-3.5" : checked ? "translate-x-6" : "translate-x-1",
        )}
      />
    </button>
  );
});
Toggle.displayName = "Toggle";
