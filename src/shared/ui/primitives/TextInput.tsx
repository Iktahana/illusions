import { forwardRef } from "react";
import type { InputHTMLAttributes } from "react";
import clsx from "clsx";
export interface TextInputProps extends Omit<InputHTMLAttributes<HTMLInputElement>, "size"> {
  size?: "sm" | "md";
  invalid?: boolean;
}
export const TextInput = forwardRef<HTMLInputElement, TextInputProps>(function TextInput(
  { className, size = "sm", invalid, ...props },
  ref,
) {
  return (
    <input
      ref={ref}
      aria-invalid={invalid || undefined}
      className={clsx(
        "w-full border bg-background px-2 text-foreground placeholder:text-foreground-tertiary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)] disabled:cursor-not-allowed disabled:opacity-50",
        size === "sm" ? "h-7 rounded-md text-sm" : "h-8 rounded-lg text-sm",
        invalid ? "border-error" : "border-border-secondary",
        className,
      )}
      {...props}
    />
  );
});
TextInput.displayName = "TextInput";
