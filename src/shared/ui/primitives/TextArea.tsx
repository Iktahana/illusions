import { forwardRef } from "react";
import type { TextareaHTMLAttributes } from "react";
import clsx from "clsx";
export interface TextAreaProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  size?: "sm" | "md";
  invalid?: boolean;
}
export const TextArea = forwardRef<HTMLTextAreaElement, TextAreaProps>(function TextArea(
  { className, size = "sm", invalid, ...props },
  ref,
) {
  return (
    <textarea
      ref={ref}
      aria-invalid={invalid || undefined}
      className={clsx(
        "w-full border bg-background px-2 py-1.5 text-foreground placeholder:text-foreground-tertiary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)] disabled:cursor-not-allowed disabled:opacity-50",
        size === "sm" ? "rounded-md text-sm" : "rounded-lg text-sm",
        invalid ? "border-error" : "border-border-secondary",
        className,
      )}
      {...props}
    />
  );
});
TextArea.displayName = "TextArea";
