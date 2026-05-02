import type { ComponentType } from "react";

import AboutSection from "./AboutSection";
import AccountSettingsTab from "./AccountSettingsTab";
import AiApiSettingsTab from "./AiApiSettingsTab";
import DictSettingsTab from "./DictSettingsTab";
import KeymapSettingsTab from "./KeymapSettingsTab";
import LintingSettingsTab from "./LintingSettingsTab";
import PosHighlightSettingsTab from "./PosHighlightSettingsTab";
import PowerSettingsTab from "./PowerSettingsTab";
import SpeechSettingsTab from "./SpeechSettingsTab";
import TerminalSettingsTab from "./TerminalSettingsTab";
import TypographySettingsTab from "./TypographySettingsTab";
import VerticalSettingsTab from "./VerticalSettingsTab";

import type { SettingsCategory } from "./settings-category";

export interface TabRegistryEntry {
  component: ComponentType;
  /**
   * When `true`, the modal expands to a wider layout (used for the POS
   * highlight editor's three-column palette).
   */
  wide?: boolean;
}

/**
 * Registry of settings tabs. `Partial<Record<...>>` because Electron-only
 * tabs (`terminal`, `power`) may be absent in the Web build; callers must
 * normalize unavailable categories via `resolveLegacyCategory`.
 */
export type SettingsTabRegistry = Partial<Record<SettingsCategory, TabRegistryEntry>>;

export function buildSettingsTabRegistry(options: { isElectron: boolean }): SettingsTabRegistry {
  const base: SettingsTabRegistry = {
    account: { component: AccountSettingsTab },
    "ai-connection": { component: AiApiSettingsTab },
    linting: { component: LintingSettingsTab },
    dictionary: { component: DictSettingsTab },
    typography: { component: TypographySettingsTab },
    scroll: { component: VerticalSettingsTab },
    "pos-highlight": { component: PosHighlightSettingsTab, wide: true },
    keymap: { component: KeymapSettingsTab },
    speech: { component: SpeechSettingsTab },
    about: { component: AboutSection },
  };
  if (options.isElectron) {
    base.terminal = { component: TerminalSettingsTab };
    base.power = { component: PowerSettingsTab };
  }
  return base;
}
