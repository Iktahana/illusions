import { cloneElement, useId } from "react";
import type { ReactElement, ReactNode } from "react";
import clsx from "clsx";

interface FieldControlProps {
  id?: string;
  "aria-describedby"?: string;
}

export interface FieldProps {
  label: ReactNode;
  description?: ReactNode;
  error?: ReactNode;
  required?: boolean;
  htmlFor?: string;
  inline?: boolean;
  children: ReactElement<FieldControlProps>;
  className?: string;
}
export function Field({
  label,
  description,
  error,
  required,
  htmlFor,
  inline,
  children,
  className,
}: FieldProps) {
  const generatedId = useId();
  const descriptionId = `${generatedId}-description`;
  const errorId = `${generatedId}-error`;
  const fieldDescribedBy =
    [description && descriptionId, error && errorId].filter(Boolean).join(" ") || undefined;
  const controlId = htmlFor ?? children.props.id ?? `${generatedId}-control`;
  const describedBy =
    [children.props["aria-describedby"], fieldDescribedBy].filter(Boolean).join(" ") || undefined;
  const control = cloneElement(children, {
    id: controlId,
    "aria-describedby": describedBy,
  });
  const content = (
    <>
      <label htmlFor={controlId} className="block text-sm font-medium text-foreground">
        {label}
        {required && (
          <span aria-hidden className="ml-0.5 text-error">
            *
          </span>
        )}
      </label>
      {description && (
        <p id={descriptionId} className="mt-0.5 text-xs text-foreground-tertiary">
          {description}
        </p>
      )}
      {error && (
        <p id={errorId} className="mt-1 text-xs text-error">
          {error}
        </p>
      )}
    </>
  );
  return (
    <div
      className={clsx(
        inline ? "flex items-center justify-between gap-4" : "space-y-1.5",
        className,
      )}
    >
      {inline ? <div className="min-w-0">{content}</div> : content}
      <div className={inline ? "shrink-0" : undefined}>{control}</div>
    </div>
  );
}
