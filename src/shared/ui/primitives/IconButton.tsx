"use client";

import { forwardRef } from "react";
import type { ButtonHTMLAttributes } from "react";
import clsx from "clsx";
import { Button, type ButtonSize, type ButtonVariant } from "./Button";
export interface IconButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  "aria-label": string;
  variant?: ButtonVariant;
  size?: ButtonSize;
  loading?: boolean;
}
export const IconButton = forwardRef<HTMLButtonElement, IconButtonProps>(function IconButton(
  { className, size = "sm", ...props },
  ref,
) {
  return (
    <Button ref={ref} size={size} className={clsx("aspect-square px-0", className)} {...props} />
  );
});
IconButton.displayName = "IconButton";
