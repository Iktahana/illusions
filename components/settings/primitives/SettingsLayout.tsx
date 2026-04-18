"use client";

import type React from "react";
import clsx from "clsx";

export interface SettingsLayoutProps {
  /** The navigation column (e.g., <SettingsNav ... />). */
  nav: React.ReactNode;
  children: React.ReactNode;
  /**
   * When true, the content area uses overflow-hidden (e.g., pos-highlight
   * palette that scrolls its own inner panes). Default: overflow-y-auto.
   * The enclosing modal's max-width is controlled by the caller.
   */
  wideContent?: boolean;
}

/**
 * Two-column layout for the settings surface: nav on the left,
 * content on the right. Stateless — category state lives with the caller.
 */
export default function SettingsLayout({
  nav,
  children,
  wideContent = false,
}: SettingsLayoutProps): React.ReactElement {
  return (
    <div className="flex flex-1 overflow-hidden">
      {nav}
      <div
        className={clsx(
          "flex-1 p-6",
          wideContent ? "overflow-hidden" : "overflow-y-auto",
        )}
      >
        {children}
      </div>
    </div>
  );
}
