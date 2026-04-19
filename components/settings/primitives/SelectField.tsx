"use client";

import type React from "react";
import { useId } from "react";
import clsx from "clsx";

export interface SelectOption<T extends string> {
  value: T;
  label: string;
  description?: string;
}

export interface SelectFieldProps<T extends string> {
  label: string;
  value: T;
  options: ReadonlyArray<SelectOption<T>>;
  /** "select": native <select>; "radio-cards": radio buttons styled as cards (e.g., scroll direction). */
  variant?: "select" | "radio-cards";
  onChange: (v: T) => void;
  disabled?: boolean;
}

/**
 * Enum-like single-choice input. Two layouts share a single API:
 * native <select> for long lists, radio cards for small sets where each
 * option benefits from its own description.
 */
export default function SelectField<T extends string>({
  label,
  value,
  options,
  variant = "select",
  onChange,
  disabled = false,
}: SelectFieldProps<T>): React.ReactElement {
  const id = useId();

  if (variant === "radio-cards") {
    return (
      <fieldset disabled={disabled}>
        <legend className="mb-2 block text-sm font-medium text-foreground">{label}</legend>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          {options.map((opt) => {
            const selected = opt.value === value;
            return (
              <label
                key={opt.value}
                className={clsx(
                  "flex cursor-pointer flex-col rounded-lg border px-3 py-2 transition-colors",
                  "focus-within:ring-2 focus-within:ring-accent",
                  selected
                    ? "border-accent bg-accent/10"
                    : "border-border-secondary bg-background hover:bg-hover",
                  disabled && "cursor-not-allowed opacity-50",
                )}
              >
                <input
                  type="radio"
                  name={id}
                  value={opt.value}
                  checked={selected}
                  disabled={disabled}
                  onChange={() => onChange(opt.value)}
                  className="sr-only"
                />
                <span className="text-sm font-medium text-foreground">{opt.label}</span>
                {opt.description && (
                  <span className="mt-0.5 text-xs text-foreground-tertiary">{opt.description}</span>
                )}
              </label>
            );
          })}
        </div>
      </fieldset>
    );
  }

  return (
    <div>
      <label htmlFor={id} className="mb-2 block text-sm font-medium text-foreground">
        {label}
      </label>
      <select
        id={id}
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value as T)}
        className="w-full rounded-lg border border-border-secondary bg-background px-3 py-2 text-foreground focus:outline-none focus:ring-2 focus:ring-accent disabled:cursor-not-allowed disabled:opacity-50"
      >
        {options.map((opt) => (
          <option key={opt.value} value={opt.value}>
            {opt.label}
          </option>
        ))}
      </select>
    </div>
  );
}
