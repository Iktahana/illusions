"use client";

import { useState, useMemo } from "react";
import { RotateCcw, Edit2 } from "lucide-react";
import clsx from "clsx";

import type { CommandId } from "@/lib/keymap/command-ids";
import type { KeyBinding, ShortcutCategory } from "@/lib/keymap/keymap-types";
import { ALL_COMMAND_IDS } from "@/lib/keymap/command-ids";
import { SHORTCUT_REGISTRY } from "@/lib/keymap/shortcut-registry";
import { formatBinding } from "@/lib/keymap/keymap-utils";
import { useKeymap } from "@/contexts/KeymapContext";
import KeybindingInput from "./KeybindingInput";

/** Japanese display names for each category */
const CATEGORY_LABELS: Record<ShortcutCategory, string> = {
  file: "ファイル",
  edit: "編集",
  format: "書式",
  view: "表示",
  nav: "ナビゲーション",
  panel: "パネル",
  app: "アプリ",
};

const CATEGORY_ORDER: ShortcutCategory[] = ["file", "edit", "format", "view", "nav", "panel", "app"];

export default function KeymapSettings() {
  const { effectiveBindings, overrides, setOverrideBatch, resetOverride, resetAll } = useKeymap();
  const [recording, setRecording] = useState<CommandId | null>(null);

  /** Find all commands that bind to a given binding string (for conflict detection) */
  const bindingConflicts = useMemo(() => {
    const bindingKey = (b: KeyBinding | null): string => {
      if (!b) return "";
      return `${[...b.modifiers].sort().join("+")}_${b.key.toLowerCase()}`;
    };

    const keyToCommands = new Map<string, CommandId[]>();
    for (const id of ALL_COMMAND_IDS) {
      const b = effectiveBindings[id];
      const k = bindingKey(b);
      if (!k) continue;
      const existing = keyToCommands.get(k) ?? [];
      keyToCommands.set(k, [...existing, id]);
    }

    const conflicts = new Map<CommandId, CommandId[]>();
    for (const [, ids] of keyToCommands) {
      if (ids.length > 1) {
        for (const id of ids) {
          conflicts.set(id, ids.filter(x => x !== id));
        }
      }
    }
    return conflicts;
  }, [effectiveBindings]);

  const grouped = useMemo(() => {
    const map = new Map<ShortcutCategory, CommandId[]>();
    for (const cat of CATEGORY_ORDER) map.set(cat, []);
    for (const id of ALL_COMMAND_IDS) {
      const entry = SHORTCUT_REGISTRY[id];
      const list = map.get(entry.category) ?? [];
      list.push(id);
      map.set(entry.category, list);
    }
    return map;
  }, []);

  const handleRecord = async (id: CommandId, binding: KeyBinding) => {
    const bindingKey = (b: KeyBinding): string =>
      `${[...b.modifiers].sort().join("+")}_${b.key.toLowerCase()}`;
    const newKey = bindingKey(binding);

    const updates: Partial<Record<CommandId, KeyBinding | null>> = {};
    for (const otherId of ALL_COMMAND_IDS) {
      if (otherId === id) continue;
      const otherBinding = effectiveBindings[otherId];
      if (otherBinding && bindingKey(otherBinding) === newKey) {
        updates[otherId] = null;
      }
    }
    updates[id] = binding;

    await setOverrideBatch(updates);
    setRecording(null);
  };

  const handleReset = async (id: CommandId) => {
    await resetOverride(id);
  };

  const handleResetAll = async () => {
    await resetAll();
  };

  const isOverridden = (id: CommandId) => id in overrides;

  return (
    <div className="space-y-6">
      {/* Header with reset all button */}
      <div className="flex items-center justify-between">
        <p className="text-sm text-foreground-secondary">
          各コマンドのキーバインドを変更できます。「変更」ボタンを押してキーを入力してください。
        </p>
        <button
          type="button"
          onClick={handleResetAll}
          className="flex items-center gap-1.5 px-3 py-1.5 text-xs rounded border border-border hover:bg-hover transition-colors text-foreground-secondary"
        >
          <RotateCcw className="w-3.5 h-3.5" />
          すべてデフォルトにリセット
        </button>
      </div>

      {/* Commands grouped by category */}
      {CATEGORY_ORDER.map((cat) => {
        const ids = grouped.get(cat) ?? [];
        if (ids.length === 0) return null;

        return (
          <section key={cat}>
            <h3 className="text-xs font-semibold text-foreground-tertiary uppercase tracking-wider mb-2">
              {CATEGORY_LABELS[cat]}
            </h3>
            <div className="rounded-lg border border-border overflow-hidden">
              {ids.map((id, idx) => {
                const entry = SHORTCUT_REGISTRY[id];
                const binding = effectiveBindings[id];
                const conflictWith = bindingConflicts.get(id);
                const modified = isOverridden(id);
                const isRecording = recording === id;

                return (
                  <div
                    key={id}
                    className={clsx(
                      "flex items-center gap-3 px-4 py-2.5 text-sm",
                      idx > 0 && "border-t border-border",
                      "bg-background hover:bg-hover transition-colors"
                    )}
                  >
                    {/* Label */}
                    <span className={clsx("flex-1 text-foreground", modified && "font-medium")}>
                      {entry.label}
                    </span>

                    {/* Conflict warning */}
                    {conflictWith && conflictWith.length > 0 && (
                      <span className="text-xs text-destructive">
                        「{SHORTCUT_REGISTRY[conflictWith[0]].label}」と競合しています
                      </span>
                    )}

                    {/* Binding display or recording input */}
                    {isRecording ? (
                      <KeybindingInput
                        onRecord={(b) => void handleRecord(id, b)}
                        onCancel={() => setRecording(null)}
                      />
                    ) : (
                      <span className={clsx(
                        "font-mono text-xs px-2 py-1 rounded border min-w-[120px] text-center",
                        modified
                          ? "border-accent text-accent bg-accent/10"
                          : "border-border text-foreground-secondary bg-background-elevated"
                      )}>
                        {formatBinding(binding)}
                      </span>
                    )}

                    {/* Action buttons */}
                    {!isRecording && (
                      <div className="flex items-center gap-1">
                        <button
                          type="button"
                          onClick={() => setRecording(id)}
                          className="p-1.5 rounded hover:bg-hover transition-colors text-foreground-secondary hover:text-foreground"
                          title="変更"
                        >
                          <Edit2 className="w-3.5 h-3.5" />
                        </button>
                        {modified && (
                          <button
                            type="button"
                            onClick={() => void handleReset(id)}
                            className="p-1.5 rounded hover:bg-hover transition-colors text-foreground-secondary hover:text-foreground"
                            title="リセット"
                          >
                            <RotateCcw className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </section>
        );
      })}
    </div>
  );
}
