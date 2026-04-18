"use client";

import type React from "react";

export interface SettingsSectionProps {
  title?: string;
  description?: string;
  children: React.ReactNode;
}

/**
 * Groups related settings fields under an optional heading and description.
 * Use this as the top-level wrapper inside a settings tab body.
 */
export default function SettingsSection({
  title,
  description,
  children,
}: SettingsSectionProps): React.ReactElement {
  return (
    <section className="space-y-4">
      {(title || description) && (
        <header>
          {title && <h3 className="text-sm font-semibold text-foreground">{title}</h3>}
          {description && (
            <p className="mt-0.5 text-xs text-foreground-tertiary">{description}</p>
          )}
        </header>
      )}
      {children}
    </section>
  );
}
