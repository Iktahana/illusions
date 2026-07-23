"use client";

import type React from "react";

import KeymapSettings from "./KeymapSettings";
import { SettingsField, SettingsSection, SettingsToggle } from "./primitives";
import { useKeyboardInputSettings } from "@/contexts/EditorSettingsContext";
import { isMacOS } from "@/lib/utils/runtime-env";

/**
 * Settings tab for keyboard shortcut (keymap) configuration.
 */
export default function KeymapSettingsTab(): React.ReactElement {
  const { allowOptionKeySpecialCharacterInput, onAllowOptionKeySpecialCharacterInputChange } =
    useKeyboardInputSettings();
  const isMac = isMacOS();

  return (
    <div className="space-y-8">
      <SettingsSection title="キーマップ">
        <KeymapSettings />
      </SettingsSection>

      {isMac && (
        <SettingsSection title="入力">
          <SettingsField
            label="Option キーで特殊文字を入力"
            description="Option キーを押して √ や € などの特殊文字を入力できるようにします。オンにすると、一部の Option キーのショートカットは文字入力として扱われます。"
            htmlFor="allow-option-key-special-character-input"
            inline
          >
            <SettingsToggle
              id="allow-option-key-special-character-input"
              checked={allowOptionKeySpecialCharacterInput}
              onChange={onAllowOptionKeySpecialCharacterInputChange}
            />
          </SettingsField>
        </SettingsSection>
      )}
    </div>
  );
}
