import type { HTMLAttributes } from "react";
import clsx from "clsx";
type Tone = "neutral" | "info" | "success" | "warning" | "danger";
export interface AlertProps extends HTMLAttributes<HTMLDivElement> {
  tone?: Tone;
}
const tones: Record<Tone, string> = {
  neutral: "border-border bg-background-secondary",
  info: "border-info/40 bg-info/10",
  success: "border-success/40 bg-success/10",
  warning: "border-warning/40 bg-warning/10",
  danger: "border-error/40 bg-error/10",
};
export function Alert({ tone = "neutral", className, ...props }: AlertProps) {
  return (
    <div
      role="alert"
      className={clsx("rounded-md border px-3 py-2 text-sm", tones[tone], className)}
      {...props}
    />
  );
}
