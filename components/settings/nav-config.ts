import {
  UserCircle,
  Bot,
  SpellCheck,
  BookOpen,
  Settings,
  Columns2,
  Highlighter,
  Keyboard,
  AudioLines,
  Terminal,
  BatteryMedium,
  Info,
} from "lucide-react";

import type { SettingsNavGroup } from "@/components/settings/primitives";
import { isElectronRenderer } from "@/lib/utils/runtime-env";

import type { SettingsCategory } from "./settings-category";

/**
 * Build the grouped navigation configuration for the settings modal.
 *
 * Electron-only tabs are marked `hidden` on Web via `isElectronRenderer()`.
 * The runtime check must happen at call-time (not at module load) because
 * `isElectronRenderer` depends on `window`.
 */
export function buildSettingsNavConfig(): ReadonlyArray<SettingsNavGroup<SettingsCategory>> {
  const isElectron = isElectronRenderer();
  return [
    {
      label: "AI/LLM",
      items: [{ id: "ai-connection", label: "AI API 接続", icon: Bot }],
    },
    {
      label: "アカウント",
      items: [{ id: "account", label: "アカウント", icon: UserCircle }],
    },
    {
      label: "校正と文体・辞書",
      separator: true,
      items: [
        { id: "linting", label: "校正と文体", icon: SpellCheck },
        { id: "dictionary", label: "辞書", icon: BookOpen },
      ],
    },
    {
      label: "エディタと表示",
      items: [
        { id: "typography", label: "文字組み", icon: Settings },
        { id: "scroll", label: "スクロールと縦書き", icon: Columns2 },
        { id: "pos-highlight", label: "品詞ハイライト", icon: Highlighter },
        { id: "keymap", label: "キーマップ", icon: Keyboard },
        { id: "terminal", label: "ターミナル", icon: Terminal, hidden: !isElectron },
      ],
    },
    {
      label: "入出力",
      items: [{ id: "speech", label: "音声読み上げ", icon: AudioLines }],
    },
    {
      label: "システム",
      items: [{ id: "power", label: "省電力", icon: BatteryMedium, hidden: !isElectron }],
    },
    {
      label: "ヘルプ",
      separator: true,
      items: [{ id: "about", label: "illusions について", icon: Info }],
    },
  ];
}
