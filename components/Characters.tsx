"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import { Plus, X, Sparkles, Loader2 } from "lucide-react";

import { getNlpClient } from "@/lib/nlp-client/nlp-client";
import { fetchAppState, persistAppState } from "@/lib/storage/app-state-manager";
import { useCharacterExtractionSettings } from "@/contexts/EditorSettingsContext";
import CharacterCard from "./Characters/CharacterCard";
import NewCharacterForm from "./Characters/NewCharacterForm";
import type { Character } from "./Characters/types";

interface CharactersProps {
  content?: string;
}

export default function Characters({ content }: CharactersProps) {
  const {
    characterExtractionBatchSize,
    characterExtractionConcurrency,
  } = useCharacterExtractionSettings();

  const [characters, setCharacters] = useState<Character[]>([]);
  const [isLoaded, setIsLoaded] = useState(false);
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

  // Restore characters from persistent storage on mount
  useEffect(() => {
    const restore = async () => {
      try {
        const appState = await fetchAppState();
        if (appState?.characters && appState.characters.length > 0) {
          setCharacters(appState.characters);
        }
      } catch (err) {
        console.error("Failed to restore characters:", err);
      } finally {
        setIsLoaded(true);
      }
    };
    void restore();
  }, []);

  // Persist characters to storage on change (debounced)
  useEffect(() => {
    if (!isLoaded) return; // skip initial empty state

    const timer = setTimeout(() => {
      void persistAppState({ characters }).catch((err) => {
        console.error("Failed to persist characters:", err);
      });
    }, 500);

    return () => clearTimeout(timer);
  }, [characters, isLoaded]);

  // Extraction state
  const [isExtracting, setIsExtracting] = useState(false);
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
  /** Auto-extract: use NLP-based extraction (LLM extraction will be available via online API in the future) */
  const handleAutoExtract = useCallback(async () => {
    if (!content) return;
    await handleNlpExtract();
  }, [content, handleNlpExtract]);

  /** Cancel ongoing extraction */
  const handleCancelExtract = useCallback(() => {
    abortControllerRef.current?.abort();
  }, []);

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
            処理中...
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
          <NewCharacterForm
            newCharacter={newCharacter}
            onCharacterChange={setNewCharacter}
            onAdd={handleAddCharacter}
            onCancel={handleCancelAdd}
          />
        )}

        {/* Character list */}
        {characters.length === 0 && !isAddingNew ? (
          <div className="text-center py-8 text-foreground-secondary text-sm">
            <p>まだ登場人物が追加されていません</p>
            <p className="mt-1 text-xs">右上の + ボタンで追加できます</p>
          </div>
        ) : (
          characters.map((character) => (
            <CharacterCard
              key={character.id}
              character={character}
              editingId={editingId}
              expandedId={expandedId}
              onToggleExpand={toggleExpand}
              onDelete={handleDeleteCharacter}
              onUpdate={handleUpdateCharacter}
              onSetEditingId={setEditingId}
            />
          ))
        )}
      </div>
    </div>
  );
}
