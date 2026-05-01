"use client";

import type React from "react";
import { useId } from "react";

export interface SliderFieldProps {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  /** Formats the inline value suffix shown next to the label (e.g., "120%", "1.5em"). */
  formatValue?: (v: number) => string;
  onChange: (v: number) => void;
  disabled?: boolean;
}

/**
 * Range slider with inline value display. Covers fontScale, lineHeight,
 * paragraphSpacing, scrollSensitivity, speechRate, etc.
 */
export default function SliderField({
  label,
  value,
  min,
  max,
  step,
  formatValue,
  onChange,
  disabled = false,
}: SliderFieldProps): React.ReactElement {
  const id = useId();
  const formatted = formatValue ? formatValue(value) : String(value);

  return (
    <div>
      <label htmlFor={id} className="mb-2 block text-sm font-medium text-foreground">
        {label}: {formatted}
      </label>
      <input
        id={id}
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(Number(e.target.value))}
        className="w-full disabled:cursor-not-allowed disabled:opacity-50"
      />
    </div>
  );
}
