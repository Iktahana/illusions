"use client";

import { useState } from "react";
import { Plus, Trash2, Edit2, Check, X, Sparkles } from "lucide-react";
import { getNlpClient } from "@/lib/nlp-client/nlp-client";

interface Character {
  id: string;
  name: string;
  description: string;
  appearance: string;
  personality: string;
  relationships: string;
}

interface CharactersProps {
  content?: string;
}

export default function Characters({ content }: CharactersProps) {
  const [characters, setCharacters] = useState<Character[]>([]);
  const [isAddingNew, setIsAddingNew] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [newCharacter, setNewCharacter] = useState<Partial<Character>>({
    name: "",
    description: "",
    appearance: "",
    personality: "",
    relationships: "",
  });

  const handleAddCharacter = () => {
    if (!newCharacter.name?.trim()) return;

    const character: Character = {
      id: Date.now().toString(),
      name: newCharacter.name.trim(),
      description: newCharacter.description?.trim() || "",
      appearance: newCharacter.appearance?.trim() || "",
      personality: newCharacter.personality?.trim() || "",
      relationships: newCharacter.relationships?.trim() || "",
    };

    setCharacters([...characters, character]);
    setNewCharacter({
      name: "",
      description: "",
      appearance: "",
      personality: "",
      relationships: "",
    });
    setIsAddingNew(false);
  };

  const handleDeleteCharacter = (id: string) => {
    setCharacters(characters.filter((c) => c.id !== id));
    if (expandedId === id) setExpandedId(null);
    if (editingId === id) setEditingId(null);
  };

  const handleUpdateCharacter = (id: string, updates: Partial<Character>) => {
    setCharacters(
      characters.map((c) => (c.id === id ? { ...c, ...updates } : c))
    );
  };

  const handleCancelAdd = () => {
    setIsAddingNew(false);
    setNewCharacter({
      name: "",
      description: "",
      appearance: "",
      personality: "",
      relationships: "",
    });
  };

  const toggleExpand = (id: string) => {
    setExpandedId(expandedId === id ? null : id);
  };

  const handleAutoExtract = async () => {
    if (!content) {
      return;
    }

    try {
      console.log("自動検出開始");
      const nlpClient = getNlpClient();
      const tokens = await nlpClient.tokenizeParagraph(content);

      // Extract proper nouns (固有名詞): pos === "名詞" && pos_detail_1 === "固有名詞"
      const properNouns = new Map<string, boolean>();

      for (const token of tokens) {
        if (token.pos === "名詞" && token.pos_detail_1 === "固有名詞") {
          // Only add if not already exists as a character
          const alreadyExists = characters.some(
            (c) => c.name.toLowerCase() === token.surface.toLowerCase()
          );

          if (!alreadyExists) {
            properNouns.set(token.surface, true);
          }
        }
      }

      // Add extracted names as new characters
      const newNames = Array.from(properNouns.keys());
      for (const name of newNames) {
        const character: Character = {
          id: Date.now().toString() + Math.random(),
          name: name,
          description: "",
          appearance: "",
          personality: "",
          relationships: "",
        };

        setCharacters((prev) => [...prev, character]);
      }

      console.log(`${newNames.length} 名の人物を自動抽出しました`);
    } catch (err) {
      console.error("自動抽出に失敗しました:", err);
    }
  };

  return (
    <div className="h-full bg-background-secondary border-r border-border flex flex-col">
      {/* Header */}
      <div className="p-4 border-b border-border flex items-center justify-between">
        <h2 className="text-lg font-semibold text-foreground">登場人物</h2>
        <button
          onClick={() => setIsAddingNew(true)}
          className="p-1.5 hover:bg-hover rounded-md text-foreground-secondary hover:text-foreground transition-colors"
          title="新しい人物を追加"
        >
          <Plus className="w-4 h-4" />
        </button>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-4 space-y-3">
        {/* 自動検出ボタン */}
        <button
          onClick={handleAutoExtract}
          className="w-full px-4 py-3 bg-accent hover:bg-accent-hover text-white rounded-lg text-sm font-medium transition-colors flex items-center justify-center gap-2"
          title="文章から人物を自動検出"
        >
          <Sparkles className="w-4 h-4" />
          自動検出
        </button>
        {/* 新規追加フォーム */}
        {isAddingNew && (
          <div className="bg-background-elevated border border-border rounded-lg p-3 space-y-2">
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-sm font-semibold text-foreground">新しい人物</h3>
              <div className="flex gap-1">
                <button
                  onClick={handleAddCharacter}
                  className="p-1 hover:bg-hover rounded text-success"
                  title="追加"
                >
                  <Check className="w-4 h-4" />
                </button>
                <button
                  onClick={handleCancelAdd}
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
              onChange={(e) =>
                setNewCharacter({ ...newCharacter, name: e.target.value })
              }
              className="w-full px-2 py-1.5 bg-background border border-border rounded text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-accent"
              autoFocus
            />

            <textarea
              placeholder="簡単な説明"
              value={newCharacter.description || ""}
              onChange={(e) =>
                setNewCharacter({ ...newCharacter, description: e.target.value })
              }
              className="w-full px-2 py-1.5 bg-background border border-border rounded text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-accent resize-none"
              rows={2}
            />

            <textarea
              placeholder="外見"
              value={newCharacter.appearance || ""}
              onChange={(e) =>
                setNewCharacter({ ...newCharacter, appearance: e.target.value })
              }
              className="w-full px-2 py-1.5 bg-background border border-border rounded text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-accent resize-none"
              rows={2}
            />

            <textarea
              placeholder="性格"
              value={newCharacter.personality || ""}
              onChange={(e) =>
                setNewCharacter({ ...newCharacter, personality: e.target.value })
              }
              className="w-full px-2 py-1.5 bg-background border border-border rounded text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-accent resize-none"
              rows={2}
            />

            <textarea
              placeholder="関係性"
              value={newCharacter.relationships || ""}
              onChange={(e) =>
                setNewCharacter({ ...newCharacter, relationships: e.target.value })
              }
              className="w-full px-2 py-1.5 bg-background border border-border rounded text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-accent resize-none"
              rows={2}
            />
          </div>
        )}

        {/* 人物リスト */}
        {characters.length === 0 && !isAddingNew ? (
          <div className="text-center py-8 text-foreground-secondary text-sm">
            <p>まだ登場人物が追加されていません</p>
            <p className="mt-1 text-xs">右上の + ボタンで追加できます</p>
          </div>
        ) : (
          characters.map((character) => (
            <div
              key={character.id}
              className="bg-background-elevated border border-border rounded-lg overflow-hidden"
            >
              {/* Header */}
              <div
                className="p-3 cursor-pointer hover:bg-hover transition-colors"
                onClick={() => toggleExpand(character.id)}
              >
                <div className="flex items-start justify-between">
                  <div className="flex-1 min-w-0">
                    <h3 className="font-semibold text-foreground truncate">
                      {character.name}
                    </h3>
                    {character.description && (
                      <p className="text-sm text-foreground-secondary mt-1 line-clamp-2">
                        {character.description}
                      </p>
                    )}
                  </div>
                  <div className="flex gap-1 ml-2" onClick={(e) => e.stopPropagation()}>
                    <button
                      onClick={() => handleDeleteCharacter(character.id)}
                      className="p-1 hover:bg-background rounded text-foreground-tertiary hover:text-danger transition-colors"
                      title="削除"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              </div>

              {/* Expanded Details */}
              {expandedId === character.id && (
                <div className="border-t border-border p-3 space-y-3 bg-background">
                  {editingId === character.id ? (
                    // Edit Mode
                    <div className="space-y-2">
                      <div className="flex justify-end gap-1 mb-2">
                        <button
                          onClick={() => setEditingId(null)}
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
                          onChange={(e) =>
                            handleUpdateCharacter(character.id, {
                              name: e.target.value,
                            })
                          }
                          className="w-full px-2 py-1.5 bg-background-elevated border border-border rounded text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-accent"
                        />
                      </div>

                      <div>
                        <label className="text-xs font-medium text-foreground-secondary mb-1 block">
                          説明
                        </label>
                        <textarea
                          value={character.description}
                          onChange={(e) =>
                            handleUpdateCharacter(character.id, {
                              description: e.target.value,
                            })
                          }
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
                          onChange={(e) =>
                            handleUpdateCharacter(character.id, {
                              appearance: e.target.value,
                            })
                          }
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
                          onChange={(e) =>
                            handleUpdateCharacter(character.id, {
                              personality: e.target.value,
                            })
                          }
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
                          onChange={(e) =>
                            handleUpdateCharacter(character.id, {
                              relationships: e.target.value,
                            })
                          }
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
                          onClick={() => setEditingId(character.id)}
                          className="p-1 hover:bg-hover rounded text-foreground-secondary hover:text-foreground"
                          title="編集"
                        >
                          <Edit2 className="w-3.5 h-3.5" />
                        </button>
                      </div>

                      {character.appearance && (
                        <div>
                          <h4 className="text-xs font-semibold text-foreground-secondary mb-1">
                            外見
                          </h4>
                          <p className="text-sm text-foreground whitespace-pre-wrap">
                            {character.appearance}
                          </p>
                        </div>
                      )}

                      {character.personality && (
                        <div>
                          <h4 className="text-xs font-semibold text-foreground-secondary mb-1">
                            性格
                          </h4>
                          <p className="text-sm text-foreground whitespace-pre-wrap">
                            {character.personality}
                          </p>
                        </div>
                      )}

                      {character.relationships && (
                        <div>
                          <h4 className="text-xs font-semibold text-foreground-secondary mb-1">
                            関係性
                          </h4>
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
          ))
        )}
      </div>
    </div>
  );
}
