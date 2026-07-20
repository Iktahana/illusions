"use client";

import type React from "react";

import KeymapSettings from "./KeymapSettings";
import { SettingsSection } from "./primitives";

/**
 * Settings tab for keyboard shortcut (keymap) configuration.
 */
export default function KeymapSettingsTab(): React.ReactElement {
  return (
    <SettingsSection title="キーマップ">
      <KeymapSettings />
    </SettingsSection>
  );
}
