import type { HTMLAttributes } from "react";
import clsx from "clsx";
type Tone = "neutral" | "info" | "success" | "warning" | "danger";
export interface BadgeProps extends HTMLAttributes<HTMLSpanElement> {
  tone?: Tone;
}
const tones: Record<Tone, string> = {
  neutral: "bg-background-tertiary text-foreground-secondary",
  info: "bg-info/15 text-info",
  success: "bg-success/15 text-success",
  warning: "bg-warning/15 text-warning",
  danger: "bg-error/15 text-error",
};
export function Badge({ tone = "neutral", className, ...props }: BadgeProps) {
  return (
    <span
      className={clsx(
        "inline-flex rounded-full px-2 py-0.5 text-xs font-medium",
        tones[tone],
        className,
      )}
      {...props}
    />
  );
}
