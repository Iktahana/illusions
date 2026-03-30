"use client";

import { Check, X } from "lucide-react";
import type { Character } from "./types";

interface NewCharacterFormProps {
  newCharacter: Partial<Character>;
  onCharacterChange: (updates: Partial<Character>) => void;
  onAdd: () => void;
  onCancel: () => void;
}

export default function NewCharacterForm({
  newCharacter,
  onCharacterChange,
  onAdd,
  onCancel,
}: NewCharacterFormProps) {
  return (
    <div className="bg-background-elevated border border-border rounded-lg p-3 space-y-2">
      <div className="flex items-center justify-between mb-2">
        <h3 className="text-sm font-semibold text-foreground">新しい人物</h3>
        <div className="flex gap-1">
          <button onClick={onAdd} className="p-1 hover:bg-hover rounded text-success" title="追加">
            <Check className="w-4 h-4" />
          </button>
          <button
            onClick={onCancel}
            className="p-1 hover:bg-hover rounded text-foreground-secondary"
            title="キャンセル"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>

      <input
        type="text"
        placeholder="名前 *"
        value={newCharacter.name || ""}
        onChange={(e) => onCharacterChange({ ...newCharacter, name: e.target.value })}
        className="w-full px-2 py-1.5 bg-background border border-border rounded text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-accent"
        autoFocus
      />

      <textarea
        placeholder="簡単な説明"
        value={newCharacter.description || ""}
        onChange={(e) => onCharacterChange({ ...newCharacter, description: e.target.value })}
        className="w-full px-2 py-1.5 bg-background border border-border rounded text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-accent resize-none"
        rows={2}
      />

      <textarea
        placeholder="外見"
        value={newCharacter.appearance || ""}
        onChange={(e) => onCharacterChange({ ...newCharacter, appearance: e.target.value })}
        className="w-full px-2 py-1.5 bg-background border border-border rounded text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-accent resize-none"
        rows={2}
      />

      <textarea
        placeholder="性格"
        value={newCharacter.personality || ""}
        onChange={(e) => onCharacterChange({ ...newCharacter, personality: e.target.value })}
        className="w-full px-2 py-1.5 bg-background border border-border rounded text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-accent resize-none"
        rows={2}
      />

      <textarea
        placeholder="関係性"
        value={newCharacter.relationships || ""}
        onChange={(e) => onCharacterChange({ ...newCharacter, relationships: e.target.value })}
        className="w-full px-2 py-1.5 bg-background border border-border rounded text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-accent resize-none"
        rows={2}
      />
    </div>
  );
}
