"use client";

import { useState, useRef, useCallback } from "react";
import { Plus, Trash2, Edit2, Check, X, Sparkles, Loader2 } from "lucide-react";

import { CharacterExtractor } from "@/lib/character-extraction";
import type { ExtractionProgress } from "@/lib/character-extraction";
import { getLlmClient } from "@/lib/llm-client/llm-client";
import { LlmController } from "@/lib/linting/llm-controller";
import { getNlpClient } from "@/lib/nlp-client/nlp-client";
import { useLlmSettings } from "@/contexts/EditorSettingsContext";

interface Character {
  id: string;
  name: string;
  aliases: string[];
  description: string;
  appearance: string;
  personality: string;
  relationships: string;
}

interface CharactersProps {
  content?: string;
}

export default function Characters({ content }: CharactersProps) {
  const {
    llmEnabled,
    llmModelId,
    characterExtractionBatchSize,
    characterExtractionConcurrency,
  } = useLlmSettings();

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

  // LLM extraction state
  const [isExtracting, setIsExtracting] = useState(false);
  const [extractionProgress, setExtractionProgress] =
    useState<ExtractionProgress | null>(null);
  const [extractionError, setExtractionError] = useState<string | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);

  const handleAddCharacter = () => {
    if (!newCharacter.name?.trim()) return;

    const character: Character = {
      id: Date.now().toString(),
      name: newCharacter.name.trim(),
      aliases: [],
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

  /** NLP-based extraction fallback (kuromoji proper noun detection) */
  const handleNlpExtract = useCallback(async () => {
    if (!content) return;

    try {
      const nlpClient = getNlpClient();
      const tokens = await nlpClient.tokenizeParagraph(content);

      const properNouns = new Map<string, boolean>();

      for (const token of tokens) {
        if (token.pos === "名詞" && token.pos_detail_1 === "固有名詞") {
          const alreadyExists = characters.some(
            (c) => c.name.toLowerCase() === token.surface.toLowerCase()
          );

          if (!alreadyExists) {
            properNouns.set(token.surface, true);
          }
        }
      }

      const newNames = Array.from(properNouns.keys());
      const newChars: Character[] = newNames.map((name) => ({
        id: Date.now().toString() + Math.random(),
        name,
        aliases: [],
        description: "",
        appearance: "",
        personality: "",
        relationships: "",
      }));

      if (newChars.length > 0) {
        setCharacters((prev) => [...prev, ...newChars]);
      }
    } catch (err) {
      console.error("NLP auto-extraction failed:", err);
      setExtractionError("固有名詞の抽出に失敗しました");
    }
  }, [content, characters]);

  /** LLM-based extraction with batch decoding */
  const handleLlmExtract = useCallback(async () => {
    if (!content) return;

    setIsExtracting(true);
    setExtractionProgress(null);
    setExtractionError(null);

    const abortController = new AbortController();
    abortControllerRef.current = abortController;

    try {
      const llmClient = getLlmClient();
      const controller = new LlmController(llmClient, llmModelId);

      await controller.requestValidation(async () => {
        const paragraphs = content
          .split(/\n+/)
          .map((p) => p.trim())
          .filter((p) => p.length > 0);

        if (paragraphs.length === 0) return;

        const extractor = new CharacterExtractor(llmClient);
        const result = await extractor.extract(paragraphs, {
          batchSize: characterExtractionBatchSize,
          concurrency: characterExtractionConcurrency,
          signal: abortController.signal,
          onProgress: setExtractionProgress,
        });

        // Merge with existing characters, avoiding duplicates
        const newChars = result
          .filter(
            (ec) =>
              !characters.some(
                (c) =>
                  c.name === ec.name ||
                  ec.aliases.some(
                    (a) => a.toLowerCase() === c.name.toLowerCase()
                  )
              )
          )
          .map((ec) => ({
            id: Date.now().toString() + Math.random(),
            name: ec.name,
            aliases: ec.aliases,
            description: ec.description,
            appearance: "",
            personality: "",
            relationships: "",
          }));

        if (newChars.length > 0) {
          setCharacters((prev) => [...prev, ...newChars]);
        }
      });
    } catch (err) {
      if ((err as Error).name !== "AbortError") {
        setExtractionError("LLMによる抽出に失敗しました");
        console.error("LLM character extraction failed:", err);
      }
    } finally {
      setIsExtracting(false);
      setExtractionProgress(null);
      abortControllerRef.current = null;
    }
  }, [
    content,
    characters,
    llmModelId,
    characterExtractionBatchSize,
    characterExtractionConcurrency,
  ]);

  /** Auto-extract: use LLM if available, otherwise fall back to NLP */
  const handleAutoExtract = useCallback(async () => {
    if (!content) return;

    const llmClient = getLlmClient();
    if (llmEnabled && llmClient.isAvailable()) {
      await handleLlmExtract();
    } else {
      await handleNlpExtract();
    }
  }, [content, llmEnabled, handleLlmExtract, handleNlpExtract]);

  /** Cancel ongoing extraction */
  const handleCancelExtract = useCallback(() => {
    abortControllerRef.current?.abort();
  }, []);

  /** Format progress text */
  const progressText = extractionProgress
    ? extractionProgress.phase === "extracting"
      ? `抽出中... ${extractionProgress.current}/${extractionProgress.total}`
      : `統合中... ${extractionProgress.current}/${extractionProgress.total}`
    : "処理中...";

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
        {/* Auto-extract / Cancel button */}
        {isExtracting ? (
          <button
            onClick={handleCancelExtract}
            className="w-full px-4 py-3 bg-red-500 hover:bg-red-600 text-white rounded-lg text-sm font-medium transition-colors flex items-center justify-center gap-2"
            title="抽出をキャンセル"
          >
            <Loader2 className="w-4 h-4 animate-spin" />
            {progressText}
          </button>
        ) : (
          <button
            onClick={() => void handleAutoExtract()}
            disabled={!content}
            className="w-full px-4 py-3 bg-accent hover:bg-accent-hover text-white rounded-lg text-sm font-medium transition-colors flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
            title="文章から人物を自動検出"
          >
            <Sparkles className="w-4 h-4" />
            自動検出
          </button>
        )}

        {/* Extraction error banner */}
        {extractionError && (
          <div className="flex items-center justify-between bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg px-3 py-2">
            <p className="text-xs text-red-600 dark:text-red-400">
              {extractionError}
            </p>
            <button
              onClick={() => setExtractionError(null)}
              className="p-0.5 hover:bg-red-100 dark:hover:bg-red-900/40 rounded text-red-500"
            >
              <X className="w-3 h-3" />
            </button>
          </div>
        )}

        {/* New character form */}
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

        {/* Character list */}
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
