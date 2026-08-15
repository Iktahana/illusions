import { forwardRef } from "react";
import type { SelectHTMLAttributes } from "react";
import clsx from "clsx";
export interface SelectProps extends Omit<SelectHTMLAttributes<HTMLSelectElement>, "size"> {
  size?: "sm" | "md";
  invalid?: boolean;
}
export const Select = forwardRef<HTMLSelectElement, SelectProps>(function Select(
  { className, size = "sm", invalid, ...props },
  ref,
) {
  return (
    <select
      ref={ref}
      aria-invalid={invalid || undefined}
      className={clsx(
        "w-full border bg-background px-2 text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)] disabled:cursor-not-allowed disabled:opacity-50",
        size === "sm" ? "h-7 rounded-md text-sm" : "h-8 rounded-lg text-sm",
        invalid ? "border-error" : "border-border-secondary",
        className,
      )}
      {...props}
    />
  );
});
Select.displayName = "Select";
