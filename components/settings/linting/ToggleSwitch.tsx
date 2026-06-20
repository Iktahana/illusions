"use client";

import type React from "react";
import { Minus } from "lucide-react";
import clsx from "clsx";

export interface ToggleSwitchProps {
  /** Fully-on state. Ignored for visuals when `indeterminate` is true. */
  checked: boolean;
  /**
   * Partial state — some but not all members are enabled. Renders a distinct
   * "mixed" appearance (centered knob with a minus mark) and reports
   * `aria-checked="mixed"`. Clicking still calls `onChange`; the caller
   * decides the resulting state (conventionally: mixed → enable all).
   */
  indeterminate?: boolean;
  onChange: () => void;
  disabled?: boolean;
  /** Accessible label (required — these switches have no visible text). */
  ariaLabel: string;
  title?: string;
}

/**
 * Tri-state toggle switch.
 *
 * Three visually distinct states:
 *  - off          → muted track, knob left
 *  - on           → accent track, knob right
 *  - indeterminate → half-accent track, knob centered with a minus mark
 *
 * Used for the ruleset master toggle (where "7/21 enabled" must read as a
 * partial state, not off) and individual rule rows (always binary there).
 */
export default function ToggleSwitch({
  checked,
  indeterminate = false,
  onChange,
  disabled,
  ariaLabel,
  title,
}: ToggleSwitchProps): React.ReactElement {
  const state = indeterminate ? "indeterminate" : checked ? "on" : "off";

  return (
    <button
      type="button"
      role="switch"
      aria-checked={indeterminate ? "mixed" : checked}
      aria-label={ariaLabel}
      title={title}
      onClick={onChange}
      disabled={disabled}
      className={clsx(
        "relative inline-flex h-5 w-9 items-center rounded-full transition-colors flex-shrink-0 disabled:cursor-not-allowed",
        state === "on" && "bg-accent",
        state === "off" && "bg-foreground-muted",
        state === "indeterminate" && "bg-accent/50",
      )}
    >
      <span
        className={clsx(
          "inline-flex items-center justify-center h-3.5 w-3.5 transform rounded-full transition-transform shadow-sm",
          state === "on" && "translate-x-5 bg-accent-foreground",
          state === "off" && "translate-x-0.5 bg-white",
          state === "indeterminate" && "translate-x-[11px] bg-white",
        )}
      >
        {state === "indeterminate" && <Minus className="h-2.5 w-2.5 text-accent" strokeWidth={3} />}
      </span>
    </button>
  );
}
