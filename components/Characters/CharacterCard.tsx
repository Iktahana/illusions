"use client";

import { Trash2, Edit2, Check } from "lucide-react";
import type { Character } from "./types";

interface CharacterCardProps {
  character: Character;
  editingId: string | null;
  expandedId: string | null;
  onToggleExpand: (id: string) => void;
  onDelete: (id: string) => void;
  onUpdate: (id: string, updates: Partial<Character>) => void;
  onSetEditingId: (id: string | null) => void;
}

export default function CharacterCard({
  character,
  editingId,
  expandedId,
  onToggleExpand,
  onDelete,
  onUpdate,
  onSetEditingId,
}: CharacterCardProps) {
  const isExpanded = expandedId === character.id;
  const isEditing = editingId === character.id;

  return (
    <div className="bg-background-elevated border border-border rounded-lg overflow-hidden">
      {/* Header */}
      <div
        className="p-3 cursor-pointer hover:bg-hover transition-colors"
        onClick={() => onToggleExpand(character.id)}
      >
        <div className="flex items-start justify-between">
          <div className="flex-1 min-w-0">
            <h3 className="font-semibold text-foreground truncate">{character.name}</h3>
            {character.aliases.length > 0 && (
              <p className="text-xs text-foreground-tertiary mt-0.5">
                別名: {character.aliases.join("、")}
              </p>
            )}
            {character.description && (
              <p className="text-sm text-foreground-secondary mt-1 line-clamp-2">
                {character.description}
              </p>
            )}
          </div>
          <div className="flex gap-1 ml-2" onClick={(e) => e.stopPropagation()}>
            <button
              onClick={() => onDelete(character.id)}
              className="p-1 hover:bg-background rounded text-foreground-tertiary hover:text-danger transition-colors"
              title="削除"
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      </div>

      {/* Expanded Details */}
      {isExpanded && (
        <div className="border-t border-border p-3 space-y-3 bg-background">
          {isEditing ? (
            // Edit Mode
            <div className="space-y-2">
              <div className="flex justify-end gap-1 mb-2">
                <button
                  onClick={() => onSetEditingId(null)}
                  className="p-1 hover:bg-hover rounded text-success"
                  title="完了"
                >
                  <Check className="w-4 h-4" />
                </button>
              </div>

              <div>
                <label className="text-xs font-medium text-foreground-secondary mb-1 block">
                  名前
                </label>
                <input
                  type="text"
                  value={character.name}
                  onChange={(e) => onUpdate(character.id, { name: e.target.value })}
                  className="w-full px-2 py-1.5 bg-background-elevated border border-border rounded text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-accent"
                />
              </div>

              <div>
                <label className="text-xs font-medium text-foreground-secondary mb-1 block">
                  説明
                </label>
                <textarea
                  value={character.description}
                  onChange={(e) => onUpdate(character.id, { description: e.target.value })}
                  className="w-full px-2 py-1.5 bg-background-elevated border border-border rounded text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-accent resize-none"
                  rows={2}
                />
              </div>

              <div>
                <label className="text-xs font-medium text-foreground-secondary mb-1 block">
                  外見
                </label>
                <textarea
                  value={character.appearance}
                  onChange={(e) => onUpdate(character.id, { appearance: e.target.value })}
                  className="w-full px-2 py-1.5 bg-background-elevated border border-border rounded text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-accent resize-none"
                  rows={2}
                />
              </div>

              <div>
                <label className="text-xs font-medium text-foreground-secondary mb-1 block">
                  性格
                </label>
                <textarea
                  value={character.personality}
                  onChange={(e) => onUpdate(character.id, { personality: e.target.value })}
                  className="w-full px-2 py-1.5 bg-background-elevated border border-border rounded text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-accent resize-none"
                  rows={2}
                />
              </div>

              <div>
                <label className="text-xs font-medium text-foreground-secondary mb-1 block">
                  関係性
                </label>
                <textarea
                  value={character.relationships}
                  onChange={(e) => onUpdate(character.id, { relationships: e.target.value })}
                  className="w-full px-2 py-1.5 bg-background-elevated border border-border rounded text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-accent resize-none"
                  rows={2}
                />
              </div>
            </div>
          ) : (
            // View Mode
            <div className="space-y-3">
              <div className="flex justify-end">
                <button
                  onClick={() => onSetEditingId(character.id)}
                  className="p-1 hover:bg-hover rounded text-foreground-secondary hover:text-foreground"
                  title="編集"
                >
                  <Edit2 className="w-3.5 h-3.5" />
                </button>
              </div>

              {character.appearance && (
                <div>
                  <h4 className="text-xs font-semibold text-foreground-secondary mb-1">外見</h4>
                  <p className="text-sm text-foreground whitespace-pre-wrap">
                    {character.appearance}
                  </p>
                </div>
              )}

              {character.personality && (
                <div>
                  <h4 className="text-xs font-semibold text-foreground-secondary mb-1">性格</h4>
                  <p className="text-sm text-foreground whitespace-pre-wrap">
                    {character.personality}
                  </p>
                </div>
              )}

              {character.relationships && (
                <div>
                  <h4 className="text-xs font-semibold text-foreground-secondary mb-1">関係性</h4>
                  <p className="text-sm text-foreground whitespace-pre-wrap">
                    {character.relationships}
                  </p>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
